/**
 * Follow-up budget and idea-coverage heuristics for mock1.
 * Used to allow up to 4 follow-ups only when answers are incomplete; default cap is 2.
 */

/** Default number of follow-ups per section when answers are strong. */
export const DEFAULT_FOLLOWUP_BUDGET = 2;

/** Hard cap: never exceed this many follow-ups per section (1 initial + this many follow-ups). */
export const MAX_FOLLOWUPS_PER_SECTION = 4;

/**
 * Per-section concepts that suggest the candidate has addressed key ideas.
 * Used by needs_more_followups: if the message lacks several of these for the section, we allow extra follow-ups.
 * Not length-based; a short answer that hits these can still be "complete."
 */
const SECTION_CONCEPT_SETS: Record<
  string,
  { present: string[]; missingOrUnclear: string[] }
> = {
  section_1: {
    present: [
      "goal",
      "objective",
      "achieve",
      "maximize",
      "value",
      "metric",
      "success",
      "measure",
      "evaluat",
      "ndcg",
      "click",
      "engagement",
      "tradeoff",
      "trade-off",
      "constraint",
      "latency",
      "scale",
      "data",
      "signal",
      "assumption",
      "personalization"
    ],
    missingOrUnclear: ["not sure", "don't know", "no idea", "skip", "unsure", "unclear"]
  },
  section_2: {
    present: [
      "model",
      "ranking",
      "baseline",
      "approach",
      "loss",
      "feature",
      "embedding",
      "evaluat",
      "offline",
      "online",
      "a/b",
      "experiment",
      "cold start",
      "exploration",
      "constraint",
      "latency",
      "interpretab"
    ],
    missingOrUnclear: ["not sure", "don't know", "no idea", "skip", "unsure"]
  },
  section_3: {
    present: [
      "training",
      "inference",
      "offline",
      "online",
      "stage",
      "pipeline",
      "logging",
      "feature store",
      "monitor",
      "feedback",
      "retrain",
      "deploy",
      "rollout",
      "failure",
      "risk"
    ],
    missingOrUnclear: ["not sure", "don't know", "no idea", "skip", "unsure"]
  },
  section_4: {
    present: [
      "improve",
      "next",
      "priority",
      "experiment",
      "validat",
      "risk",
      "limit",
      "scale",
      "production",
      "assumption"
    ],
    missingOrUnclear: ["not sure", "don't know", "no idea", "skip", "unsure"]
  }
};

/**
 * Returns true only when the candidate's last message suggests important conceptual
 * elements are missing or unclear, or they explicitly express uncertainty/refusal.
 * Does NOT use word count, sentence count, or formatting.
 * Short answers that cover the right ideas should return false (no extra follow-ups).
 */
export function needs_more_followups(lastCandidateMessage: string, section_id: string): boolean {
  const normalized = lastCandidateMessage.trim().toLowerCase();
  if (normalized.length === 0) return true;

  const set = SECTION_CONCEPT_SETS[section_id];
  if (!set) return false;

  // Explicit uncertainty or refusal -> needs more (or a re-ask)
  for (const phrase of set.missingOrUnclear) {
    if (normalized.includes(phrase)) return true;
  }

  // Count how many "present" concepts appear (at least as substrings)
  let hitCount = 0;
  for (const concept of set.present) {
    if (normalized.includes(concept)) hitCount++;
  }

  // Section-dependent minimum: if they touched very few key ideas, allow more follow-ups
  const minConcepts: Record<string, number> = {
    section_1: 3,
    section_2: 3,
    section_3: 3,
    section_4: 2
  };
  const min = minConcepts[section_id] ?? 3;
  return hitCount < min;
}
