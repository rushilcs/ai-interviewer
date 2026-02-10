/**
 * Deterministic assistant policy: allow/block before any LLM call.
 * Block: full solutions, substantial code, step-by-step implementation.
 * Allow: concept, docs, nudge (explain concepts, clarify docs, nudge reasoning).
 */

export type PolicyDecision =
  | { action: "allow"; category: "concept" | "docs" | "nudge" }
  | { action: "block"; reason: string; safe_alternative: string };

const BLOCK_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(full\s+)?(solution|answer|code)\b/i, reason: "I can't provide full solutions or code." },
  { pattern: /\bgive\s+me\s+(the\s+)?(answer|solution|code)\b/i, reason: "I can't give you the answer or solution." },
  { pattern: /\bsolve\s+this\b/i, reason: "I can't solve the task for you." },
  { pattern: /\bwrite\s+(the\s+)?(full\s+)?code\b/i, reason: "I can't write code for you." },
  { pattern: /\bpaste\s+(the\s+)?code\b/i, reason: "I can't provide code to paste." },
  { pattern: /\b(complete\s+)?(implementation|script)\b/i, reason: "I can't provide implementation or scripts." },
  { pattern: /\bexact\s+steps\b/i, reason: "I can't give step-by-step implementation." },
  { pattern: /\bwalk\s+me\s+through\s+how\s+to\s+implement\b/i, reason: "I can't walk through implementation." },
  { pattern: /\bstep\s*1\s*[\.\)]\s*step\s*2/i, reason: "I can't provide step-by-step implementation." },
  { pattern: /\bimplement\s+(it|this)\s+(for\s+)?me\b/i, reason: "I can't implement it for you." },
  { pattern: /\bjust\s+(give|write|send)\s+(me\s+)?(the\s+)?code\b/i, reason: "I can't provide code." },
  { pattern: /\bcode\s+(that|which)\s+(solves|implements)\b/i, reason: "I can't provide solving code." }
];

const SAFE_ALTERNATIVE_TEMPLATE = `I can't provide that. Here are some ways to move forward:
• Break the problem into smaller pieces and tackle one at a time.
• What assumptions are you making? Write them down.
• What would the ideal output look like for a minimal input?
• Which part feels unclear—the goal, the constraints, or the approach?
• Try stating the core difficulty in one sentence.`;

/**
 * Evaluate assistant request. Rule-based, deterministic.
 * Applied BEFORE any LLM call.
 */
export function evaluateAssistantRequest(queryText: string): PolicyDecision {
  const trimmed = (queryText ?? "").trim();
  if (trimmed.length === 0) {
    return { action: "block", reason: "Empty query.", safe_alternative: SAFE_ALTERNATIVE_TEMPLATE };
  }

  for (const { pattern, reason } of BLOCK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { action: "block", reason, safe_alternative: SAFE_ALTERNATIVE_TEMPLATE };
    }
  }

  const lower = trimmed.toLowerCase();
  if (
    /\b(what\s+is|define|explain|meaning\s+of|difference\s+between)\b/.test(lower) ||
    /\b(bias[- ]variance|auc|roc|calibration|overfitting)\b/.test(lower)
  ) {
    return { action: "allow", category: "concept" };
  }
  if (
    /\b(api|parameter|argument|documentation|docs?|library|syntax)\b/.test(lower) ||
    /\b(how\s+do\s+I\s+use|what\s+does\s+this\s+param)\b/.test(lower)
  ) {
    return { action: "allow", category: "docs" };
  }
  return { action: "allow", category: "nudge" };
}
