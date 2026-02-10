/**
 * Deterministic signal extraction for mock1-eval (mock1-signals-v1).
 * Only explicit evidence from CANDIDATE_MESSAGE events and coding artifacts (code, test_output).
 * Absence of evidence → signal value = 0. Every signal includes explicit evidence pointers.
 * No LLM; regex/keyword rules and event ranges only.
 */

import type { InterviewEvent } from "../orchestration/state";
import type { EvidencePointer, SignalOutput } from "./types";
import {
  SECTION_1_SIGNALS,
  SECTION_2_SIGNALS,
  SECTION_3_SIGNALS,
  SECTION_4_SIGNALS,
  SECTION_CODING_SIGNALS
} from "./mock1Signals";

const MAX_QUOTE_LEN = 240;

function snippet(text: string): string {
  const t = typeof text === "string" ? text : "";
  return t.length <= MAX_QUOTE_LEN ? t : t.slice(0, MAX_QUOTE_LEN - 3) + "...";
}

function evidenceQuote(
  sectionId: string | null,
  fromSeq: number,
  quote: string,
  type: EvidencePointer["type"] = "transcript_quote"
): EvidencePointer {
  return { type, section_id: sectionId, from_seq: fromSeq, to_seq: fromSeq, quote: snippet(quote) };
}

function getSectionEvents(events: InterviewEvent[], sectionId: string): InterviewEvent[] {
  return events.filter((e) => e.section_id === sectionId);
}

function getCandidateMessages(
  events: InterviewEvent[],
  sectionId: string
): { ev: InterviewEvent; text: string }[] {
  return getSectionEvents(events, sectionId)
    .filter((e) => e.event_type === "CANDIDATE_MESSAGE")
    .map((ev) => ({ ev, text: (ev.payload?.text as string) ?? "" }));
}

function add(
  signals: SignalOutput[],
  name: string,
  value: 0 | 1 | 2,
  explanation: string,
  evidence: EvidencePointer[]
) {
  signals.push({ name, value, explanation, evidence });
}

// --- Section 1: Problem Framing & Success Definition ---
function extractSection1Signals(events: InterviewEvent[]): SignalOutput[] {
  const sectionId = "section_1";
  const messages = getCandidateMessages(events, sectionId);
  const signals: SignalOutput[] = [];

  const allText = messages.map((m) => m.text).join(" ");

  const restatement = messages.find((m) =>
    /restate|problem|goal|system trying|achieve|understand|own words/i.test(m.text)
  );
  const restatementLen = restatement ? restatement.text.trim().length : 0;
  const hasScopeOrAmbiguity = /scope|constraint|ambiguity|clarif|assumption/i.test(allText);
  const v1 = !restatement ? 0 : restatementLen >= 80 && hasScopeOrAmbiguity ? 2 : 1;
  add(
    signals,
    "problem_restatement_clarity",
    v1 as 0 | 1 | 2,
    v1 === 0 ? "No explicit problem restatement." : v1 === 2 ? "Clearly restates goal, constraints, ambiguity." : "Restates core goal but misses scope or ambiguity.",
    restatement ? [evidenceQuote(sectionId, restatement.ev.seq, restatement.text)] : []
  );

  const metric = messages.find((m) =>
    /metric|ndcg|map|ctr|engagement|retention|measure|optimize|evaluate|success criteria/i.test(m.text)
  );
  const metricJustified = metric && /(why|justif|tie|align|product|goal)/i.test(metric.text);
  const v2 = !metric ? 0 : metricJustified ? 2 : 1;
  add(
    signals,
    "success_metric_identification",
    v2 as 0 | 1 | 2,
    v2 === 0 ? "No success metric mentioned." : v2 === 2 ? "Defines metric(s) and ties to product goal." : "Mentions metric without justification.",
    metric ? [evidenceQuote(sectionId, metric.ev.seq, metric.text)] : []
  );

  const tradeoff = messages.find((m) =>
    /tradeoff|trade-off|short.?term|long.?term|harm|balance|versus|vs\.|sacrifice/i.test(m.text)
  );
  const tradeoffExplicit = tradeoff && /(explain|how|why|e\.g)/i.test(tradeoff.text);
  const v3 = !tradeoff ? 0 : tradeoffExplicit ? 2 : 1;
  add(
    signals,
    "metric_tradeoff_awareness",
    v3 as 0 | 1 | 2,
    v3 === 0 ? "No discussion of tradeoffs." : v3 === 2 ? "Explicitly explains tradeoffs." : "Mentions tradeoff superficially.",
    tradeoff ? [evidenceQuote(sectionId, tradeoff.ev.seq, tradeoff.text)] : []
  );

  const constraints = messages.filter((m) =>
    /latency|data|scale|constraint|memory|real-?time|throughput|limit/i.test(m.text)
  );
  const constraintCount = new Set(constraints.map((m) => m.text)).size;
  const multiImpact = /impact|affect|matter|because/i.test(allText);
  const v4 = constraints.length === 0 ? 0 : constraintCount >= 2 && multiImpact ? 2 : 1;
  const ev4 = constraints[0];
  add(
    signals,
    "constraint_awareness",
    v4 as 0 | 1 | 2,
    v4 === 0 ? "No constraints mentioned." : v4 === 2 ? "Multiple constraints and their impact." : "Mentions one constraint.",
    ev4 ? [evidenceQuote(sectionId, ev4.ev.seq, ev4.text)] : []
  );

  const assumption = messages.find((m) =>
    /assumption|assume|assuming|implicit|explicit/i.test(m.text)
  );
  const assumptionWhy = assumption && /(why|matter|important)/i.test(assumption.text);
  const v5 = !assumption ? 0 : assumptionWhy ? 2 : 1;
  add(
    signals,
    "assumption_articulation",
    v5 as 0 | 1 | 2,
    v5 === 0 ? "No assumptions stated." : v5 === 2 ? "Explicit assumptions and why they matter." : "Implicit assumptions.",
    assumption ? [evidenceQuote(sectionId, assumption.ev.seq, assumption.text)] : []
  );

  return signals;
}

