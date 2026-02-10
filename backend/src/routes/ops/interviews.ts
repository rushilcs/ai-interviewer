import { Router } from "express";
import { pool } from "../../db/pool";
import { requireOpsAuth } from "../../middlewares/auth";
import { HttpError } from "../../utils/httpError";
import { runEvaluation, EvaluationNotCompletedError } from "../../services/evaluation/runEvaluation";
import { buildReplay } from "../../services/ops/buildReplay";
import {
  buildOpsReview,
  EvaluationNotFoundError
} from "../../services/ops/reviewAssembler";
import { buildExportJson, buildExportText } from "../../services/ops/exportFormats";

const OVERRIDE_BANDS = ["STRONG_SIGNAL", "MIXED_SIGNAL", "WEAK_SIGNAL"] as const;
const MIN_JUSTIFICATION_LENGTH = 50;

export const opsInterviewsRouter = Router();

opsInterviewsRouter.get("/", requireOpsAuth, async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const role_id = req.query.role_id as string | undefined;
    const from_date = req.query.from_date as string | undefined;
    const to_date = req.query.to_date as string | undefined;

    let query = `
      SELECT i.id, i.role_id, i.invite_id, i.candidate_email, i.schema_version, i.status,
             i.current_section_id, i.section_started_at, i.section_deadline_at,
             i.created_at, i.started_at, i.completed_at, i.terminated_at, i.terminate_reason,
             r.name AS role_name
      FROM interviews i
      JOIN roles r ON r.id = i.role_id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let idx = 1;
    if (status) {
      query += ` AND i.status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (role_id) {
      query += ` AND i.role_id = $${idx}`;
      params.push(role_id);
      idx++;
    }
    if (from_date) {
      query += ` AND i.created_at >= $${idx}::timestamptz`;
      params.push(from_date);
      idx++;
    }
    if (to_date) {
      query += ` AND i.created_at <= $${idx}::timestamptz`;
      params.push(to_date);
      idx++;
    }
    query += ` ORDER BY i.created_at DESC`;

    const result = await pool.query(query, params);
    const interviews = result.rows.map((row) => ({
      id: row.id,
      role_id: row.role_id,
      role_name: row.role_name,
      invite_id: row.invite_id,
      candidate_email: row.candidate_email,
      schema_version: row.schema_version,
      status: row.status,
      current_section_id: row.current_section_id,
      section_started_at: row.section_started_at,
      section_deadline_at: row.section_deadline_at,
      created_at: row.created_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      terminated_at: row.terminated_at,
      terminate_reason: row.terminate_reason
    }));
    res.json({ interviews });
  } catch (e) {
    next(e);
  }
});

