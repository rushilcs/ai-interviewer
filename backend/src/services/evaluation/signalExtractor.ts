/**
 * Deterministic signal extraction from interview_events.
 * Only explicit candidate evidence; no inference from silence.
 * value: 0 = no evidence (neutral), 1 = evidence found, 2 = strong unambiguous evidence.
 */

import type { InterviewEvent } from "../orchestration/state";
import type { EvidencePointer, SignalOutput } from "./types";

const MAX_QUOTE_LEN = 240;

function snippet(text: string): string {
  const t = typeof text === "string" ? text : "";
  return t.length <= MAX_QUOTE_LEN ? t : t.slice(0, MAX_QUOTE_LEN - 3) + "...";
}

function evidenceQuote(sectionId: string | null, fromSeq: number, quote: string, type: EvidencePointer["type"] = "transcript_quote"): EvidencePointer {
  return { type, section_id: sectionId, from_seq: fromSeq, to_seq: fromSeq, quote: snippet(quote) };
}

function getSectionEvents(events: InterviewEvent[], sectionId: string): InterviewEvent[] {
  return events.filter((e) => e.section_id === sectionId);
}

function getCandidateMessages(events: InterviewEvent[], sectionId: string): { ev: InterviewEvent; text: string }[] {
  return getSectionEvents(events, sectionId)
    .filter((e) => e.event_type === "CANDIDATE_MESSAGE")
    .map((ev) => ({ ev, text: (ev.payload?.text as string) ?? "" }));
}

// --- Section 1: Problem Framing ---
function extractSection1Signals(events: InterviewEvent[]): SignalOutput[] {
  const sectionId = "section_1";
  const messages = getCandidateMessages(events, sectionId);
  const allText = messages.map((m) => m.text).join(" ").toLowerCase();

  const signals: SignalOutput[] = [];
  const add = (name: string, value: 0 | 1 | 2, explanation: string, evidence: EvidencePointer[]) => {
    signals.push({ name, value, explanation, evidence });
  };

  const problemRestatement = messages.find((m) => /problem|goal|restate|outcome|understand|success/.test(m.text.toLowerCase()));
  add(
    "problem_restatement",
    problemRestatement ? (problemRestatement.text.length > 80 ? 2 : 1) : 0,
    problemRestatement ? "Candidate restated or framed the problem." : "No explicit problem restatement.",
    problemRestatement ? [evidenceQuote(sectionId, problemRestatement.ev.seq, problemRestatement.text)] : []
  );

  const stakeholders = messages.find((m) => /stakeholder|user|customer|business|who\s+(is|are)/i.test(m.text));
  add(
    "stakeholders_identified",
    stakeholders ? 1 : 0,
    stakeholders ? "Stakeholders or users mentioned." : "No stakeholders identified.",
    stakeholders ? [evidenceQuote(sectionId, stakeholders.ev.seq, stakeholders.text)] : []
  );

  const metricDef = messages.find((m) => /metric|accuracy|precision|recall|optimize|measure|evaluate/.test(m.text.toLowerCase()));
  add(
    "metric_defined",
    metricDef ? (/\b(optimize|metric|measure)\b/.test(metricDef.text.toLowerCase()) ? 2 : 1) : 0,
    metricDef ? "Evaluation metric discussed." : "No metric defined.",
    metricDef ? [evidenceQuote(sectionId, metricDef.ev.seq, metricDef.text)] : []
  );

  const constraints = messages.find((m) => /constraint|latency|cost|memory|limit|budget|real-?time/.test(m.text.toLowerCase()));
  add(
    "constraints_named",
    constraints ? 1 : 0,
    constraints ? "Constraints mentioned." : "No constraints named.",
    constraints ? [evidenceQuote(sectionId, constraints.ev.seq, constraints.text)] : []
  );

  const assumptions = messages.find((m) => /assumption|assume|assuming/.test(m.text.toLowerCase()));
  add(
    "assumptions_articulated",
    assumptions ? 1 : 0,
    assumptions ? "Assumptions articulated." : "No assumptions articulated.",
    assumptions ? [evidenceQuote(sectionId, assumptions.ev.seq, assumptions.text)] : []
  );

  return signals;
}

