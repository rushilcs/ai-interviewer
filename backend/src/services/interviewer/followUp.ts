/**
 * Generate exactly one follow-up question from the interviewer AI.
 * Must select one allowed intent, be grounded in the candidate's last answer,
 * and not provide hints, explanations, or multiple questions.
 * Stop condition: when coverage checkpoints for the section are met (≥K), MUST output [NO_MORE_FOLLOWUPS].
 */

import { getSectionSpec } from "../../specs/mock-1";
import { env } from "../../config/env";

/** Coverage checkpoints per section (not applied to section_coding). When ≥K are satisfied, LLM MUST stop. */
export const COVERAGE_CHECKPOINTS: Record<
  string,
  { checkpoints: string[]; k: number }
> = {
  section_1: {
    checkpoints: [
      "Restates the goal in own words",
      "Identifies user value / objective",
      "Mentions success metrics or evaluation",
      "Mentions constraints (latency, scale, personalization, etc.)",
      "Mentions available signals/data"
    ],
    k: 4
  },
  section_2: {
    checkpoints: [
      "Proposes a baseline model",
      "Mentions ranking objective/loss",
      "Mentions feature types",
      "Mentions evaluation strategy",
      "Mentions cold start or exploration"
    ],
    k: 4
  },
  section_3: {
    checkpoints: [
      "Describes multi-stage architecture",
      "Addresses training vs inference separation",
      "Mentions data logging / feature stores",
      "Mentions monitoring or feedback loops",
      "Mentions retraining/deployment"
    ],
    k: 4
  },
  section_4: {
    checkpoints: [
      "Identifies next improvements",
      "Mentions experiment or validation plan",
      "Mentions risks or limitations",
      "Mentions scaling/production concerns"
    ],
    k: 3
  }
};

export type GenerateFollowUpArgs = {
  section_id: string;
  last_candidate_message: string;
  /** Recent questions already asked in this section; do not ask something similar. */
  recent_questions_in_section?: string[];
  /** Transcript of Q&A from previous sections so the LLM does not repeat questions already answered. */
  previous_sections_transcript?: string;
};

/** text is null when the LLM decided no more follow-ups are needed (candidate gave sufficient depth). */
export type GenerateFollowUpResult = { text: string | null };

export type GenerateFollowUpQuestionFn = (
  args: GenerateFollowUpArgs
) => Promise<GenerateFollowUpResult>;

let followUpImpl: GenerateFollowUpQuestionFn | null = null;

export function setGenerateFollowUpQuestionImpl(fn: GenerateFollowUpQuestionFn | null): void {
  followUpImpl = fn;
}

type BuildFollowUpSystemPromptOptions = {
  section_id: string;
  intentsText: string;
  disallowedText: string;
  recent_questions_in_section?: string[];
  previous_sections_transcript?: string;
};

/**
 * Build the system prompt for follow-up generation. Exported for tests (coverage checkpoints + stop rule).
 */
export function buildFollowUpSystemPrompt(options: BuildFollowUpSystemPromptOptions): string {
  const {
    section_id,
    intentsText,
    disallowedText,
    recent_questions_in_section,
    previous_sections_transcript
  } = options;

  const recentBlock =
    recent_questions_in_section && recent_questions_in_section.length > 0
      ? `

CRITICAL — NO DUPLICATES OR REPHRASES: You MUST NOT ask a question that is the same as or a rephrase of any of these already-asked questions in this section:
${recent_questions_in_section.map((q) => `- "${q}"`).join("\n")}
Examples of FORBIDDEN rephrases: "How would you monitor X?" vs "How would you handle monitoring X?" — same question. "What metrics would you use?" vs "Which metrics would you use?" — same question. If the only change is wording (e.g. "monitor" vs "handle monitoring", "after deployment" vs "once deployed"), that is FORBIDDEN. Choose a genuinely different topic or intent from the allowed list, or output [NO_MORE_FOLLOWUPS] if no distinct question remains.
`
      : "";

  const previousSectionsBlock =
    previous_sections_transcript && previous_sections_transcript.trim()
      ? `\nLONG-TERM MEMORY — Transcript from earlier sections. Do NOT ask a question substantially the same as one they already answered.\n\nEarlier sections:\n${previous_sections_transcript.slice(0, 6000)}\n\n`
      : "";

  const coverage = COVERAGE_CHECKPOINTS[section_id];
  const coverageBlock =
    coverage != null
      ? `

COVERAGE CHECKPOINTS for this section (use these to decide when to stop):
${coverage.checkpoints.map((c) => `- ${c}`).join("\n")}

STOP RULE (mandatory): Silently check which of the above checkpoints the candidate has already satisfied in their answers in this section. If the candidate has satisfied **at least ${coverage.k}** of these checkpoints, you MUST output exactly [NO_MORE_FOLLOWUPS] and nothing else. Do not ask another question when coverage is met.
Any follow-up question MUST target a **missing** checkpoint. If no checkpoints are missing (or ≥${coverage.k} are already satisfied), you MUST output [NO_MORE_FOLLOWUPS].
`
      : "";

  return `You are the interviewer in a technical ML interview. Your only job is to ask exactly ONE concise follow-up question, OR to signal that no more follow-ups are needed.

NEVER output [NO_MORE_FOLLOWUPS] when the candidate:
- Refuses to answer, asks to skip or move on (e.g. "let's move on", "skip this", "next question").
- Gives a non-answer, deflects, or clearly avoids the question.
- Says they don't know without any attempt to reason or speculate.

In those cases you MUST ask a follow-up (rephrase or ask from a different angle). When coverage is sufficient (see stop rule below), output exactly:
[NO_MORE_FOLLOWUPS]
${coverageBlock}

RULES (strict):
1. You must choose exactly ONE of the allowed follow-up intents listed below. Your question must fit that intent.
2. Your question must be grounded in the candidate's most recent answer.
3. Do NOT ask a question the candidate has already answered (this section or previous). Never ask them to repeat.
4. Ask only one question. Do not provide hints, explanations, or validation.${recentBlock}${previousSectionsBlock}

Allowed follow-up intents for this section (choose one):
${intentsText}

Disallowed behavior:
${disallowedText}

Output only either: (a) the single follow-up question, no prefix; or (b) exactly [NO_MORE_FOLLOWUPS] if no further follow-up is needed.`;
}

