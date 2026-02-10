/**
 * Talent API: token auth via query param ?token=... (e.g. GET /session) or header X-Invite-Token.
 * Token must match the invite for the requested interview (invite_id).
 */
import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool";
import { requireTalentToken, requireTalentTokenAndInterview } from "../../middlewares/talentAuth";
import { validateBody } from "../../middlewares/validate";
import { HttpError } from "../../utils/httpError";
import {
  appendEvent,
  getAssistantResponseForClientEvent,
  getEventsAndState,
  insertEventInTx,
  updateInterviewDenormalized
} from "../../services/orchestration/eventStore";
import { loadSchema, getNextSectionId } from "../../services/orchestration/schema";
import { buildInterviewSnapshot, type SnapshotEvent } from "../../services/orchestration/snapshot";
import {
  decideNextPrompt,
  getLastCandidateMessageInSection,
  getRecentPromptTextsInSection,
  getTranscriptForPreviousSections
} from "../../services/orchestration/interviewer";
import { generateFollowUpQuestion } from "../../services/interviewer/followUp";
import { getMock1Spec } from "../../specs/mock-1";
import { evaluateAssistantRequest } from "../../services/assistant/policy";
import { generateAssistantResponse } from "../../services/assistant/llm";
import { postprocessResponse } from "../../services/assistant/postprocess";
import { codingRouter } from "./coding";
import { getSubmittedProblemIds } from "../../coding/submissions";
import { getProblemSummaries } from "../../coding/problems";
import type { ReducedState } from "../../services/orchestration/state";

const ENGINE_VERSION = "engine-v1";

function augmentSnapshotWithCoding(
  interviewId: string,
  state: ReducedState,
  snapshot: Record<string, unknown>
): void {
  if (state.current_section_id !== "section_coding") return;
  const submittedIds = getSubmittedProblemIds(interviewId);
  const problemIds = getProblemSummaries().map((p) => p.id);
  snapshot.coding_submitted_problem_ids = submittedIds;
  snapshot.coding_section_complete =
    problemIds.length > 0 && problemIds.every((id) => submittedIds.includes(id));
}

/**
 * After every successful candidate write, run the interviewer once.
 * Initial prompt from spec; follow-up from AI (one question, one allowed intent).
 */
async function runInterviewerAndAppendIfNeeded(interviewId: string): Promise<void> {
  const { events, state, schema_version } = await getEventsAndState(interviewId);
  const schema = loadSchema(schema_version);
  const decision = decideNextPrompt(schema_version, schema, events);

  if (decision.action === "ask") {
    await appendEvent(interviewId, "INTERVIEWER_AI", "PROMPT_PRESENTED", {
      prompt_id: decision.prompt.prompt_id,
      prompt_text: decision.prompt.text,
      section_id: decision.prompt.section_id
    });
    return;
  }

  if (decision.action === "ask_followup") {
    const lastMessage = getLastCandidateMessageInSection(decision.section_id, events);
    if (!lastMessage || !lastMessage.trim()) return;
    const recentQuestions = getRecentPromptTextsInSection(decision.section_id, events);
    const previousSectionsTranscript = getTranscriptForPreviousSections(
      schema,
      decision.section_id,
      events
    );
    try {
      const { text } = await generateFollowUpQuestion({
        section_id: decision.section_id,
        last_candidate_message: lastMessage,
        recent_questions_in_section: recentQuestions,
        previous_sections_transcript: previousSectionsTranscript || undefined
      });
      if (text === null) {
        await appendEvent(interviewId, "INTERVIEWER_AI", "INTERVIEWER_SECTION_SATISFIED", {
          section_id: decision.section_id
        });
        return;
      }
      const prompt_id = `${decision.section_id}_followup_${state.last_seq + 1}`;
      await appendEvent(interviewId, "INTERVIEWER_AI", "PROMPT_PRESENTED", {
        prompt_id,
        prompt_text: text,
        section_id: decision.section_id
      });
    } catch (err) {
      // Log but do not block; candidate can continue
      console.error("Interviewer follow-up generation failed:", err);
    }
  }
}

