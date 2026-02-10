/**
 * Signal definitions for mock1-eval (mock1-signals-v1).
 * All signals use 3-point ordinal scale: 0 = not demonstrated, 1 = partially, 2 = clearly demonstrated.
 * Absence of evidence → 0. Every signal must include explicit evidence pointers.
 */

export const MOCK1_SIGNAL_DEFS_VERSION = "mock1-signals-v1";

/** Section 1 — Problem Framing & Success Definition */
export const SECTION_1_SIGNALS = [
  "problem_restatement_clarity",   // S1.1
  "success_metric_identification",  // S1.2
  "metric_tradeoff_awareness",      // S1.3
  "constraint_awareness",           // S1.4
  "assumption_articulation"         // S1.5
] as const;

/** Section 2 — Modeling Strategy & Tradeoffs */
export const SECTION_2_SIGNALS = [
  "model_class_justification",      // S2.1
  "alternative_consideration",      // S2.2
  "feature_reasoning",              // S2.3
  "constraint_sensitivity",        // S2.4
  "failure_mode_awareness"         // S2.5
] as const;

/** Section 3 — System Design & Failure Modes */
export const SECTION_3_SIGNALS = [
  "training_vs_inference_separation", // S3.1
  "monitoring_detection",            // S3.2
  "safe_rollout_strategy",           // S3.3
  "scalability_awareness"            // S3.4
] as const;

/** Section 4 — Reflection & Judgment */
export const SECTION_4_SIGNALS = [
  "limitation_awareness",           // S4.1
  "improvement_prioritization",     // S4.2
  "judgment_under_uncertainty"      // S4.3
] as const;

/** Section Coding — Implementation Quality (test_output and code_excerpt only) */
export const SECTION_CODING_SIGNALS = [
  "functional_correctness",         // C1 — test_output only
  "edge_case_handling",             // C2 — code/test
  "algorithmic_efficiency_awareness", // C3 — code
  "code_clarity"                    // C4 — code
] as const;

export const ALL_MOCK1_SIGNAL_NAMES = [
  ...SECTION_1_SIGNALS,
  ...SECTION_2_SIGNALS,
  ...SECTION_3_SIGNALS,
  ...SECTION_CODING_SIGNALS,
  ...SECTION_4_SIGNALS
] as const;

/** Map section_id to signal names for section summaries and grouping */
export const MOCK1_SIGNALS_BY_SECTION: Record<string, readonly string[]> = {
  section_1: SECTION_1_SIGNALS,
  section_2: SECTION_2_SIGNALS,
  section_3: SECTION_3_SIGNALS,
  section_coding: SECTION_CODING_SIGNALS,
  section_4: SECTION_4_SIGNALS
};

export const SECTION_IDS_ORDER = ["section_1", "section_2", "section_3", "section_coding", "section_4"] as const;
