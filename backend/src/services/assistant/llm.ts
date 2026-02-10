/**
 * LLM integration for assistant responses. Real OpenAI in production.
 * Tests inject a mock via setGenerateAssistantResponseImpl.
 */

export type GenerateAssistantResponseArgs = {
  category: "concept" | "docs" | "nudge";
  queryText: string;
  sectionId: string | null;
  currentPromptText: string | null;
};

export type GenerateAssistantResponseResult = { text: string };

export type GenerateAssistantResponseFn = (
  args: GenerateAssistantResponseArgs
) => Promise<GenerateAssistantResponseResult>;

let impl: GenerateAssistantResponseFn | null = null;

/**
 * Set the implementation (used by tests to inject a mock). Production uses real OpenAI.
 */
export function setGenerateAssistantResponseImpl(fn: GenerateAssistantResponseFn | null): void {
  impl = fn;
}

/**
 * Generate assistant response. Uses injected impl if set, otherwise real OpenAI.
 */
export async function generateAssistantResponse(
  args: GenerateAssistantResponseArgs
): Promise<GenerateAssistantResponseResult> {
  if (impl) return impl(args);
  return generateAssistantResponseOpenAI(args);
}

async function generateAssistantResponseOpenAI(
  args: GenerateAssistantResponseArgs
): Promise<GenerateAssistantResponseResult> {
  const { env } = await import("../../config/env");
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL ?? "gpt-4.1-mini";
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for assistant");

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });

  const systemPrompt = `You are a bounded interview assistant. You may:
- Explain concepts (definitions, e.g. bias-variance, AUC, calibration) briefly.
- Clarify documentation-level details (API params, library usage) without full code.
- Nudge reasoning: frameworks, checklists, pitfalls, questions to consider.

You must NOT:
- Output code blocks or substantial code.
- Give step-by-step implementation instructions.
- Provide full solutions or complete the task for the candidate.

Be concise (target ≤ 1200 characters). You may ask at most one short clarifying question if needed.
For "docs" category you may mention syntax at documentation level but no code blocks.`;

  const userParts: string[] = [`Category: ${args.category}`, `Query: ${args.queryText}`];
  if (args.sectionId) userParts.push(`Section: ${args.sectionId}`);
  if (args.currentPromptText) userParts.push(`Current prompt context: ${args.currentPromptText.slice(0, 300)}`);

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userParts.join("\n") }
    ],
    max_tokens: 500,
    temperature: 0.3
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  return { text: text || "I don't have a response for that. Try rephrasing or breaking it down." };
}
