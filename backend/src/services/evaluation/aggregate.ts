/**
 * Overall score and band for mock1-eval (mock1-weights-v1).
 * If any required metric is missing from metrics array, overall_score = null.
 */

import type { EvaluationOutput, MetricOutput } from "./types";
import { MOCK1_METRIC_NAMES } from "./types";

const MOCK1_WEIGHTS: Record<string, number> = {
  [MOCK1_METRIC_NAMES[0]]: 0.2,   // M1 — Problem Decomposition
  [MOCK1_METRIC_NAMES[1]]: 0.25,  // M2 — Modeling Judgment
  [MOCK1_METRIC_NAMES[2]]: 0.2,   // M3 — System Design
  [MOCK1_METRIC_NAMES[3]]: 0.15,  // M4 — Implementation
  [MOCK1_METRIC_NAMES[4]]: 0.1    // M5 — Reflection
};

export function computeOverallScoreAndBand(
  metrics: MetricOutput[],
  _implementationQualityNull: boolean
): { overall_score: number | null; overall_band: EvaluationOutput["overall_band"] } {
  if (metrics.length < 5) {
    return { overall_score: null, overall_band: null };
  }

  const byName = new Map(metrics.map((m) => [m.name, m]));
  let weightedSum = 0;
  let totalWeight = 0;
  for (const name of MOCK1_METRIC_NAMES) {
    const w = MOCK1_WEIGHTS[name];
    if (w == null) continue;
    const m = byName.get(name);
    const val =
      m && typeof m.value === "number" && !Number.isNaN(m.value) ? m.value : 0;
    weightedSum += val * w;
    totalWeight += w;
  }

  const divisor = totalWeight >= 0.99 ? totalWeight : 1;
  const overall_score = Math.round((weightedSum / divisor) * 100) / 100;

  let overall_band: EvaluationOutput["overall_band"] = null;
  if (overall_score >= 0.8) overall_band = "STRONG_SIGNAL";
  else if (overall_score >= 0.5) overall_band = "MIXED_SIGNAL";
  else overall_band = "WEAK_SIGNAL";

  return { overall_score, overall_band };
}