// --- Section 2: Modeling Strategy & Tradeoffs ---
function extractSection2Signals(events: InterviewEvent[]): SignalOutput[] {
  const sectionId = "section_2";
  const messages = getCandidateMessages(events, sectionId);
  const signals: SignalOutput[] = [];

  const model = messages.find((m) =>
    /model|approach|strategy|class|would use|start with|ranking/i.test(m.text)
  );
  const modelJustified = model && /(why|because|fit|suit|appropriate)/i.test(model.text);
  const v1 = !model ? 0 : modelJustified ? 2 : 1;
  add(
    signals,
    "model_class_justification",
    v1 as 0 | 1 | 2,
    v1 === 0 ? "No model choice or unjustified." : v1 === 2 ? "Justifies model choice relative to ranking." : "Mentions model class with shallow reasoning.",
    model ? [evidenceQuote(sectionId, model.ev.seq, model.text)] : []
  );

  const alt = messages.find((m) =>
    /alternative|consider|reject|instead|could use|other approach/i.test(m.text)
  );
  const altCompare = alt && /(compare|reject|why not|tradeoff)/i.test(alt.text);
  const v2 = !alt ? 0 : altCompare ? 2 : 1;
  add(
    signals,
    "alternative_consideration",
    v2 as 0 | 1 | 2,
    v2 === 0 ? "No alternatives mentioned." : v2 === 2 ? "Compares alternatives and explains rejection." : "Mentions alternatives without reasoning.",
    alt ? [evidenceQuote(sectionId, alt.ev.seq, alt.text)] : []
  );

  const feature = messages.find((m) =>
    /feature|input|variable|predictor|signal/i.test(m.text)
  );
  const featureValue = feature && /(type|value|matter|important|which)/i.test(feature.text);
  const v3 = !feature ? 0 : featureValue ? 2 : 1;
  add(
    signals,
    "feature_reasoning",
    v3 as 0 | 1 | 2,
    v3 === 0 ? "No feature discussion." : v3 === 2 ? "Discusses feature types and signal value." : "Mentions generic features.",
    feature ? [evidenceQuote(sectionId, feature.ev.seq, feature.text)] : []
  );

  const constraint = messages.find((m) =>
    /latency|data size|interpretab|constraint|affect|choice/i.test(m.text)
  );
  const constraintExplain = constraint && /(how|affect|impact|because)/i.test(constraint.text);
  const v4 = !constraint ? 0 : constraintExplain ? 2 : 1;
  add(
    signals,
    "constraint_sensitivity",
    v4 as 0 | 1 | 2,
    v4 === 0 ? "Ignores constraints." : v4 === 2 ? "Explains how constraints affect modeling choice." : "Mentions constraint abstractly.",
    constraint ? [evidenceQuote(sectionId, constraint.ev.seq, constraint.text)] : []
  );

  const failure = messages.find((m) =>
    /failure|fail|risk|break|go wrong|edge case|error/i.test(m.text)
  );
  const failureExplain = failure && /(consequence|impact|when|how)/i.test(failure.text);
  const v5 = !failure ? 0 : failureExplain ? 2 : 1;
  add(
    signals,
    "failure_mode_awareness",
    v5 as 0 | 1 | 2,
    v5 === 0 ? "No risks discussed." : v5 === 2 ? "Explains failure modes and consequences." : "Mentions a risk.",
    failure ? [evidenceQuote(sectionId, failure.ev.seq, failure.text)] : []
  );

  return signals;
}

