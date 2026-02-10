/**
 * Shared types for deterministic evaluation (signals → metrics → evidence).
 * Every score/metric must be backed by explicit evidence pointers.
 */

export type EvidencePointer = {
  type: "transcript_quote" | "event_range" | "code_excerpt" | "test_output";
  section_id: string | null;
  from_seq?: number;
  to_seq?: number;
  quote?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
};

export type SignalOutput = {
  name: string;
  value: 0 | 1 | 2;
  explanation: string;
  evidence: EvidencePointer[];
};

export type MetricOutput = {
  name: string;
  value: number;
  scale: "0-1" | "0-5";
  explanation: string;
  evidence: EvidencePointer[];
};

export type SectionEvaluation = {
  section_id: string;
  summary: string;
  signals: SignalOutput[];
  metrics: MetricOutput[];
};

export type EvaluationOutput = {
  interview_id: string;
  evaluation_version: string;
  signal_defs_version: string;
  metric_weights_version: string;
  overall_score: number | null;
  overall_band: "STRONG_SIGNAL" | "MIXED_SIGNAL" | "WEAK_SIGNAL" | null;
  metrics: MetricOutput[];
  sections: SectionEvaluation[];
  context: {
    assistant_usage_count: number;
    time_per_section_seconds: Record<string, number>;
    disconnect_count: number;
  };
};

export const EVALUATION_VERSION = "ess-v1";
export const SIGNAL_DEFS_VERSION = "signals-v1";
export const METRIC_WEIGHTS_VERSION = "weights-v1";
