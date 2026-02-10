/**
 * Generate exactly one follow-up question from the interviewer AI.
 * Must select one allowed intent, be grounded in the candidate's last answer,
 * and not provide hints, explanations, or multiple questions.
 */

import { getSectionSpec } from "../../specs/mock-1";
import { env } from "../../config/env";

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

  const recentBlock =
    args.recent_questions_in_section && args.recent_questions_in_section.length > 0
      ? `\n8. Do NOT ask a question that is similar to or rephrases any of these already-asked questions in this section:\n${args.recent_questions_in_section.map((q) => `- "${q}"`).join("\n")}\nChoose a different angle or intent. Never ask the candidate to reiterate what they already said.\n`
      : "";

  const previousSectionsBlock =
    args.previous_sections_transcript && args.previous_sections_transcript.trim()
      ? `\nLONG-TERM MEMORY — Transcript from earlier sections of this interview. You must not ask the candidate to repeat or re-cover ground they have already addressed. Do NOT ask a question that is substantially the same as one they already answered in a previous section.\n\nEarlier sections:\n${args.previous_sections_transcript.slice(0, 6000)}\n\n`
      : "";

  const systemPrompt = `You are the interviewer in a technical ML interview. Your only job is to ask exactly ONE concise follow-up question, OR to signal that no more follow-ups are needed.

WHEN TO OUTPUT [NO_MORE_FOLLOWUPS]: Only when the candidate has **substantively answered** the question and provided sufficient depth, detail, and expansion on their thoughts. You must be confident they engaged with the question.

NEVER output [NO_MORE_FOLLOWUPS] when the candidate:
- Refuses to answer, says they don't want to answer, or asks to skip or move on (e.g. "let's move on", "I don't want to answer", "skip this", "next question").
- Gives a non-answer, deflects, or clearly avoids the question.
- Says they don't know without any attempt to reason or speculate.

In those cases you MUST ask a follow-up: rephrase the question, ask from a different angle, or politely ask them to engage with the topic (e.g. "Could you give a high-level take, even if brief?"). Do not let the candidate end the section by refusing—only you decide when the section has enough depth.

When the candidate has substantively answered and you have enough depth, output exactly this line and nothing else:
[NO_MORE_FOLLOWUPS]

Otherwise, ask exactly one follow-up question. You may ask between 2 and 4 follow-ups in total in this section—you do NOT need to use all 4. Only output [NO_MORE_FOLLOWUPS] when they have actually engaged and provided substance.

RULES (strict):
1. You must choose exactly ONE of the allowed follow-up intents listed below. Your question must fit that intent.
2. Your question must be grounded in the candidate's most recent answer. Reference or build on what they said.
3. Do NOT ask a question that the candidate has already answered—in this section or in a previous section. If they addressed something you were going to ask, skip that and ask a different angle, or go deeper on an under-explored point. Never ask them to repeat or reiterate what they already said.
4. Ask only one question. Do not ask multiple questions in one turn.
5. Do not provide hints, explanations, metrics, corrections, or validation. Do not teach.
6. Keep the question concise and neutral (one or two sentences). Encourage the candidate to expand on their thoughts where they have been brief or where more depth would help.
7. Do not do any of the disallowed behaviors listed below.${recentBlock}${previousSectionsBlock}

Allowed follow-up intents for this section (choose one):
${intentsText}

Disallowed behavior:
${disallowedText}

Output only either: (a) the single follow-up question, with no prefix, no numbering, no explanation; or (b) exactly [NO_MORE_FOLLOWUPS] if no further follow-up is needed.`;

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
  return { text };
}