// --- Section 3: System Design & Failure Modes ---
function extractSection3Signals(events: InterviewEvent[]): SignalOutput[] {
  const sectionId = "section_3";
  const messages = getCandidateMessages(events, sectionId);
  const signals: SignalOutput[] = [];

  const structure = messages.find((m) =>
    /training|inference|pipeline|batch|online|serving|structure|separat/i.test(m.text)
  );
  const structureClear =
    structure && /(training|inference|separat|batch|real-?time|serving)/i.test(structure.text);
  const v1 = !structure ? 0 : structureClear ? 2 : 1;
  add(
    signals,
    "training_vs_inference_separation",
    v1 as 0 | 1 | 2,
    v1 === 0 ? "No system structure." : v1 === 2 ? "Clear training/inference separation." : "High-level structure.",
    structure ? [evidenceQuote(sectionId, structure.ev.seq, structure.text)] : []
  );

  const monitor = messages.find((m) =>
    /monitor|detect|alert|observab|metric|validate|drift/i.test(m.text)
  );
  const monitorWhat = monitor && /(what|which|why|how)/i.test(monitor.text);
  const v2 = !monitor ? 0 : monitorWhat ? 2 : 1;
  add(
    signals,
    "monitoring_detection",
    v2 as 0 | 1 | 2,
    v2 === 0 ? "No monitoring mentioned." : v2 === 2 ? "Specifies what is monitored and why." : "Mentions monitoring.",
    monitor ? [evidenceQuote(sectionId, monitor.ev.seq, monitor.text)] : []
  );

  const rollout = messages.find((m) =>
    /rollout|deploy|a\/b|ab test|canary|shadow|test|safe/i.test(m.text)
  );
  const rolloutExplicit = rollout && /(a\/b|canary|shadow|gradual|percent)/i.test(rollout.text);
  const v3 = !rollout ? 0 : rolloutExplicit ? 2 : 1;
  add(
    signals,
    "safe_rollout_strategy",
    v3 as 0 | 1 | 2,
    v3 === 0 ? "No rollout discussion." : v3 === 2 ? "Explicit strategies (A/B, shadow, canary)." : "Mentions testing vaguely.",
    rollout ? [evidenceQuote(sectionId, rollout.ev.seq, rollout.text)] : []
  );

  const scale = messages.find((m) =>
    /scale|scalab|break|large|throughput|load/i.test(m.text)
  );
  const scaleExplain = scale && /(what|break|bottleneck|limit)/i.test(scale.text);
  const v4 = !scale ? 0 : scaleExplain ? 2 : 1;
  add(
    signals,
    "scalability_awareness",
    v4 as 0 | 1 | 2,
    v4 === 0 ? "No scale discussion." : v4 === 2 ? "Explains what breaks at scale." : "Mentions scale.",
    scale ? [evidenceQuote(sectionId, scale.ev.seq, scale.text)] : []
  );

  return signals;
}

