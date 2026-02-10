/**
 * Deterministic section summaries from templates + evidence snippets. No LLM.
 */

import type { InterviewEvent } from "../orchestration/state";
import type { MetricOutput, SectionEvaluation, SignalOutput } from "./types";

function getSectionSignals(signals: SignalOutput[], sectionId: string): SignalOutput[] {
  const sectionSignalNames: Record<string, string[]> = {
    section_1: ["problem_restatement", "stakeholders_identified", "metric_defined", "constraints_named", "assumptions_articulated"],
    section_2: ["model_family_justified", "feature_strategy", "tradeoffs_discussed", "failure_modes", "deployment_considerations"],
    section_3: ["system_structure_mentioned", "failure_modes_section3", "monitoring_or_validation"],
    section_coding: ["core_logic_correctness_proxy", "edge_cases_mentioned", "readability_proxy", "complexity_awareness"],
    section_4: ["limitations_identified", "improvements_proposed", "real_world_constraints_awareness"]
  };
  const names = sectionSignalNames[sectionId] ?? [];
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
  if (withEvidence.some((s) => s.name === "metric_defined")) parts.push("Evaluation metric was discussed.");
  if (withEvidence.some((s) => s.name === "constraints_named")) parts.push("Constraints were mentioned.");
  if (q) parts.push(`Evidence snippet: "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}".`);
  return parts.join(" ");
}

function section2Summary(signals: SignalOutput[], _events: InterviewEvent[]): string {
  const sec = getSectionSignals(signals, "section_2");
  const withEvidence = sec.filter((s) => s.value > 0);
  const q = firstQuote(sec);
  if (withEvidence.length === 0) return "No explicit modeling strategy evidence captured.";
  const parts = ["Candidate discussed modeling strategy."];
  if (withEvidence.some((s) => s.name === "tradeoffs_discussed")) parts.push("Tradeoffs were discussed.");
  if (q) parts.push(`Evidence: "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}".`);
  return parts.join(" ");
}

function section3Summary(signals: SignalOutput[], _events: InterviewEvent[]): string {
  const sec = getSectionSignals(signals, "section_3");
  const withEvidence = sec.filter((s) => s.value > 0);
  const q = firstQuote(sec);
  if (withEvidence.length === 0) return "No explicit system design evidence captured.";
  const parts = ["Candidate discussed system design and failure modes."];
  if (withEvidence.some((s) => s.name === "system_structure_mentioned")) parts.push("System structure was mentioned.");
  if (withEvidence.some((s) => s.name === "failure_modes_section3")) parts.push("Failure modes or risks were discussed.");
  if (q) parts.push(`Evidence: "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}".`);
  return parts.join(" ");
}

function sectionCodingSummary(signals: SignalOutput[], events: InterviewEvent[]): string {
  const sec = getSectionSignals(signals, "section_coding");
  const codeEvents = events.filter((e) => e.section_id === "section_coding" && e.event_type === "CANDIDATE_CODE_SUBMITTED");
  if (codeEvents.length === 0) return "No code submission in this section.";
  const withEvidence = sec.filter((s) => s.value > 0);
  const parts = ["Candidate submitted code."];
  if (withEvidence.some((s) => s.name === "core_logic_correctness_proxy")) parts.push("Correctness proxy signal present.");
  if (withEvidence.some((s) => s.name === "edge_cases_mentioned")) parts.push("Edge cases were mentioned.");
  return parts.join(" ");
}

function section4Summary(signals: SignalOutput[], _events: InterviewEvent[]): string {
  const sec = getSectionSignals(signals, "section_4");
  const withEvidence = sec.filter((s) => s.value > 0);
  const q = firstQuote(sec);
  if (withEvidence.length === 0) return "No explicit reflection evidence captured.";
  const parts = ["Candidate reflected on the approach."];
  if (withEvidence.some((s) => s.name === "improvements_proposed")) parts.push("Improvements were proposed.");
  if (q) parts.push(`Evidence: "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}".`);
  return parts.join(" ");
}

const SECTION_IDS = ["section_1", "section_2", "section_3", "section_coding", "section_4"] as const;
const summaryFns: Record<string, (s: SignalOutput[], e: InterviewEvent[]) => string> = {
  section_1: section1Summary,
  section_2: section2Summary,
  section_3: section3Summary,
  section_coding: sectionCodingSummary,
  section_4: section4Summary
};

const METRICS_BY_SECTION: Record<string, string[]> = {
  section_1: ["problem_decomposition"],
  section_2: ["reasoning_quality", "modeling_judgment"],
  section_3: ["implementation_quality"],
  section_4: ["reflection_maturity"]
};

export function buildSectionSummaries(
  signals: SignalOutput[],
  events: InterviewEvent[],
  allMetrics: MetricOutput[]
): SectionEvaluation[] {
  return SECTION_IDS.map((section_id) => {
    const sectionSignals = getSectionSignals(signals, section_id);
    const summaryFn = summaryFns[section_id];
    const summary = summaryFn ? summaryFn(signals, events) : "No summary.";
    const names = METRICS_BY_SECTION[section_id] ?? [];
    const metrics = allMetrics.filter((m) => names.includes(m.name));
    return { section_id, summary, signals: sectionSignals, metrics };
  });
}
