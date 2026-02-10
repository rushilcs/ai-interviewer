/**
 * Run full evaluation pipeline and persist. Idempotent by evaluation_version.
 * Uses LLM judge for non-coding sections (ess-v2) when schema is mle-v1; coding section is deterministic.
 */

import { pool } from "../../db/pool";
import { getEventsAndState } from "../orchestration/eventStore";
import {
  runLLMJudgeEvaluation,
  mapJudgeOutputToEvaluationOutput
} from "./llmJudgeEvaluator";
import {
  type EvaluationOutput,
  type MetricOutput,
  EVALUATION_VERSION,
  SIGNAL_DEFS_VERSION,
  METRIC_WEIGHTS_VERSION
} from "./types";
import { getRubricConfig } from "../../eval/rubrics/types";
import { env } from "../../config/env";

export class EvaluationNotCompletedError extends Error {
  constructor(public interviewId: string) {
    super(`Interview ${interviewId} is not COMPLETED; cannot evaluate.`);
    this.name = "EvaluationNotCompletedError";
  }
}

function buildContext(events: { event_type: string; section_id: string | null; created_at: string; payload?: Record<string, unknown> }[]): EvaluationOutput["context"] {
  let assistant_usage_count = 0;
  let disconnect_count = 0;
  const sectionStarts: Record<string, number> = {};
  const sectionEnds: Record<string, number> = {};
  for (const e of events) {
    if (e.event_type === "ASSISTANT_QUERY") assistant_usage_count++;
    if (e.event_type === "CLIENT_DISCONNECTED" || e.event_type === "CLIENT_RECONNECTED") disconnect_count++;
    if (e.event_type === "SECTION_STARTED" && e.section_id) sectionStarts[e.section_id] = new Date(e.created_at).getTime();
    if (e.event_type === "SECTION_ENDED" && e.section_id) sectionEnds[e.section_id] = new Date(e.created_at).getTime();
  }
  const time_per_section_seconds: Record<string, number> = {};
  for (const sid of Object.keys(sectionStarts)) {
    const start = sectionStarts[sid];
    const end = sectionEnds[sid];
    time_per_section_seconds[sid] = end != null && end > start ? Math.round((end - start) / 1000) : 0;
  }
  return { assistant_usage_count, time_per_section_seconds, disconnect_count };
}

export async function runEvaluation(interview_id: string): Promise<EvaluationOutput> {
  const existing = await pool.query(
    "SELECT evaluation_version, overall_score, overall_band, metrics_json, section_results_json FROM evaluation_results WHERE interview_id = $1 AND evaluation_version = $2",
    [interview_id, EVALUATION_VERSION]
  );
  if (existing.rowCount !== null && existing.rowCount > 0) {
    const r = existing.rows[0];
    const metrics = (r.metrics_json as MetricOutput[]) ?? [];
    const sections = (r.section_results_json as EvaluationOutput["sections"]) ?? [];
    const { events } = await getEventsAndState(interview_id);
    const context = buildContext(events);
    let overall_score = r.overall_score != null ? Number(r.overall_score) : null;
    let overall_band = r.overall_band;
    if (overall_score == null && overall_band == null && metrics.length >= 5) {
      const computed = computeOverallScoreAndBand(metrics, false);
      overall_score = computed.overall_score;
      overall_band = computed.overall_band;
    }
    return {
      interview_id,
      evaluation_version: r.evaluation_version,
      signal_defs_version: SIGNAL_DEFS_VERSION,
      metric_weights_version: METRIC_WEIGHTS_VERSION,
      overall_score,
      overall_band,
      metrics,
      sections,
      context
    };
  }

  const { events, state, schema_version } = await getEventsAndState(interview_id);
  if (state.status !== "COMPLETED") {
    throw new EvaluationNotCompletedError(interview_id);
  }

  const rubric = getRubricConfig(schema_version);
  const useLLMJudge =
    rubric != null &&
    !!env.OPENAI_API_KEY &&
    process.env.NODE_ENV !== "test";

  await pool.query(
    "INSERT INTO evaluation_jobs (interview_id, status, evaluation_version, started_at) VALUES ($1, 'RUNNING', $2, NOW()) ON CONFLICT (interview_id) DO UPDATE SET status = 'RUNNING', started_at = NOW()",
    [interview_id, EVALUATION_VERSION]
  );

  try {
    let output: EvaluationOutput;

    let signalsJson: unknown = [];
    if (useLLMJudge) {
      const { output: judgeOutput } = await runLLMJudgeEvaluation(schema_version, events);
      const context = buildContext(events);
      output = mapJudgeOutputToEvaluationOutput(interview_id, judgeOutput, context, EVALUATION_VERSION);
      output.signal_defs_version = SIGNAL_DEFS_VERSION;
      output.metric_weights_version = METRIC_WEIGHTS_VERSION;
    } else {
      const { extractSignals } = await import("./signalExtractor");
      const { computeMetrics } = await import("./metricComputer");
      const { buildSectionSummaries } = await import("./sectionSummaries");
      const { computeOverallScoreAndBand } = await import("./aggregate");
      const signals = extractSignals(events);
      const hasCodeSection = events.some((e) => e.section_id === "section_coding" && e.event_type === "CANDIDATE_CODE_SUBMITTED");
      const { metrics, implementationQualityNull } = computeMetrics(signals, hasCodeSection);
      if (metrics.length !== 5) {
        throw new Error(`Expected 5 metrics, got ${metrics.length}`);
      }
      const sections = buildSectionSummaries(signals, events, metrics);
      const { overall_score, overall_band } = computeOverallScoreAndBand(metrics, implementationQualityNull);
      const context = buildContext(events);
      output = {
        interview_id,
        evaluation_version: EVALUATION_VERSION,
        signal_defs_version: SIGNAL_DEFS_VERSION,
        metric_weights_version: METRIC_WEIGHTS_VERSION,
        overall_score,
        overall_band,
        metrics,
        sections,
        context
      };
      signalsJson = signals;
    }

    await pool.query(
      `INSERT INTO evaluation_results (interview_id, evaluation_version, overall_score, overall_band, metrics_json, section_results_json, signals_json)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
       ON CONFLICT (interview_id) DO UPDATE SET
         evaluation_version = EXCLUDED.evaluation_version,
         overall_score = EXCLUDED.overall_score,
         overall_band = EXCLUDED.overall_band,
         metrics_json = EXCLUDED.metrics_json,
         section_results_json = EXCLUDED.section_results_json,
         signals_json = EXCLUDED.signals_json`,
      [
        interview_id,
        output.evaluation_version as string,
        output.overall_score,
        output.overall_band,
        JSON.stringify(output.metrics),
        JSON.stringify(output.sections),
        JSON.stringify(signalsJson)
      ]
    );
    await pool.query(
      "UPDATE evaluation_jobs SET status = 'COMPLETED', completed_at = NOW() WHERE interview_id = $1",
      [interview_id]
    );
    return output;
  } catch (err) {
    await pool.query(
      "UPDATE evaluation_jobs SET status = 'FAILED', completed_at = NOW(), error_message = $2 WHERE interview_id = $1",
      [interview_id, err instanceof Error ? err.message : String(err)]
    );
    throw err;
  }
}