// --- Section 4: Reflection & Judgment ---
function extractSection4Signals(events: InterviewEvent[]): SignalOutput[] {
  const sectionId = "section_4";
  const messages = getCandidateMessages(events, sectionId);
  const signals: SignalOutput[] = [];

  const limitation = messages.find((m) =>
    /limitation|limit|weakness|wouldn't|would not|improve|differently|more time/i.test(m.text)
  );
  const limitationSpecific = limitation && limitation.text.trim().length >= 40;
  const v1 = !limitation ? 0 : limitationSpecific ? 2 : 1;
  add(
    signals,
    "limitation_awareness",
    v1 as 0 | 1 | 2,
    v1 === 0 ? "No limitations acknowledged." : v1 === 2 ? "Specific, meaningful limitation." : "Generic limitation.",
    limitation ? [evidenceQuote(sectionId, limitation.ev.seq, limitation.text)] : []
  );

  const improve = messages.find((m) =>
    /improve|better|next|priorit|refactor|more time|resource/i.test(m.text)
  );
  const improveJustified = improve && /(why|because|matter|first|priorit)/i.test(improve.text);
  const v2 = !improve ? 0 : improveJustified ? 2 : 1;
  add(
    signals,
    "improvement_prioritization",
    v2 as 0 | 1 | 2,
    v2 === 0 ? "No improvements proposed." : v2 === 2 ? "Prioritizes improvement with rationale." : "Proposes improvement without justification.",
    improve ? [evidenceQuote(sectionId, improve.ev.seq, improve.text)] : []
  );

  const uncertainty = messages.find((m) =>
    /uncertain|unsure|confidence|assumption|risk|might|could/i.test(m.text)
  );
  const uncertaintyReason = uncertainty && /(reason|if|when|depend)/i.test(uncertainty.text);
  const v3 = !uncertainty ? 0 : uncertaintyReason ? 2 : 1;
  add(
    signals,
    "judgment_under_uncertainty",
    v3 as 0 | 1 | 2,
    v3 === 0 ? "Avoids uncertainty." : v3 === 2 ? "Explicitly reasons under uncertainty." : "Acknowledges uncertainty.",
    uncertainty ? [evidenceQuote(sectionId, uncertainty.ev.seq, uncertainty.text)] : []
  );

  return signals;
}

