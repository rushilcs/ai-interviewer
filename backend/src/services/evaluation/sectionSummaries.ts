/**
 * Section summaries for mock1-eval. Deterministic from signals and events.
 * LLM may be used only for section summaries or quote selection per spec; this implementation uses templates only.
 */

import type { InterviewEvent } from "../orchestration/state";
import type { MetricOutput, SectionEvaluation, SignalOutput } from "./types";
import { MOCK1_SIGNALS_BY_SECTION, SECTION_IDS_ORDER } from "./mock1Signals";

function getSectionSignals(signals: SignalOutput[], sectionId: string): SignalOutput[] {
  const names = MOCK1_SIGNALS_BY_SECTION[sectionId] ?? [];
  return signals.filter((s) => names.includes(s.name));
}

function firstQuote(signals: SignalOutput[]): string {
  for (const s of signals) {
    for (const e of s.evidence) {
      if (e.quote && e.quote.trim()) return e.quote.trim();
    }
  }
  return "";
}

function section1Summary(signals: SignalOutput[], _events: InterviewEvent[]): string {
  const sec = getSectionSignals(signals, "section_1");
  const withEvidence = sec.filter((s) => s.value > 0);
  const q = firstQuote(sec);
  if (withEvidence.length === 0) return "No explicit problem framing evidence captured.";
  const parts = ["Candidate addressed problem framing."];
  if (withEvidence.some((s) => s.name === "success_metric_identification")) parts.push("Success metric was discussed.");
  if (withEvidence.some((s) => s.name === "constraint_awareness")) parts.push("Constraints were mentioned.");
  if (q) parts.push(`Evidence snippet: "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}".`);
  return parts.join(" ");
}

function section2Summary(signals: SignalOutput[], _events: InterviewEvent[]): string {
  const sec = getSectionSignals(signals, "section_2");
  const withEvidence = sec.filter((s) => s.value > 0);
  const q = firstQuote(sec);
  if (withEvidence.length === 0) return "No explicit modeling strategy evidence captured.";
  const parts = ["Candidate discussed modeling strategy and tradeoffs."];
  if (withEvidence.some((s) => s.name === "metric_tradeoff_awareness")) parts.push("Tradeoffs were discussed.");
  if (q) parts.push(`Evidence: "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}".`);
  return parts.join(" ");
}

function section3Summary(signals: SignalOutput[], _events: InterviewEvent[]): string {
  const sec = getSectionSignals(signals, "section_3");
  const withEvidence = sec.filter((s) => s.value > 0);
  const q = firstQuote(sec);
  if (withEvidence.length === 0) return "No explicit system design evidence captured.";
  const parts = ["Candidate discussed system design and failure modes."];
  if (withEvidence.some((s) => s.name === "training_vs_inference_separation")) parts.push("Training/inference structure was mentioned.");
  if (withEvidence.some((s) => s.name === "monitoring_detection")) parts.push("Monitoring or detection was discussed.");
  if (q) parts.push(`Evidence: "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}".`);
  return parts.join(" ");
}

function sectionCodingSummary(signals: SignalOutput[], events: InterviewEvent[]): string {
  const sec = getSectionSignals(signals, "section_coding");
  const codeEvents = events.filter(
    (e) => e.section_id === "section_coding" && e.event_type === "CANDIDATE_CODE_SUBMITTED"
  );
  if (codeEvents.length === 0) return "No code submission in this section.";
  const withEvidence = sec.filter((s) => s.value > 0);
  const parts = ["Candidate submitted code."];
  if (withEvidence.some((s) => s.name === "functional_correctness")) parts.push("Functional correctness signal present.");
  if (withEvidence.some((s) => s.name === "edge_case_handling")) parts.push("Edge case handling present.");
  return parts.join(" ");
}

function section4Summary(signals: SignalOutput[], _events: InterviewEvent[]): string {
  const sec = getSectionSignals(signals, "section_4");
  const withEvidence = sec.filter((s) => s.value > 0);
  const q = firstQuote(sec);
  if (withEvidence.length === 0) return "No explicit reflection evidence captured.";
  const parts = ["Candidate reflected on the approach."];
  if (withEvidence.some((s) => s.name === "improvement_prioritization")) parts.push("Improvements were proposed.");
  if (q) parts.push(`Evidence: "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}".`);
  return parts.join(" ");
}

const summaryFns: Record<string, (s: SignalOutput[], e: InterviewEvent[]) => string> = {
  section_1: section1Summary,
  section_2: section2Summary,
  section_3: section3Summary,
  section_coding: sectionCodingSummary,
  section_4: section4Summary
};

const METRICS_BY_SECTION: Record<string, string[]> = {
  section_1: ["problem_decomposition"],
  section_2: ["modeling_judgment"],
  section_3: ["system_design_reasoning"],
  section_coding: ["implementation_quality"],
  section_4: ["reflection_maturity"]
};

export function buildSectionSummaries(
  signals: SignalOutput[],
  events: InterviewEvent[],
  allMetrics: MetricOutput[]
): SectionEvaluation[] {
  return SECTION_IDS_ORDER.map((section_id) => {
    const sectionSignals = getSectionSignals(signals, section_id);
    const summaryFn = summaryFns[section_id];
    const summary = summaryFn ? summaryFn(signals, events) : "No summary.";
    const names = METRICS_BY_SECTION[section_id] ?? [];
    const metrics = allMetrics.filter((m) => names.includes(m.name));
    return { section_id, summary, signals: sectionSignals, metrics };
  });
}