export const talentRouter = Router();

const messagesSchema = z.object({
  client_event_id: z.string().min(1),
  text: z.string()
});

const sectionDoneSchema = z.object({
  client_event_id: z.string().min(1)
});

const codeSubmitSchema = z.object({
  client_event_id: z.string().min(1),
  code_text: z.string(),
  language: z.string().min(1).optional()
});

const assistantQuerySchema = z.object({
  client_event_id: z.string().min(1),
  text: z.string()
});

// Coding environment (problems, draft, run, submit)
talentRouter.use(
  "/interviews/:interview_id/coding",
  requireTalentTokenAndInterview,
  codingRouter
);

// GET /api/talent/session?token=...
talentRouter.get("/session", requireTalentToken, async (req, res, next) => {
  try {
    const invite = req.invite!;
    const roleRow = await pool.query<{ name: string; schema_version: string }>(
      "SELECT name, schema_version FROM roles WHERE id = $1",
      [invite.role_id]
    );
    if (roleRow.rowCount !== 1) {
      throw new HttpError(500, "Role not found");
    }
    const role_name = roleRow.rows[0].name;
    const schema_version = roleRow.rows[0].schema_version;
    const schema = loadSchema(schema_version);

    let interview = await pool.query<{ id: string; status: string }>(
      "SELECT id, status FROM interviews WHERE invite_id = $1",
      [invite.id]
    );

    if (interview.rowCount === 0) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query<{ id: string }>(
          `INSERT INTO interviews (role_id, invite_id, schema_version, engine_version, status)
           VALUES ($1, $2, $3, $4, 'NOT_STARTED') RETURNING id`,
          [invite.role_id, invite.id, schema_version, ENGINE_VERSION]
        );
        const interviewId = ins.rows[0].id;
        await insertEventInTx(client, interviewId, 1, "SYSTEM", "INTERVIEW_CREATED", {}, {
          schema_version,
          section_id: null
        });
        await client.query("COMMIT");
        interview = await pool.query<{ id: string; status: string }>(
          "SELECT id, status FROM interviews WHERE id = $1",
          [interviewId]
        );
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }

    const interviewId = interview.rows[0].id;
    const status = interview.rows[0].status;

    const spec = getMock1Spec();
    res.json({
      interview_id: interviewId,
      schema_version,
      role_name,
      status,
      problem_context: spec.problem_context,
      sections: schema.sections.map((s) => {
        const sectionSpec = spec.sections.find((sec) => sec.id === s.id);
        return {
          id: s.id,
          name: s.name,
          duration_seconds: s.duration_seconds,
          objective: sectionSpec?.objective ?? ""
        };
      }),
      server_time: new Date().toISOString()
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/talent/interviews/:interview_id/start
talentRouter.post(
  "/interviews/:interview_id/start",
  requireTalentTokenAndInterview,
  async (req, res, next) => {
    try {
      const interviewId = req.talentInterview!.id;
      const invite = req.invite!;

      const existing = await pool.query<{ status: string; schema_version: string }>(
        "SELECT status, schema_version FROM interviews WHERE id = $1",
        [interviewId]
      );
      if (existing.rowCount !== 1) {
        throw new HttpError(404, "Interview not found");
      }
      const status = existing.rows[0].status;
      const schema_version = existing.rows[0].schema_version;

      if (status !== "NOT_STARTED") {
        const { events, state, schema_version: sv } = await getEventsAndState(interviewId);
        const schema = loadSchema(sv);
        const eventsForSnapshot: SnapshotEvent[] = events.map((e) => ({
          seq: e.seq,
          event_type: e.event_type,
          payload: e.payload,
          created_at: e.created_at,
          section_id: e.section_id
        }));
        const snapshot = buildInterviewSnapshot(
          interviewId,
          sv,
          schema,
          state,
          eventsForSnapshot,
          new Date().toISOString(),
          events
        );
        augmentSnapshotWithCoding(interviewId, state, snapshot as Record<string, unknown>);
        res.json(snapshot);
        return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const inviteRow = await client.query<{ starts_used: number; max_starts: number }>(
          "SELECT starts_used, max_starts FROM interview_invites WHERE id = $1 FOR UPDATE",
          [invite.id]
        );
        if (inviteRow.rowCount !== 1 || inviteRow.rows[0].starts_used >= inviteRow.rows[0].max_starts) {
          await client.query("ROLLBACK");
          throw new HttpError(403, "Invite max starts reached");
        }

        await client.query(
          "UPDATE interview_invites SET starts_used = starts_used + 1 WHERE id = $1",
          [invite.id]
        );

        const invRow = await client.query<{ schema_version: string }>(
          "SELECT schema_version FROM interviews WHERE id = $1 FOR UPDATE",
          [interviewId]
        );
        if (invRow.rowCount !== 1) {
          await client.query("ROLLBACK");
          throw new HttpError(404, "Interview not found");
        }
        const maxSeqResult = await client.query<{ max_seq: string | null }>(
          "SELECT COALESCE(MAX(seq), 0) AS max_seq FROM interview_events WHERE interview_id = $1",
          [interviewId]
        );
        const nextSeq1 = Number(maxSeqResult.rows[0]?.max_seq ?? 0) + 1;
        const nextSeq2 = nextSeq1 + 1;

        const schema = loadSchema(schema_version);
        const section1 = schema.sections[0];
        if (!section1) {
          await client.query("ROLLBACK");
          throw new HttpError(500, "Schema has no sections");
        }
        const now = new Date();
        const deadline = new Date(now.getTime() + section1.duration_seconds * 1000);

        await insertEventInTx(
          client,
          interviewId,
          nextSeq1,
          "SYSTEM",
          "INTERVIEW_STARTED",
          {},
          { schema_version, section_id: null }
        );
        await insertEventInTx(
          client,
          interviewId,
          nextSeq2,
          "SYSTEM",
          "SECTION_STARTED",
          {
            section_id: section1.id,
            section_name: section1.name,
            deadline_at: deadline.toISOString()
          },
          { schema_version, section_id: section1.id }
        );

        await client.query(
          `UPDATE interviews SET
            status = 'IN_PROGRESS', started_at = $2,
            current_section_id = $3, section_started_at = $2, section_deadline_at = $4
           WHERE id = $1`,
          [interviewId, now.toISOString(), section1.id, deadline.toISOString()]
        );

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      await runInterviewerAndAppendIfNeeded(interviewId);
      const { events, state, schema_version: sv } = await getEventsAndState(interviewId);
      const schema = loadSchema(sv);
      const eventsForSnapshot: SnapshotEvent[] = events.map((e) => ({
        seq: e.seq,
        event_type: e.event_type,
        payload: e.payload,
        created_at: e.created_at,
        section_id: e.section_id
      }));
      const snapshot = buildInterviewSnapshot(
        interviewId,
        sv,
        schema,
        state,
        eventsForSnapshot,
        new Date().toISOString(),
        events
      );
      augmentSnapshotWithCoding(interviewId, state, snapshot as Record<string, unknown>);
      res.json(snapshot);
    } catch (e) {
      next(e);
    }
  }
);

// POST /api/talent/interviews/:interview_id/messages
talentRouter.post(
  "/interviews/:interview_id/messages",
  requireTalentTokenAndInterview,
  validateBody(messagesSchema),
  async (req, res, next) => {
    try {
      const interviewId = req.talentInterview!.id;
      const { client_event_id, text } = req.body as z.infer<typeof messagesSchema>;

      const result = await appendEvent(
        interviewId,
        "CANDIDATE",
        "CANDIDATE_MESSAGE",
        { text },
        client_event_id
      );

      const { state } = await getEventsAndState(interviewId);
      await updateInterviewDenormalized(interviewId, state);
      await runInterviewerAndAppendIfNeeded(interviewId);

      res.json({
        ack: { server_seq: result.seq },
        snapshot_cursor: result.seq,
        duplicate: result.duplicate
      });
    } catch (e) {
      next(e);
    }
  }
);

// POST /api/talent/interviews/:interview_id/assistant/query
talentRouter.post(
  "/interviews/:interview_id/assistant/query",
  requireTalentTokenAndInterview,
  validateBody(assistantQuerySchema),
  async (req, res, next) => {
    try {
      const interviewId = req.talentInterview!.id;
      const { client_event_id, text } = req.body as z.infer<typeof assistantQuerySchema>;

      const existing = await getAssistantResponseForClientEvent(interviewId, client_event_id);
      if (existing) {
        return res.json({
          blocked: existing.blocked,
          ...(existing.reason && { reason: existing.reason }),
          text: existing.text,
          category: existing.category
        });
      }

      const appendResult = await appendEvent(
        interviewId,
        "CANDIDATE",
        "ASSISTANT_QUERY",
        { text },
        client_event_id
      );
      if (appendResult.duplicate) {
        const again = await getAssistantResponseForClientEvent(interviewId, client_event_id);
        if (again) {
          return res.json({
            blocked: again.blocked,
            ...(again.reason && { reason: again.reason }),
            text: again.text,
            category: again.category
          });
        }
      }

      const policyDecision = evaluateAssistantRequest(text);
      const { state } = await getEventsAndState(interviewId);
      const sectionId = state.current_section_id;
      const currentPromptText = state.active_prompt_text;

      if (policyDecision.action === "block") {
        await appendEvent(interviewId, "ASSISTANT_AI", "ASSISTANT_RESPONSE_BLOCKED", {
          request_client_event_id: client_event_id,
          reason: policyDecision.reason,
          safe_alternative_text: policyDecision.safe_alternative,
          blocked: true
        });
        return res.json({
          blocked: true,
          reason: policyDecision.reason,
          text: policyDecision.safe_alternative,
          category: "nudge"
        });
      }

      const llmResult = await generateAssistantResponse({
        category: policyDecision.category,
        queryText: text,
        sectionId,
        currentPromptText
      });
      const { text: finalText, wasReplaced } = postprocessResponse(llmResult.text);
      const category = wasReplaced ? "nudge" : policyDecision.category;

      await appendEvent(interviewId, "ASSISTANT_AI", "ASSISTANT_RESPONSE", {
        request_client_event_id: client_event_id,
        text: finalText,
        category,
        blocked: false
      });

      res.json({ blocked: false, text: finalText, category });
    } catch (e) {
      next(e);
    }
  }
);

// POST /api/talent/interviews/:interview_id/code/submit
talentRouter.post(
  "/interviews/:interview_id/code/submit",
  requireTalentTokenAndInterview,
  validateBody(codeSubmitSchema),
  async (req, res, next) => {
    try {
      const interviewId = req.talentInterview!.id;
      const { client_event_id, code_text, language } = req.body as z.infer<typeof codeSubmitSchema>;

      const { state } = await getEventsAndState(interviewId);
      if (state.status !== "IN_PROGRESS" || state.current_section_id !== "section_coding") {
        throw new HttpError(400, "Code submission is only allowed in the Coding section");
      }

      await appendEvent(
        interviewId,
        "CANDIDATE",
        "CANDIDATE_CODE_SUBMITTED",
        {
          code_text,
          language: language ?? "javascript",
          section_id: state.current_section_id
        },
        client_event_id
      );

      const { events, state: stateAfter, schema_version } = await getEventsAndState(interviewId);
      await updateInterviewDenormalized(interviewId, stateAfter);
      const schema = loadSchema(schema_version);
      const eventsForSnapshot: SnapshotEvent[] = events.map((e) => ({
        seq: e.seq,
        event_type: e.event_type,
        payload: e.payload,
        created_at: e.created_at,
        section_id: e.section_id
      }));
      const snapshot = buildInterviewSnapshot(
        interviewId,
        schema_version,
        schema,
        stateAfter,
        eventsForSnapshot,
        new Date().toISOString(),
        events
      );
      res.json({
        ack: { received: true },
        snapshot
      });
    } catch (e) {
      next(e);
    }
  }
);

// POST /api/talent/interviews/:interview_id/section-done
talentRouter.post(
  "/interviews/:interview_id/section-done",
  requireTalentTokenAndInterview,
  validateBody(sectionDoneSchema),
  async (req, res, next) => {
    try {
      const interviewId = req.talentInterview!.id;
      const { client_event_id } = req.body as z.infer<typeof sectionDoneSchema>;

      const result = await appendEvent(
        interviewId,
        "CANDIDATE",
        "CANDIDATE_MARKED_DONE",
        {},
        client_event_id
      );

      const { state, schema_version } = await getEventsAndState(interviewId);
      const schema = loadSchema(schema_version);

      if (!result.duplicate && state.status === "IN_PROGRESS" && state.current_section_id) {
        const sectionId = state.current_section_id;
        const nextId = getNextSectionId(schema, sectionId);
        const now = new Date().toISOString();

        await appendEvent(
          interviewId,
          "SYSTEM",
          "SECTION_ENDED",
          { section_id: sectionId, reason: "candidate_done" }
        );

        if (nextId) {
          const nextSection = schema.sections.find((s) => s.id === nextId)!;
          const deadline = new Date(Date.now() + nextSection.duration_seconds * 1000);
          await appendEvent(interviewId, "SYSTEM", "SECTION_STARTED", {
            section_id: nextSection.id,
            section_name: nextSection.name,
            deadline_at: deadline.toISOString()
          });
          const newState = (await getEventsAndState(interviewId)).state;
          await updateInterviewDenormalized(interviewId, newState);
        } else {
          await appendEvent(interviewId, "SYSTEM", "INTERVIEW_COMPLETED", {});
          await pool.query(
            "UPDATE interviews SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1",
            [interviewId]
          );
        }
      }

      await runInterviewerAndAppendIfNeeded(interviewId);
      const { events: eventsAfter, state: stateAfter, schema_version: sv } = await getEventsAndState(interviewId);
      const schemaAfter = loadSchema(sv);
      const eventsForSnapshot: SnapshotEvent[] = eventsAfter.map((e) => ({
        seq: e.seq,
        event_type: e.event_type,
        payload: e.payload,
        created_at: e.created_at,
        section_id: e.section_id
      }));
      const snapshot = buildInterviewSnapshot(
        interviewId,
        sv,
        schemaAfter,
        stateAfter,
        eventsForSnapshot,
        new Date().toISOString(),
        eventsAfter
      );
      augmentSnapshotWithCoding(interviewId, stateAfter, snapshot as Record<string, unknown>);
      res.json(snapshot);
    } catch (e) {
      next(e);
    }
  }
);

// GET /api/talent/interviews/:interview_id/snapshot?since_seq=N
talentRouter.get(
  "/interviews/:interview_id/snapshot",
  requireTalentTokenAndInterview,
  async (req, res, next) => {
    try {
      const interviewId = req.talentInterview!.id;
      const sinceSeq = req.query.since_seq != null ? Number(req.query.since_seq) : undefined;

      const { events, state, schema_version } = await getEventsAndState(interviewId);
      const schema = loadSchema(schema_version);
      const eventsSince: SnapshotEvent[] = (sinceSeq != null
        ? events.filter((e) => e.seq > sinceSeq)
        : events
      ).map((e) => ({
        seq: e.seq,
        event_type: e.event_type,
        payload: e.payload,
        created_at: e.created_at,
        section_id: e.section_id
      }));

      const snapshot = buildInterviewSnapshot(
        interviewId,
        schema_version,
        schema,
        state,
        eventsSince,
        new Date().toISOString(),
        events
      );
      augmentSnapshotWithCoding(interviewId, state, snapshot as Record<string, unknown>);
      res.json(snapshot);
    } catch (e) {
      next(e);
    }
  }
);

// POST /api/talent/interviews/:interview_id/advance
talentRouter.post(
  "/interviews/:interview_id/advance",
  requireTalentTokenAndInterview,
  async (req, res, next) => {
    try {
      const interviewId = req.talentInterview!.id;
      const now = new Date().toISOString();

      const { events, state, schema_version } = await getEventsAndState(interviewId);
      const schema = loadSchema(schema_version);

      if (state.status !== "IN_PROGRESS" || !state.current_section_id || !state.section_deadline_at) {
        const eventsForSnapshot: SnapshotEvent[] = events.map((e) => ({
          seq: e.seq,
          event_type: e.event_type,
          payload: e.payload,
          created_at: e.created_at,
          section_id: e.section_id
        }));
        const snapshot = buildInterviewSnapshot(
          interviewId,
          schema_version,
          schema,
          state,
          eventsForSnapshot,
          now,
          events
        );
        augmentSnapshotWithCoding(interviewId, state, snapshot as Record<string, unknown>);
        res.json(snapshot);
        return;
      }

      const deadlineMs = new Date(state.section_deadline_at).getTime();
      if (new Date(now).getTime() < deadlineMs) {
        const eventsForSnapshot: SnapshotEvent[] = events.map((e) => ({
          seq: e.seq,
          event_type: e.event_type,
          payload: e.payload,
          created_at: e.created_at,
          section_id: e.section_id
        }));
        const snapshot = buildInterviewSnapshot(
          interviewId,
          schema_version,
          schema,
          state,
          eventsForSnapshot,
          now,
          events
        );
        augmentSnapshotWithCoding(interviewId, state, snapshot as Record<string, unknown>);
        res.json(snapshot);
        return;
      }

      const sectionId = state.current_section_id;
      const nextId = getNextSectionId(schema, sectionId);

      await appendEvent(interviewId, "SYSTEM", "SECTION_ENDED", {
        section_id: sectionId,
        reason: "time_expired"
      });

      if (nextId) {
        const nextSection = schema.sections.find((s) => s.id === nextId)!;
        const deadline = new Date(Date.now() + nextSection.duration_seconds * 1000);
        await appendEvent(interviewId, "SYSTEM", "SECTION_STARTED", {
          section_id: nextSection.id,
          section_name: nextSection.name,
          deadline_at: deadline.toISOString()
        });
        const newState = (await getEventsAndState(interviewId)).state;
        await updateInterviewDenormalized(interviewId, newState);
      } else {
        await appendEvent(interviewId, "SYSTEM", "INTERVIEW_COMPLETED", {});
        await pool.query(
          "UPDATE interviews SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1",
          [interviewId]
        );
      }

      await runInterviewerAndAppendIfNeeded(interviewId);
      const { events: eventsAfter, state: stateAfter, schema_version: sv } = await getEventsAndState(interviewId);
      const schemaAfter = loadSchema(sv);
      const eventsForSnapshot: SnapshotEvent[] = eventsAfter.map((e) => ({
        seq: e.seq,
        event_type: e.event_type,
        payload: e.payload,
        created_at: e.created_at,
        section_id: e.section_id
      }));
      const snapshot = buildInterviewSnapshot(
        interviewId,
        sv,
        schemaAfter,
        stateAfter,
        eventsForSnapshot,
        new Date().toISOString()
      );
      augmentSnapshotWithCoding(interviewId, stateAfter, snapshot as Record<string, unknown>);
      res.json(snapshot);
    } catch (e) {
      next(e);
    }
  }
);