opsInterviewsRouter.post("/:id/evaluate", requireOpsAuth, async (req, res, next) => {
  try {
    const interviewId = req.params.id;
    if (!interviewId) {
      throw new HttpError(400, "Missing interview id");
    }
    const row = await pool.query("SELECT id, status FROM interviews WHERE id = $1", [interviewId]);
    if (row.rowCount !== 1) {
      throw new HttpError(404, "Interview not found");
    }
    try {
      const output = await runEvaluation(interviewId);
      res.json(output);
    } catch (err) {
      if (err instanceof EvaluationNotCompletedError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  } catch (e) {
    next(e);
  }
});

opsInterviewsRouter.get("/:id/evaluation", requireOpsAuth, async (req, res, next) => {
  try {
    const interviewId = req.params.id;
    const row = await pool.query(
      "SELECT interview_id, evaluation_version, overall_score, overall_band, metrics_json, section_results_json, signals_json, created_at FROM evaluation_results WHERE interview_id = $1",
      [interviewId]
    );
    if (row.rowCount !== 1) {
      throw new HttpError(404, "Evaluation not found");
    }
    const r = row.rows[0];
    res.json({
      interview_id: r.interview_id,
      evaluation_version: r.evaluation_version,
      overall_score: r.overall_score != null ? Number(r.overall_score) : null,
      overall_band: r.overall_band,
      metrics: r.metrics_json,
      sections: r.section_results_json,
      signals: r.signals_json,
      created_at: r.created_at
    });
  } catch (e) {
    next(e);
  }
});

opsInterviewsRouter.get("/:id/replay", requireOpsAuth, async (req, res, next) => {
  try {
    const interviewId = req.params.id;
    const invRow = await pool.query("SELECT id FROM interviews WHERE id = $1", [interviewId]);
    if (invRow.rowCount !== 1) {
      throw new HttpError(404, "Interview not found");
    }
    const replay = await buildReplay(interviewId);
    res.json({
      interview_id: replay.interview_id,
      sections: replay.transcript_by_section,
      assistant_usage: replay.assistant_usage,
      section_timing: replay.timing_per_section,
      disconnect_count: replay.disconnects
    });
  } catch (e) {
    next(e);
  }
});

// --- Chunk 6: Ops review, comments, override, export ---

opsInterviewsRouter.get("/:id/review", requireOpsAuth, async (req, res, next) => {
  try {
    const interviewId = req.params.id;
    const invRow = await pool.query("SELECT id FROM interviews WHERE id = $1", [interviewId]);
    if (invRow.rowCount !== 1) {
      throw new HttpError(404, "Interview not found");
    }
    try {
      const review = await buildOpsReview(interviewId);
      res.json(review);
    } catch (err) {
      if (err instanceof EvaluationNotFoundError) {
        throw new HttpError(404, err.message);
      }
      throw err;
    }
  } catch (e) {
    next(e);
  }
});

opsInterviewsRouter.post("/:id/comments", requireOpsAuth, async (req, res, next) => {
  try {
    const interviewId = req.params.id;
    const reviewerId = req.authUser!.id;
    const { section_id, metric_name, comment } = req.body as {
      section_id?: string;
      metric_name?: string;
      comment?: string;
    };
    if (typeof comment !== "string" || !comment.trim()) {
      throw new HttpError(400, "comment is required");
    }
    const invRow = await pool.query("SELECT id FROM interviews WHERE id = $1", [interviewId]);
    if (invRow.rowCount !== 1) {
      throw new HttpError(404, "Interview not found");
    }
    const evalRow = await pool.query(
      "SELECT section_results_json FROM evaluation_results WHERE interview_id = $1",
      [interviewId]
    );
    if (evalRow.rowCount !== 1) {
      throw new HttpError(404, "Evaluation not found");
    }
    const sectionIds = ((evalRow.rows[0].section_results_json as { section_id?: string }[]) ?? []).map(
      (s) => s.section_id
    );
    if (section_id != null && section_id !== "") {
      if (!sectionIds.includes(section_id)) {
        throw new HttpError(400, "section_id must be an existing section from this interview");
      }
    }
    await pool.query(
      `INSERT INTO evaluation_reviews (interview_id, reviewer_id, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (interview_id) DO UPDATE SET reviewer_id = $2, updated_at = NOW()`,
      [interviewId, reviewerId]
    );
    await pool.query(
      `INSERT INTO evaluation_comments (interview_id, reviewer_id, section_id, metric_name, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [interviewId, reviewerId, section_id ?? null, metric_name ?? null, comment.trim()]
    );
    const review = await buildOpsReview(interviewId);
    res.json(review);
  } catch (e) {
    next(e);
  }
});

opsInterviewsRouter.post("/:id/override", requireOpsAuth, async (req, res, next) => {
  try {
    const interviewId = req.params.id;
    const reviewerId = req.authUser!.id;
    const { overridden_band, justification } = req.body as {
      overridden_band?: string;
      justification?: string;
    };
    if (
      !overridden_band ||
      !OVERRIDE_BANDS.includes(overridden_band as (typeof OVERRIDE_BANDS)[number])
    ) {
      throw new HttpError(400, "overridden_band must be STRONG_SIGNAL, MIXED_SIGNAL, or WEAK_SIGNAL");
    }
    if (typeof justification !== "string" || justification.trim().length < MIN_JUSTIFICATION_LENGTH) {
      throw new HttpError(
        400,
        `justification is required and must be at least ${MIN_JUSTIFICATION_LENGTH} characters`
      );
    }
    const invRow = await pool.query("SELECT id FROM interviews WHERE id = $1", [interviewId]);
    if (invRow.rowCount !== 1) {
      throw new HttpError(404, "Interview not found");
    }
    const evalRow = await pool.query(
      "SELECT overall_band FROM evaluation_results WHERE interview_id = $1",
      [interviewId]
    );
    if (evalRow.rowCount !== 1) {
      throw new HttpError(404, "Evaluation not found");
    }
    const existingOverride = await pool.query(
      "SELECT id FROM evaluation_overrides WHERE interview_id = $1",
      [interviewId]
    );
    if (existingOverride.rowCount !== null && existingOverride.rowCount > 0) {
      throw new HttpError(409, "Override already exists for this interview");
    }
    const original_band = evalRow.rows[0].overall_band ?? "WEAK_SIGNAL";
    await pool.query(
      `INSERT INTO evaluation_reviews (interview_id, reviewer_id, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (interview_id) DO UPDATE SET reviewer_id = $2, updated_at = NOW()`,
      [interviewId, reviewerId]
    );
    await pool.query(
      `INSERT INTO evaluation_overrides (interview_id, reviewer_id, original_band, overridden_band, justification)
       VALUES ($1, $2, $3, $4, $5)`,
      [interviewId, reviewerId, original_band, overridden_band, justification.trim()]
    );
    const review = await buildOpsReview(interviewId);
    res.json(review);
  } catch (e) {
    next(e);
  }
});

opsInterviewsRouter.get("/:id/export/json", requireOpsAuth, async (req, res, next) => {
  try {
    const interviewId = req.params.id;
    const invRow = await pool.query(
      `SELECT i.completed_at, i.candidate_email, r.name AS role_name
       FROM interviews i
       JOIN roles r ON r.id = i.role_id
       WHERE i.id = $1`,
      [interviewId]
    );
    if (invRow.rowCount !== 1) {
      throw new HttpError(404, "Interview not found");
    }
    let review;
    try {
      review = await buildOpsReview(interviewId);
    } catch (err) {
      if (err instanceof EvaluationNotFoundError) {
        throw new HttpError(404, "Evaluation not found");
      }
      throw err;
    }
    const inv = invRow.rows[0];
    const meta = {
      role: inv.role_name,
      candidate_email: inv.candidate_email ?? null,
      completed_at: inv.completed_at ? new Date(inv.completed_at).toISOString() : null
    };
    const json = buildExportJson(review, meta);
    res.json(json);
  } catch (e) {
    next(e);
  }
});

opsInterviewsRouter.get("/:id/export/text", requireOpsAuth, async (req, res, next) => {
  try {
    const interviewId = req.params.id;
    const invRow = await pool.query(
      `SELECT i.completed_at, i.candidate_email, r.name AS role_name
       FROM interviews i
       JOIN roles r ON r.id = i.role_id
       WHERE i.id = $1`,
      [interviewId]
    );
    if (invRow.rowCount !== 1) {
      throw new HttpError(404, "Interview not found");
    }
    let review;
    try {
      review = await buildOpsReview(interviewId);
    } catch (err) {
      if (err instanceof EvaluationNotFoundError) {
        throw new HttpError(404, "Evaluation not found");
      }
      throw err;
    }
    const inv = invRow.rows[0];
    const meta = {
      role: inv.role_name,
      candidate_email: inv.candidate_email ?? null,
      completed_at: inv.completed_at ? new Date(inv.completed_at).toISOString() : null
    };
    const text = buildExportText(review, meta);
    res.set("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  } catch (e) {
    next(e);
  }
});
