/**
 * Overall score and band from metrics. Fixed weights; renormalize if a metric is null.
 */

import type { EvaluationOutput, MetricOutput } from "./types";

const DEFAULT_WEIGHTS: Record<string, number> = {
  reasoning_quality: 0.3,
  problem_decomposition: 0.2,
  modeling_judgment: 0.25,
  implementation_quality: 0.15,
  reflection_maturity: 0.1
};

export function computeOverallScoreAndBand(
  metrics: MetricOutput[],
  implementationQualityNull: boolean
): { overall_score: number | null; overall_band: EvaluationOutput["overall_band"] } {
  const weights = { ...DEFAULT_WEIGHTS };
  if (implementationQualityNull) {
    delete weights.implementation_quality;
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(weights)) {
      weights[k] = weights[k] / sum;
    }
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (const m of metrics) {
    const w = weights[m.name];
    if (w != null && m.value != null && !Number.isNaN(m.value)) {
      weightedSum += m.value * w;
      totalWeight += w;
    }
  }
  if (totalWeight === 0) return { overall_score: null, overall_band: null };
  const overall_score = Math.round((weightedSum / totalWeight) * 10) / 10;

  let overall_band: EvaluationOutput["overall_band"] = null;
  if (overall_score >= 4.0) overall_band = "STRONG_SIGNAL";
  else if (overall_score >= 2.75) overall_band = "MIXED_SIGNAL";
  else overall_band = "WEAK_SIGNAL";

  return { overall_score, overall_band };
}
