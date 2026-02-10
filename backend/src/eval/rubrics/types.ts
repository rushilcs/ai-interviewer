/**
 * Rubric config for interview-specific LLM judge evaluation.
 *
 * To add a new interview: (1) add a rubric file in this directory exporting a RubricConfig
 * (schemaVersion, sections with base_rubric_prompt, followup_scoring_rules, optional anchors);
 * (2) register it in getRubricConfig() below by schemaVersion.
 */

export type SectionRubricConfig = {
  score_range: [number, number];
  /** Criteria for grading the INITIAL question only (shared for all candidates). */
  base_rubric_prompt: string;
  /** Instructions for grading follow-up answers (apply only to follow-ups actually asked). */
  followup_scoring_rules: string;
  /** Optional calibration anchors: what 0.2, 0.6, 0.9 look like. */
  anchors?: {
    "0.2": string;
    "0.6": string;
    "0.9": string;
  };
};

export type RubricConfig = {
  schemaVersion: string;
  sections: Record<string, SectionRubricConfig>;
};

import { MLE_V1_RUBRIC } from "./mle-v1";

export function getRubricConfig(schemaVersion: string): RubricConfig | null {
  switch (schemaVersion) {
    case "mle-v1":
      return MLE_V1_RUBRIC;
    default:
      return null;
  }
}