// --- Section 2: Modeling Strategy ---
function extractSection2Signals(events: InterviewEvent[]): SignalOutput[] {
  const sectionId = "section_2";
  const messages = getCandidateMessages(events, sectionId);

  const add = (name: string, value: 0 | 1 | 2, explanation: string, evidence: EvidencePointer[]) => {
    return { name, value, explanation, evidence };
  };
  const signals: SignalOutput[] = [];

  const modelFamily = messages.find((m) => /model|approach|strategy|family|would use|first then|pipeline/.test(m.text.toLowerCase()));
  signals.push(add("model_family_justified", modelFamily ? 1 : 0, modelFamily ? "Model or approach discussed." : "No model family justification.", modelFamily ? [evidenceQuote(sectionId, modelFamily.ev.seq, modelFamily.text)] : []));

  const featureStrategy = messages.find((m) => /feature|input|variable|predictor/.test(m.text.toLowerCase()));
  signals.push(add("feature_strategy", featureStrategy ? 1 : 0, featureStrategy ? "Feature strategy mentioned." : "No feature strategy.", featureStrategy ? [evidenceQuote(sectionId, featureStrategy.ev.seq, featureStrategy.text)] : []));

  const tradeoffs = messages.find((m) => /tradeoff|trade-off|sacrifice|vs\.|versus|balance|prioritize/.test(m.text.toLowerCase()));
  signals.push(add("tradeoffs_discussed", tradeoffs ? (tradeoffs.text.length > 60 ? 2 : 1) : 0, tradeoffs ? "Tradeoffs discussed." : "No tradeoffs discussed.", tradeoffs ? [evidenceQuote(sectionId, tradeoffs.ev.seq, tradeoffs.text)] : []));

  const failureModes = messages.find((m) => /failure|fail|edge case|error|when it breaks/.test(m.text.toLowerCase()));
  signals.push(add("failure_modes", failureModes ? 1 : 0, failureModes ? "Failure modes mentioned." : "No failure modes.", failureModes ? [evidenceQuote(sectionId, failureModes.ev.seq, failureModes.text)] : []));

  const deployment = messages.find((m) => /deploy|production|serving|latency|throughput/.test(m.text.toLowerCase()));
  signals.push(add("deployment_considerations", deployment ? 1 : 0, deployment ? "Deployment considered." : "No deployment considerations.", deployment ? [evidenceQuote(sectionId, deployment.ev.seq, deployment.text)] : []));

  return signals;
}

// --- Section 3: System Design & Failure Modes (discussion only) ---
function extractSection3Signals(events: InterviewEvent[]): SignalOutput[] {
  const sectionId = "section_3";
  const messages = getCandidateMessages(events, sectionId);
  const add = (name: string, value: 0 | 1 | 2, explanation: string, evidence: EvidencePointer[]) => {
    return { name, value, explanation, evidence };
  };
  const signals: SignalOutput[] = [];

  const structure = messages.find((m) => /training|inference|pipeline|batch|online|serving|structure/.test(m.text.toLowerCase()));
  signals.push(add("system_structure_mentioned", structure ? 1 : 0, structure ? "System structure discussed." : "No system structure.", structure ? [evidenceQuote(sectionId, structure.ev.seq, structure.text)] : []));

  const failureModes = messages.find((m) => /failure|fail|go wrong|risk|break|error/.test(m.text.toLowerCase()));
  signals.push(add("failure_modes_section3", failureModes ? 1 : 0, failureModes ? "Failure modes or risks mentioned." : "No failure modes.", failureModes ? [evidenceQuote(sectionId, failureModes.ev.seq, failureModes.text)] : []));

  const monitoring = messages.find((m) => /monitor|detect|alert|observab|metric|validate/.test(m.text.toLowerCase()));
  signals.push(add("monitoring_or_validation", monitoring ? 1 : 0, monitoring ? "Monitoring or validation mentioned." : "No monitoring.", monitoring ? [evidenceQuote(sectionId, monitoring.ev.seq, monitoring.text)] : []));

  return signals;
}

