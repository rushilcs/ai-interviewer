/**
 * Deterministic coverage model: infer which coverage_tags are satisfied
 * from candidate messages only. Transparent keyword/phrase heuristics.
 * No probabilistic logic; silence or lack of keywords = uncovered.
 */

import type { InterviewEvent } from "./state";

/**
 * Coverage state per section: set of coverage_tags that have been satisfied.
 */
export type CoverageState = Set<string>;

/**
 * Heuristics: for each coverage_tag, list of phrases (case-insensitive match).
 * If any candidate message in the section contains any phrase, the tag is satisfied.
 */
const TAG_PHRASES: Record<string, string[]> = {
  problem_restatement: ["problem", "goal", "outcome", "restate", "understand", "success"],
  metrics: ["accuracy", "precision", "recall", "f1", "metric", "optimize", "measure", "evaluate", "loss", "auc"],
  constraints: ["latency", "cost", "memory", "constraint", "limit", "budget", "real-time", "throughput"],
  strategy_overview: ["approach", "strategy", "model", "would use", "first", "then", "pipeline"],
  tradeoffs: ["tradeoff", "trade-off", "sacrifice", "simplify", "vs", "versus", "balance", "prioritize"],
  alternatives: ["alternative", "considered", "instead", "could also", "another approach", "option"],
  implementation: ["def ", "function", "class", "return", "import", "loop", "implement"],
  complexity: ["complexity", "o(n", "o(n)", "time", "space", "linear", "quadratic", "log"],
  edge_cases: ["edge case", "edge-case", "empty", "null", "boundary", "handle", "corner"],
  reflection: ["reflect", "differently", "more time", "prioritize", "learn", "improve"],
  improvements: ["improve", "better", "refactor", "optimize", "would change", "next step"]
};

/**
 * Check if a single message text satisfies a tag (any of its phrases present).
 */
function messageSatisfiesTag(text: string, tag: string): boolean {
  const phrases = TAG_PHRASES[tag];
  if (!phrases) return false;
  const lower = text.toLowerCase();
  return phrases.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * Compute coverage state for a section from events.
 * Only CANDIDATE_MESSAGE events in that section (by section_id at event time) are considered.
 * Returns the set of coverage_tags satisfied by at least one message.
 */
export function computeCoverageForSection(
  sectionId: string,
  events: InterviewEvent[]
): CoverageState {
  const satisfied = new Set<string>();
  const tags = Object.keys(TAG_PHRASES);

  for (const ev of events) {
    if (ev.event_type !== "CANDIDATE_MESSAGE") continue;
    if (ev.section_id !== sectionId) continue;

    const text = typeof ev.payload?.text === "string" ? ev.payload.text : "";
    for (const tag of tags) {
      if (messageSatisfiesTag(text, tag)) {
        satisfied.add(tag);
      }
    }
  }

  return satisfied;
}

/**
 * Check if all coverage_tags required by a prompt are satisfied in the given coverage state.
 */
export function areTagsSatisfied(requiredTags: string[], coverage: CoverageState): boolean {
  return requiredTags.every((t) => coverage.has(t));
}