// --- Section Coding: test_output and code_excerpt only; no CANDIDATE_MESSAGE for scoring ---
function extractSectionCodingSignals(events: InterviewEvent[]): SignalOutput[] {
  const sectionId = "section_coding";
  const sectionEvents = getSectionEvents(events, sectionId);
  const codeEvents = sectionEvents.filter((e) => e.event_type === "CANDIDATE_CODE_SUBMITTED");
  const testEvents = sectionEvents.filter(
    (e) => e.event_type === "CODE_TESTS_RESULT" || (e.payload?.passed != null && e.payload?.total != null)
  );
  const signals: SignalOutput[] = [];

  // C1 — Functional Correctness: aggregate all test results in section (evidence test_output only)
  let c1Value: 0 | 1 | 2 = 0;
  const c1Evidence: EvidencePointer[] = [];
  let totalPassed = 0;
  let totalTests = 0;
  for (const e of testEvents) {
    const passed = Number(e.payload?.passed ?? 0);
    const total = Number(e.payload?.total ?? 0);
    if (total > 0) {
      totalPassed += passed;
      totalTests += total;
      c1Evidence.push({
        type: "test_output",
        section_id: sectionId,
        from_seq: e.seq,
        to_seq: e.seq,
        metadata: { passed, total, problem_id: e.payload?.problem_id }
      });
    }
  }
  if (totalTests > 0) {
    if (totalPassed === totalTests) c1Value = 2;
    else if (totalPassed > 0) c1Value = 1;
  }
  add(
    signals,
    "functional_correctness",
    c1Value,
    c1Value === 0 ? "Fails core logic or no test output." : c1Value === 2 ? "Correct per tests." : "Partial correctness.",
    c1Evidence
  );

  // C2 — Edge case handling: from code (structure) or test_output
  let c2Value: 0 | 1 | 2 = 0;
  const c2Evidence: EvidencePointer[] = [];
  if (codeEvents.length > 0) {
    const last = codeEvents[codeEvents.length - 1];
    const code = (last.payload?.code_text as string) ?? "";
    const hasEdgeCheck =
      /empty|len\s*==\s*0|if not|boundary|k\s*>\s*len|edge|corner|null|zero/i.test(code);
    const hasMultipleBranches = (code.match(/\bif\b/g) || []).length >= 2;
    c2Value = hasEdgeCheck && hasMultipleBranches ? 2 : hasEdgeCheck || hasMultipleBranches ? 1 : 0;
    if (c2Value > 0)
      c2Evidence.push({
        type: "code_excerpt",
        section_id: sectionId,
        from_seq: last.seq,
        to_seq: last.seq,
        quote: snippet(code)
      });
  }
  add(
    signals,
    "edge_case_handling",
    c2Value,
    c2Value === 0 ? "No edge cases." : c2Value === 2 ? "Explicit edge case handling." : "Handles some.",
    c2Evidence
  );

  // C3 — Algorithmic efficiency: from code only
  let c3Value: 0 | 1 | 2 = 0;
  const c3Evidence: EvidencePointer[] = [];
  if (codeEvents.length > 0) {
    const last = codeEvents[codeEvents.length - 1];
    const code = (last.payload?.code_text as string) ?? "";
    const hasSort = /sort|sorted|\.sort\b/i.test(code);
    const hasSingleLoop = (code.match(/\bfor\b|\bwhile\b/g) || []).length >= 1;
    const noNestedLoop = (code.match(/\bfor\b|\bwhile\b/g) || []).length <= 2;
    c3Value = hasSort && hasSingleLoop && noNestedLoop ? 2 : hasSort || /O\(n|complexity/i.test(code) ? 1 : 0;
    if (c3Value > 0)
      c3Evidence.push({
        type: "code_excerpt",
        section_id: sectionId,
        from_seq: last.seq,
        to_seq: last.seq,
        quote: snippet(code)
      });
  }
  add(
    signals,
    "algorithmic_efficiency_awareness",
    c3Value,
    c3Value === 0 ? "Inefficient or unaware." : c3Value === 2 ? "Appropriate complexity." : "Mentions complexity.",
    c3Evidence
  );

  // C4 — Code clarity: from code only
  let c4Value: 0 | 1 | 2 = 0;
  const c4Evidence: EvidencePointer[] = [];
  if (codeEvents.length > 0) {
    const last = codeEvents[codeEvents.length - 1];
    const code = (last.payload?.code_text as string) ?? "";
    const hasFunction = /\bdef\s+\w+/.test(code) || /\bfunction\s+\w+/.test(code);
    const varNames = code.match(/\b[a-z][a-z0-9_]{2,}\b/g) || [];
    const reasonableNames = varNames.length >= 2;
    c4Value = hasFunction && reasonableNames ? 2 : hasFunction || reasonableNames ? 1 : 0;
    if (c4Value > 0)
      c4Evidence.push({
        type: "code_excerpt",
        section_id: sectionId,
        from_seq: last.seq,
        to_seq: last.seq,
        quote: snippet(code)
      });
  }
  add(
    signals,
    "code_clarity",
    c4Value,
    c4Value === 0 ? "Unreadable." : c4Value === 2 ? "Clear structure and naming." : "Mostly readable.",
    c4Evidence
  );

  return signals;
}

export function extractSignals(events: InterviewEvent[]): SignalOutput[] {
  return [
    ...extractSection1Signals(events),
    ...extractSection2Signals(events),
    ...extractSection3Signals(events),
    ...extractSectionCodingSignals(events),
    ...extractSection4Signals(events)
  ];
}