// --- Section Coding: code submission and quality ---
function extractSectionCodingSignals(events: InterviewEvent[]): SignalOutput[] {
  const sectionId = "section_coding";
  const sectionEvents = getSectionEvents(events, sectionId);
  const codeEvents = sectionEvents.filter((e) => e.event_type === "CANDIDATE_CODE_SUBMITTED");
  const testEvents = sectionEvents.filter((e) => e.event_type === "CODE_TESTS_RESULT");
  const messages = getCandidateMessages(events, sectionId);

  const add = (name: string, value: 0 | 1 | 2, explanation: string, evidence: EvidencePointer[]) => {
    return { name, value, explanation, evidence };
  };
  const signals: SignalOutput[] = [];

  let correctnessValue: 0 | 1 | 2 = 0;
  const evidence: EvidencePointer[] = [];
  const passedResult = testEvents.find((e) => (e.payload?.passed as boolean) === true || (e.payload?.all_passed as boolean) === true);
  if (passedResult) {
    correctnessValue = 2;
    evidence.push({ type: "test_output", section_id: sectionId, from_seq: passedResult.seq, to_seq: passedResult.seq, metadata: { passed: true } });
  } else if (codeEvents.length > 0) {
    correctnessValue = 1;
    const ev = codeEvents[codeEvents.length - 1];
    const code = (ev.payload?.code_text as string) ?? "";
    evidence.push({ type: "code_excerpt", section_id: sectionId, from_seq: ev.seq, to_seq: ev.seq, quote: snippet(code) });
  }
  signals.push(add("core_logic_correctness_proxy", correctnessValue, passedResult ? "Tests passed." : codeEvents.length ? "Code submitted; no test result." : "No code or test evidence.", evidence));

  const edgeCases = messages.find((m) => /edge case|boundary|empty|null|handle|corner/.test(m.text.toLowerCase()));
  signals.push(add("edge_cases_mentioned", edgeCases ? 1 : 0, edgeCases ? "Edge cases mentioned." : "No edge cases.", edgeCases ? [evidenceQuote(sectionId, edgeCases.ev.seq, edgeCases.text)] : []));

  let readabilityValue: 0 | 1 | 2 = 0;
  const readEvidence: EvidencePointer[] = [];
  if (codeEvents.length > 0) {
    const last = codeEvents[codeEvents.length - 1];
    const code = (last.payload?.code_text as string) ?? "";
    const hasFunction = /\bdef\s+\w+/.test(code) || /\bfunction\s+\w+/.test(code);
    const reasonableNames = (code.match(/\b[a-z][a-z0-9_]{2,}\b/g) || []).length >= 2;
    readabilityValue = hasFunction && reasonableNames ? 2 : hasFunction || reasonableNames ? 1 : 0;
    if (readabilityValue > 0) readEvidence.push({ type: "code_excerpt", section_id: sectionId, from_seq: last.seq, to_seq: last.seq, quote: snippet(code) });
  }
  signals.push(add("readability_proxy", readabilityValue as 0 | 1 | 2, readabilityValue ? "Code structure/naming present." : "No code or minimal structure.", readEvidence));

  const complexity = messages.find((m) => /complexity|o\(n|time|space|linear|quadratic/.test(m.text.toLowerCase()));
  signals.push(add("complexity_awareness", complexity ? 1 : 0, complexity ? "Complexity discussed." : "No complexity discussion.", complexity ? [evidenceQuote(sectionId, complexity.ev.seq, complexity.text)] : []));

  return signals;
}

// --- Section 4: Reflection ---
function extractSection4Signals(events: InterviewEvent[]): SignalOutput[] {
  const sectionId = "section_4";
  const messages = getCandidateMessages(events, sectionId);

  const add = (name: string, value: 0 | 1 | 2, explanation: string, evidence: EvidencePointer[]) => {
    return { name, value, explanation, evidence };
  };
  const signals: SignalOutput[] = [];

  const limitations = messages.find((m) => /limitation|limit|wouldn't|would not|weakness|improve|differently/.test(m.text.toLowerCase()));
  signals.push(add("limitations_identified", limitations ? 1 : 0, limitations ? "Limitations identified." : "No limitations.", limitations ? [evidenceQuote(sectionId, limitations.ev.seq, limitations.text)] : []));

  const improvements = messages.find((m) => /improve|better|refactor|next step|more time/.test(m.text.toLowerCase()));
  signals.push(add("improvements_proposed", improvements ? 1 : 0, improvements ? "Improvements proposed." : "No improvements.", improvements ? [evidenceQuote(sectionId, improvements.ev.seq, improvements.text)] : []));

  const realWorld = messages.find((m) => /real.?world|production|constraint|practical/.test(m.text.toLowerCase()));
  signals.push(add("real_world_constraints_awareness", realWorld ? 1 : 0, realWorld ? "Real-world awareness." : "No real-world context.", realWorld ? [evidenceQuote(sectionId, realWorld.ev.seq, realWorld.text)] : []));

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
