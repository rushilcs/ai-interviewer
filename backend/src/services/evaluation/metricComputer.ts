/**
 * Deterministic metric computation from signals. 0-5 scale.
 * Missing signals = neutral; no negative inference.
 * implementation_quality only from section_coding; null if no code events.
 */

import type { EvidencePointer, MetricOutput, SignalOutput } from "./types";

function evidenceFromSignals(signals: SignalOutput[], names: string[], maxEvidence: number): EvidencePointer[] {
  const seen = new Set<string>();
  const out: EvidencePointer[] = [];
  for (const name of names) {
    const s = signals.find((x) => x.name === name);
    if (!s || s.evidence.length === 0) continue;
    for (const e of s.evidence) {
      const key = `${e.from_seq}-${e.quote ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
      if (out.length >= maxEvidence) return out;
    }
  }
  return out;
}

/**
 * Map signal value 0/1/2 to contribution (0 = 0, 1 = 0.5, 2 = 1.0) for averaging.
 */
function signalToScore(v: 0 | 1 | 2): number {
  if (v === 0) return 0;
  if (v === 1) return 0.5;
  return 1;
}

/**
 * Compute 0-5 score from a set of signal names (average of their contributions, then scale to 0-5).
 */
function scoreFromSignals(signals: SignalOutput[], names: string[]): number {
  let sum = 0;
  let count = 0;
  for (const name of names) {
    const s = signals.find((x) => x.name === name);
    if (s) {
      sum += signalToScore(s.value);
      count++;
    }
  }
  if (count === 0) return 0;
  const normalized = sum / count;
  return Math.round(normalized * 5 * 10) / 10;
}

export function computeMetrics(
  signals: SignalOutput[],
  hasCodeSection: boolean
): { metrics: MetricOutput[]; implementationQualityNull: boolean } {
  const metrics: MetricOutput[] = [];
  const scale: "0-5" = "0-5";

  const reasoningSignals = [
    "problem_restatement",
    "metric_defined",
    "constraints_named",
    "model_family_justified",
    "tradeoffs_discussed",
    "limitations_identified"
  ];
  const reasoningScore = scoreFromSignals(signals, reasoningSignals);
  metrics.push({
    name: "reasoning_quality",
    value: reasoningScore,
    scale,
    explanation: "Derived from problem framing, metric definition, tradeoffs, and reflection signals.",
    evidence: evidenceFromSignals(signals, reasoningSignals, 4)
  });

  const decompSignals = ["problem_restatement", "stakeholders_identified", "assumptions_articulated", "feature_strategy"];
  metrics.push({
    name: "problem_decomposition",
    value: scoreFromSignals(signals, decompSignals),
    scale,
    explanation: "Derived from problem restatement, stakeholders, assumptions, and feature strategy.",
    evidence: evidenceFromSignals(signals, decompSignals, 4)
  });

  const modelingSignals = ["model_family_justified", "tradeoffs_discussed", "failure_modes", "deployment_considerations"];
  metrics.push({
    name: "modeling_judgment",
    value: scoreFromSignals(signals, modelingSignals),
    scale,
    explanation: "Derived from model justification, tradeoffs, failure modes, deployment.",
    evidence: evidenceFromSignals(signals, modelingSignals, 4)
  });

  let implementationQualityNull = !hasCodeSection;
  const implSignals = ["core_logic_correctness_proxy", "edge_cases_mentioned", "readability_proxy", "complexity_awareness"];
  if (hasCodeSection) {
    metrics.push({
      name: "implementation_quality",
      value: scoreFromSignals(signals, implSignals),
      scale,
      explanation: "Derived from coding section signals: correctness proxy, edge cases, readability, complexity.",
      evidence: evidenceFromSignals(signals, implSignals, 4)
    });
  }

  const reflectionSignals = ["limitations_identified", "improvements_proposed", "real_world_constraints_awareness"];
  metrics.push({
    name: "reflection_maturity",
    value: scoreFromSignals(signals, reflectionSignals),
    scale,
    explanation: "Derived from limitations, improvements, real-world awareness.",
    evidence: evidenceFromSignals(signals, reflectionSignals, 4)
  });

  return { metrics, implementationQualityNull };
}