/**
 * Returns true if newQuestion is a duplicate or near-duplicate of any question in existingQuestions.
 * Used as a hard guardrail so we never surface a repeat or rephrase to the candidate.
 * Uses normalized word overlap (content words); no LLM or embeddings.
 */
export function isDuplicateOrNearDuplicate(
  newQuestion: string,
  existingQuestions: string[]
): boolean {
  if (!newQuestion.trim() || existingQuestions.length === 0) return false;

  const newWords = getContentWords(newQuestion);
  if (newWords.size === 0) return false;

  for (const existing of existingQuestions) {
    if (!existing.trim()) continue;
    const existingWords = getContentWords(existing);
    const overlap = countOverlap(newWords, existingWords);
    const ratio = overlap / Math.min(newWords.size, existingWords.size);
    if (ratio >= DUPLICATE_OVERLAP_THRESHOLD) return true;
  }
  return false;
}

const DUPLICATE_OVERLAP_THRESHOLD = 0.65;

function normalizeForDuplicateCheck(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "a", "an", "and", "are", "be", "been", "being", "by", "can", "could", "did", "do", "does",
  "for", "had", "has", "have", "in", "is", "it", "its", "may", "might", "of", "on", "or",
  "our", "should", "that", "the", "this", "to", "was", "were", "we", "will", "would",
  "you", "your"
]);

function stem(w: string): string {
  if (w.length <= 4) return w;
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("ly") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  return w;
}

function getContentWords(question: string): Set<string> {
  const normalized = normalizeForDuplicateCheck(question);
  const tokens = normalized.split(" ").filter(Boolean);
  const out = new Set<string>();
  for (const t of tokens) {
    if (STOPWORDS.has(t)) continue;
    const s = stem(t);
    if (s.length >= 2) out.add(s);
  }
  return out;
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) {
    if (b.has(w)) n++;
  }
  return n;
}

/** Candidate is refusing/skipping; we must not accept [NO_MORE_FOLLOWUPS] and must ask a follow-up. */
function looksLikeRefusalOrSkip(message: string): boolean {
  const lower = message.trim().toLowerCase();
  const refusalPhrases = [
    "don't want to answer",
    "dont want to answer",
    "let's move on",
    "lets move on",
    "move on",
    "skip this",
    "skip the question",
    "next question",
    "next section",
    "don't know",
    "dont know",
    "no idea",
    "pass on this",
    "rather not answer",
    "prefer not to answer",
    "can we skip",
    "want to skip"
  ];
  return refusalPhrases.some((p) => lower.includes(p));
}

export async function generateFollowUpQuestion(
  args: GenerateFollowUpArgs
): Promise<GenerateFollowUpResult> {
  if (followUpImpl) return followUpImpl(args);

  const spec = getSectionSpec(args.section_id);
  if (!spec) throw new Error(`Unknown section: ${args.section_id}`);

  const intentsText = spec.allowed_follow_up_intents
    .map((i) => `- **${i.name}**: ${i.description}`)
    .join("\n");
  const disallowedText = spec.disallowed.join("\n");

  const systemPrompt = buildFollowUpSystemPrompt({
    section_id: args.section_id,
    intentsText,
    disallowedText,
    recent_questions_in_section: args.recent_questions_in_section,
    previous_sections_transcript: args.previous_sections_transcript
  });

  const userContent = `Candidate's most recent answer:\n\n${args.last_candidate_message.slice(0, 2000)}`;

  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL ?? "gpt-4.1-mini";
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for interviewer follow-up");

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    max_tokens: 150,
    temperature: 0.2
  });

  let text = completion.choices[0]?.message?.content?.trim() ?? "";
  text = text.replace(/^["']|["']$/g, "").trim();

  const noMoreSentinel = "[NO_MORE_FOLLOWUPS]";
  const llmWantsToStop =
    text.toUpperCase().includes(noMoreSentinel.toUpperCase()) || text.trim() === noMoreSentinel;

  if (llmWantsToStop) {
    if (looksLikeRefusalOrSkip(args.last_candidate_message)) {
      return {
        text: "Could you give a high-level take on that, even if brief? We can then move on."
      };
    }
    return { text: null };
  }
  if (!text) text = "Could you elaborate on that?";

  const recent = args.recent_questions_in_section ?? [];
  if (recent.length > 0 && isDuplicateOrNearDuplicate(text, recent)) {
    return { text: null };
  }
  return { text };
}
