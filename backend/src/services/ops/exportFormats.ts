/**
 * Hiring-manager-friendly export formats. Template-based, no LLM.
 */

import type { OpsReviewDTO } from "./reviewAssembler";
import type { MetricOutput } from "../evaluation/types";

export type ExportJson = {
  interview_id: string;
  role: string;
  candidate_email: string | null;
  completed_at: string | null;
  effective_band: string;
  metrics: MetricOutput[];
  sections: OpsReviewDTO["evaluation"]["sections"];
  reviewer_override?: {
    overridden_band: string;
    original_band: string;
    justification: string;
    reviewer_email: string;
    created_at: string;
  };
  comments?: Array<{
    section_id: string | null;
    metric_name: string | null;
    comment: string;
    reviewer_email: string;
    created_at: string;
  }>;
};

export function buildExportJson(
  review: OpsReviewDTO,
  meta: { role: string; candidate_email: string | null; completed_at: string | null }
): ExportJson {
  const out: ExportJson = {
    interview_id: review.interview_id,
    role: meta.role,
    candidate_email: meta.candidate_email,
    completed_at: meta.completed_at,
    effective_band: review.effective_band,
    metrics: review.evaluation.metrics,
    sections: review.evaluation.sections
  };
  if (review.override) {
    const originalBand =
      (review.evaluation.overall_band as string) ?? "WEAK_SIGNAL";
    out.reviewer_override = {
      overridden_band: review.override.overridden_band,
      original_band: originalBand,
      justification: review.override.justification,
      reviewer_email: review.override.reviewer_email,
      created_at: review.override.created_at
    };
  }
  if (review.comments.length > 0) {
    out.comments = review.comments.map((c) => ({
      section_id: c.section_id,
      metric_name: c.metric_name,
      comment: c.comment,
      reviewer_email: c.reviewer_email,
      created_at: c.created_at
    }));
  }
  return out;
}

/** Deterministic plain-text summary for export. */
export function buildExportText(
  review: OpsReviewDTO,
  meta: { role: string; candidate_email: string | null; completed_at: string | null }
): string {
  const lines: string[] = [];

  lines.push(`Interview: ${review.interview_id}`);
  lines.push(`Role: ${meta.role}`);
  if (meta.candidate_email) lines.push(`Candidate: ${meta.candidate_email}`);
  if (meta.completed_at) lines.push(`Completed: ${meta.completed_at}`);
  lines.push("");

  lines.push("--- Overall signal ---");
  lines.push(`Effective band: ${review.effective_band}`);
  if (review.evaluation.overall_score != null) {
    lines.push(`Overall score: ${review.evaluation.overall_score}`);
  }
  lines.push("");

  lines.push("--- Metric breakdown ---");
  for (const m of review.evaluation.metrics) {
    lines.push(`${m.name}: ${m.value} (${m.scale})`);
    lines.push(`  Explanation: ${m.explanation}`);
    for (const ev of m.evidence) {
      const q = ev.quote ? ` "${ev.quote}"` : "";
      lines.push(`  Evidence (${ev.type}):${q}`);
    }
    lines.push("");
  }

  lines.push("--- Section summaries ---");
  for (const sec of review.evaluation.sections) {
    lines.push(`[${sec.section_id}] ${sec.summary}`);
    lines.push("");
  }

  if (review.override) {
    lines.push("--- Reviewer override ---");
    lines.push(`Overridden band: ${review.override.overridden_band}`);
    lines.push(`Justification: ${review.override.justification}`);
    lines.push(`By: ${review.override.reviewer_email} at ${review.override.created_at}`);
    lines.push("");
  }

  if (review.comments.length > 0) {
    lines.push("--- Reviewer comments ---");
    for (const c of review.comments) {
      const loc = [c.section_id, c.metric_name].filter(Boolean).join(" / ") || "General";
      lines.push(`[${loc}] ${c.reviewer_email} (${c.created_at}): ${c.comment}`);
    }
  }

  return lines.join("\n");
}
