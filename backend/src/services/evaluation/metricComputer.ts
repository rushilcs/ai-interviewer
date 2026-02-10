/**
 * Deterministic metric computation for mock1-eval.
 * Formulas: M1–M5 = sum(signal_values) / max_possible for their signals (0–1 scale).
 * All metrics must have evidence; no LLM. If any required metric cannot be computed, caller sets overall_score = null.
 */

import type { EvidencePointer, MetricOutput, SignalOutput } from "./types";
import { MOCK1_METRIC_NAMES } from "./types";
import {
  SECTION_1_SIGNALS,
  SECTION_2_SIGNALS,
  SECTION_3_SIGNALS,
  SECTION_CODING_SIGNALS,
  SECTION_4_SIGNALS
} from "./mock1Signals";

function getSignal(name: string, signals: SignalOutput[]): SignalOutput | undefined {
  return signals.find((s) => s.name === name);
}

function evidenceFromSignals(
  signals: SignalOutput[],
  names: readonly string[],
  maxEvidence: number
): EvidencePointer[] {
  const seen = new Set<string>();
  const out: EvidencePointer[] = [];
  for (const name of names) {
    const s = getSignal(name, signals);
    if (!s || s.evidence.length === 0) continue;
    for (const e of s.evidence) {
      const key = `${e.from_seq ?? ""}-${e.quote ?? ""}-${e.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
      if (out.length >= maxEvidence) return out;
    }
  }
  return out;
}

/**
 * Metric = sum(signal values 0|1|2) / max_possible. Scale 0-1.
 * max_possible = number of signals * 2.
 */
function metricFromSignals(
  signals: SignalOutput[],
  signalNames: readonly string[],
  name: string,
  explanation: string
): MetricOutput {
  let sum = 0;
  let count = 0;
  for (const n of signalNames) {
    const s = getSignal(n, signals);
    if (s) {
      sum += s.value;
      count++;
    }
  }
  const maxPossible = signalNames.length * 2;
  const value = maxPossible > 0 ? Math.round((sum / maxPossible) * 100) / 100 : 0;
  return {
    name,
    value,
    scale: "0-1",
    explanation,
    evidence: evidenceFromSignals(signals, signalNames, 6)
  };
}

export function computeMetrics(
  signals: SignalOutput[],
  hasCodeSection: boolean
): { metrics: MetricOutput[]; implementationQualityNull: boolean } {
  const metrics: MetricOutput[] = [];

  // M1 — Problem Decomposition (S1.1–S1.5)
  metrics.push(
    metricFromSignals(
      signals,
      SECTION_1_SIGNALS,
      MOCK1_METRIC_NAMES[0],
      "Derived from S1.1–S1.5: problem restatement, success metric, tradeoff, constraint, assumption."
    )
  );

  // M2 — Modeling Judgment (S2.1–S2.5)
  metrics.push(
    metricFromSignals(
      signals,
      SECTION_2_SIGNALS,
      MOCK1_METRIC_NAMES[1],
      "Derived from S2.1–S2.5: model justification, alternatives, feature reasoning, constraint sensitivity, failure modes."
    )
  );

  // M3 — System Design Reasoning (S3.1–S3.4)
  metrics.push(
    metricFromSignals(
      signals,
      SECTION_3_SIGNALS,
      MOCK1_METRIC_NAMES[2],
      "Derived from S3.1–S3.4: training/inference, monitoring, rollout, scalability."
    )
  );

  // M4 — Implementation Quality (C1–C4). When no code, signals are all 0 so M4 = 0 (still computed).
  metrics.push(
    metricFromSignals(
      signals,
      SECTION_CODING_SIGNALS,
      MOCK1_METRIC_NAMES[3],
      "Derived from C1–C4: functional correctness, edge cases, efficiency, code clarity."
    )
  );
  const implementationQualityNull = false;

  // M5 — Reflection & Maturity (S4.1–S4.3)
  metrics.push(
    metricFromSignals(
      signals,
      SECTION_4_SIGNALS,
      MOCK1_METRIC_NAMES[4],
      "Derived from S4.1–S4.3: limitation awareness, improvement prioritization, judgment under uncertainty."
    )
  );

  return { metrics, implementationQualityNull };
}
