/**
 * Safety post-processor: detect and strip disallowed output (code, step-by-step).
 * If disallowed content is found, replace with a safe template.
 */

const MAX_LENGTH = 1200;

const STEP_PATTERN = /(?:^|\n)\s*(?:step\s*\d+|^\s*\d+[\.\)]\s*)/im;
const MULTI_LINE_CODE_LIKE = /(?:def\s+\w+|function\s+\w+|class\s+\w+|import\s+|return\s+[^\n]+)\s*\n/g;

const SAFE_FALLBACK =
  "I can only give high-level guidance here. Consider: what’s the core operation you need? What are the inputs and outputs? Try writing a one-line description of the step you’re stuck on.";

/**
 * Detect disallowed output: code blocks, step-by-step, or code-like multi-line.
 */
export function detectDisallowedOutput(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  if (text.includes("```")) return true;
  if (STEP_PATTERN.test(text)) return true;
  const lineCount = (text.match(/\n/g) || []).length;
  if (lineCount >= 3 && MULTI_LINE_CODE_LIKE.test(text)) return true;
  return false;
}

/**
 * Sanitize: remove fenced code blocks, trim to max length.
 * Does not replace with fallback; use detectDisallowedOutput + fallback in caller if needed.
 */
export function sanitizeOutput(text: string): string {
  if (!text || typeof text !== "string") return "";
  let out = text.replace(/```[\s\S]*?```/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (out.length > MAX_LENGTH) {
    out = out.slice(0, MAX_LENGTH - 3) + "...";
  }
  return out;
}

/**
 * Full pipeline: if disallowed content detected, return safe fallback; else return sanitized text.
 */
export function postprocessResponse(text: string): { text: string; wasReplaced: boolean } {
  const disallowed = detectDisallowedOutput(text);
  if (disallowed) {
    return { text: SAFE_FALLBACK, wasReplaced: true };
  }
  return { text: sanitizeOutput(text), wasReplaced: false };
}
