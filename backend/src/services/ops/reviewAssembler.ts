/**
 * Assemble ops review DTO: evaluation + override + comments + replay.
 * Overrides apply at read time only; evaluation_results are immutable.
 */

import { pool } from "../../db/pool";
import type { EvaluationOutput } from "../evaluation/types";
import type { ReplayBundle } from "./buildReplay";
import { buildReplay } from "./buildReplay";

export type OverrideInfo = {
  overridden_band: "STRONG_SIGNAL" | "MIXED_SIGNAL" | "WEAK_SIGNAL";
  justification: string;
  reviewer_email: string;
  created_at: string;
};

export type ReviewComment = {
  section_id: string | null;
  metric_name: string | null;
  comment: string;
  reviewer_email: string;
  created_at: string;
};

export type OpsReviewDTO = {
  interview_id: string;
  evaluation: EvaluationOutput;
  override: OverrideInfo | null;
  effective_band: "STRONG_SIGNAL" | "MIXED_SIGNAL" | "WEAK_SIGNAL";
  comments: ReviewComment[];
  replay: {
    transcript_by_section: ReplayBundle["transcript_by_section"];
    prompts: ReplayBundle["prompts"];
    assistant_usage: ReplayBundle["assistant_usage"];
    timing_per_section: ReplayBundle["timing_per_section"];
    disconnects: number;
  };
};

export class EvaluationNotFoundError extends Error {
  constructor(public interviewId: string) {
    super(`Evaluation not found for interview ${interviewId}`);
    this.name = "EvaluationNotFoundError";
  }
}

/**
 * Build full ops review for an interview. Returns 404 (throws EvaluationNotFoundError) if no evaluation.
 */
export async function buildOpsReview(interviewId: string): Promise<OpsReviewDTO> {
  const evalRow = await pool.query(
    `SELECT interview_id, evaluation_version, overall_score, overall_band, metrics_json, section_results_json, signals_json, created_at
     FROM evaluation_results WHERE interview_id = $1`,
    [interviewId]
  );
  if (evalRow.rowCount !== 1) {
    throw new EvaluationNotFoundError(interviewId);
  }

  const er = evalRow.rows[0];
  const replay = await buildReplay(interviewId);

  const context = {
    assistant_usage_count: replay.assistant_usage.length,
    time_per_section_seconds: Object.fromEntries(
      replay.timing_per_section.map((t) => [t.section_id, t.duration_seconds ?? 0])
    ),
    disconnect_count: replay.disconnects
  };

  const evaluation: EvaluationOutput = {
    interview_id: er.interview_id,
    evaluation_version: er.evaluation_version,
    signal_defs_version: "signals-v1",
    metric_weights_version: "weights-v1",
    overall_score: er.overall_score != null ? Number(er.overall_score) : null,
    overall_band: er.overall_band,
    metrics: (er.metrics_json as EvaluationOutput["metrics"]) ?? [],
    sections: (er.section_results_json as EvaluationOutput["sections"]) ?? [],
    context
  };

  const overrideRow = await pool.query(
    `SELECT o.overridden_band, o.justification, o.created_at, u.email AS reviewer_email
     FROM evaluation_overrides o
     JOIN users u ON u.id = o.reviewer_id
     WHERE o.interview_id = $1`,
    [interviewId]
  );
  const override: OverrideInfo | null =
    overrideRow.rowCount === 1
      ? {
          overridden_band: overrideRow.rows[0].overridden_band,
          justification: overrideRow.rows[0].justification,
          reviewer_email: overrideRow.rows[0].reviewer_email,
          created_at: new Date(overrideRow.rows[0].created_at).toISOString()
        }
      : null;

  const commentsRow = await pool.query(
    `SELECT c.section_id, c.metric_name, c.comment, c.created_at, u.email AS reviewer_email
     FROM evaluation_comments c
     JOIN users u ON u.id = c.reviewer_id
     WHERE c.interview_id = $1
     ORDER BY c.created_at ASC`,
    [interviewId]
  );
  const comments: ReviewComment[] = commentsRow.rows.map((r) => ({
    section_id: r.section_id ?? null,
    metric_name: r.metric_name ?? null,
    comment: r.comment,
    reviewer_email: r.reviewer_email,
    created_at: new Date(r.created_at).toISOString()
  }));

  const effective_band =
    override?.overridden_band ?? evaluation.overall_band ?? "WEAK_SIGNAL";

  return {
    interview_id: interviewId,
    evaluation,
    override,
    effective_band: effective_band as OpsReviewDTO["effective_band"],
    comments,
    replay: {
      transcript_by_section: replay.transcript_by_section,
      prompts: replay.prompts,
      assistant_usage: replay.assistant_usage,
      timing_per_section: replay.timing_per_section,
      disconnects: replay.disconnects
    }
  };
}
