import request from "supertest";
import { describe, expect, test } from "vitest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { seedAll } from "../src/db/seed";
import { pool } from "../src/db/pool";
import { prepareDatabase } from "./helpers";

async function getOpsToken(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: env.OPS_ADMIN_EMAIL, password: env.OPS_ADMIN_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function getRoleId(app: ReturnType<typeof createApp>, opsToken: string): Promise<string> {
  const res = await request(app).get("/api/roles").set("Authorization", `Bearer ${opsToken}`);
  expect(res.status).toBe(200);
  return res.body.roles[0].id;
}

describe("Chunk 3: Deterministic Interviewer (Prompt Engine)", () => {
  test("1) On interview start, initial prompt for section 1 is emitted exactly once", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const opsToken = await getOpsToken(app);
    const roleId = await getRoleId(app, opsToken);
    const inviteRes = await request(app)
      .post("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ role_id: roleId });
    const token = inviteRes.body.token;
    const sessionRes = await request(app).get(`/api/talent/session?token=${token}`);
    const interviewId = sessionRes.body.interview_id;

    const startRes = await request(app)
      .post(`/api/talent/interviews/${interviewId}/start`)
      .set("X-Invite-Token", token);
    expect(startRes.status).toBe(200);

    const promptEvents = await pool.query(
      `SELECT event_type, payload_json->>'prompt_id' AS prompt_id, payload_json->>'section_id' AS section_id
       FROM interview_events WHERE interview_id = $1 AND event_type = 'PROMPT_PRESENTED' ORDER BY seq`,
      [interviewId]
    );
    expect(promptEvents.rows.length).toBe(1);
    expect(promptEvents.rows[0].prompt_id).toBe("section_1_initial");
    expect(promptEvents.rows[0].section_id).toBe("section_1");

    expect(startRes.body.current_prompt).toBeDefined();
    expect(startRes.body.current_prompt.prompt_id).toBe("section_1_initial");
    expect(startRes.body.current_prompt.section_id).toBe("section_1");
    expect(startRes.body.current_prompt.text).toContain("Restate the problem");
  });

  test("2) After candidate message that satisfies a coverage tag, next follow-up prompt is emitted", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const opsToken = await getOpsToken(app);
    const roleId = await getRoleId(app, opsToken);
    const inviteRes = await request(app)
      .post("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ role_id: roleId });
    const token = inviteRes.body.token;
    const sessionRes = await request(app).get(`/api/talent/session?token=${token}`);
    const interviewId = sessionRes.body.interview_id;
    await request(app)
      .post(`/api/talent/interviews/${interviewId}/start`)
      .set("X-Invite-Token", token);

    await request(app)
      .post(`/api/talent/interviews/${interviewId}/messages`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "msg-1", text: "We would optimize for accuracy and recall." });

    const promptEvents = await pool.query(
      `SELECT seq, payload_json->>'prompt_id' AS prompt_id FROM interview_events
       WHERE interview_id = $1 AND event_type = 'PROMPT_PRESENTED' ORDER BY seq`,
      [interviewId]
    );
    expect(promptEvents.rows.length).toBeGreaterThanOrEqual(2);
    const promptIds = promptEvents.rows.map((r: { prompt_id: string }) => r.prompt_id);
    expect(promptIds).toContain("section_1_initial");
    expect(
      promptIds.some((id) => id && String(id).startsWith("section_1_followup_"))
    ).toBe(true);
  });

  test("3) Prompts are never duplicated across multiple messages", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const opsToken = await getOpsToken(app);
    const roleId = await getRoleId(app, opsToken);
    const inviteRes = await request(app)
      .post("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ role_id: roleId });
    const token = inviteRes.body.token;
    const sessionRes = await request(app).get(`/api/talent/session?token=${token}`);
    const interviewId = sessionRes.body.interview_id;
    await request(app)
      .post(`/api/talent/interviews/${interviewId}/start`)
      .set("X-Invite-Token", token);

    await request(app)
      .post(`/api/talent/interviews/${interviewId}/messages`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "m1", text: "Some answer about the problem." });
    await request(app)
      .post(`/api/talent/interviews/${interviewId}/messages`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "m2", text: "Another message." });

    const promptEvents = await pool.query(
      `SELECT payload_json->>'prompt_id' AS prompt_id FROM interview_events
       WHERE interview_id = $1 AND event_type = 'PROMPT_PRESENTED' ORDER BY seq`,
      [interviewId]
    );
    const ids = promptEvents.rows.map((r: { prompt_id: string }) => r.prompt_id);
    const unique = [...new Set(ids)];
    expect(ids.length).toBe(unique.length);
  });

  test("4) No prompts emitted after SECTION_ENDED for that section", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const opsToken = await getOpsToken(app);
    const roleId = await getRoleId(app, opsToken);
    const inviteRes = await request(app)
      .post("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ role_id: roleId });
    const token = inviteRes.body.token;
    const sessionRes = await request(app).get(`/api/talent/session?token=${token}`);
    const interviewId = sessionRes.body.interview_id;
    await request(app)
      .post(`/api/talent/interviews/${interviewId}/start`)
      .set("X-Invite-Token", token);
    await request(app)
      .post(`/api/talent/interviews/${interviewId}/section-done`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "done-1" });

    const events = await pool.query(
      `SELECT seq, event_type, payload_json->>'section_id' AS section_id
       FROM interview_events WHERE interview_id = $1 ORDER BY seq`,
      [interviewId]
    );
    const sectionEndedBySection: Record<string, number> = {};
    for (const r of events.rows) {
      if (r.event_type === "SECTION_ENDED" && r.section_id) {
        sectionEndedBySection[r.section_id] = Number(r.seq);
      }
    }
    for (const r of events.rows) {
      if (r.event_type !== "PROMPT_PRESENTED" || !r.section_id) continue;
      const endedSeq = sectionEndedBySection[r.section_id];
      if (endedSeq != null) {
        expect(Number(r.seq)).toBeLessThan(endedSeq);
      }
    }
  });

  test("5) Determinism: same ordered events produce same prompts in same order", async () => {
    const { decideNextPrompt } = await import("../src/services/orchestration/interviewer");
    const { loadSchema } = await import("../src/services/orchestration/schema");
    const { reduceInterviewState } = await import("../src/services/orchestration/state");
    const schema = loadSchema("mle-v1");

    const events1 = [
      { seq: 1, event_type: "INTERVIEW_CREATED", payload: {}, created_at: "2025-01-01T00:00:00Z", section_id: null },
      { seq: 2, event_type: "INTERVIEW_STARTED", payload: {}, created_at: "2025-01-01T00:00:01Z", section_id: null },
      {
        seq: 3,
        event_type: "SECTION_STARTED",
        payload: { section_id: "section_1", section_name: "Problem Framing", deadline_at: "2025-01-01T00:10:00Z" },
        created_at: "2025-01-01T00:00:01Z",
        section_id: "section_1"
      }
    ];

    const decision1 = decideNextPrompt("mle-v1", schema, events1);
    expect(decision1.action).toBe("ask");
    expect(decision1.action === "ask" && decision1.prompt.prompt_id).toBe("section_1_initial");

    const events2 = [
      ...events1,
      {
        seq: 4,
        event_type: "PROMPT_PRESENTED",
        payload: { prompt_id: "section_1_initial", prompt_text: "Restate...", section_id: "section_1" },
        created_at: "2025-01-01T00:00:02Z",
        section_id: "section_1"
      },
      {
        seq: 5,
        event_type: "CANDIDATE_MESSAGE",
        payload: { text: "We need to optimize for accuracy and recall." },
        created_at: "2025-01-01T00:00:03Z",
        section_id: "section_1"
      }
    ];

    const decision2a = decideNextPrompt("mle-v1", schema, events2);
    const decision2b = decideNextPrompt("mle-v1", schema, events2);
    expect(decision2a.action).toBe("ask_followup");
    expect(decision2b.action).toBe("ask_followup");
    expect(decision2a.action === "ask_followup" && decision2a.section_id).toBe(
      decision2b.action === "ask_followup" ? decision2b.section_id : ""
    );
  });

  test("6) Snapshot exposes current_prompt correctly", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const opsToken = await getOpsToken(app);
    const roleId = await getRoleId(app, opsToken);
    const inviteRes = await request(app)
      .post("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ role_id: roleId });
    const token = inviteRes.body.token;
    const sessionRes = await request(app).get(`/api/talent/session?token=${token}`);
    const interviewId = sessionRes.body.interview_id;
    await request(app)
      .post(`/api/talent/interviews/${interviewId}/start`)
      .set("X-Invite-Token", token);

    const snapshotRes = await request(app)
      .get(`/api/talent/interviews/${interviewId}/snapshot`)
      .set("X-Invite-Token", token);
    expect(snapshotRes.status).toBe(200);
    expect(snapshotRes.body.current_prompt).toBeDefined();
    expect(snapshotRes.body.current_prompt.prompt_id).toBe("section_1_initial");
    expect(snapshotRes.body.current_prompt.section_id).toBe("section_1");
    expect(typeof snapshotRes.body.current_prompt.text).toBe("string");
    expect(snapshotRes.body.current_prompt.text.length).toBeGreaterThan(0);
  });
});
