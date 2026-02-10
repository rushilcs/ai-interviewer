/**
 * LLM-judge evaluator for non-coding sections: base rubric (initial question) + adaptive follow-up scoring.
 * Coding section remains deterministic (tests passed / total tests).
 * Guardrails: temperature 0, strict JSON, canonicalized transcript, server-side score combination.
 */

import { z } from "zod";
import type { InterviewEvent } from "../orchestration/state";
import { getRubricConfig, type SectionRubricConfig } from "../../eval/rubrics/types";
import type { EvaluationOutput, EvidencePointer, MetricOutput, SectionEvaluation } from "./types";
import { MOCK1_METRIC_NAMES } from "./types";
import { env } from "../../config/env";

const NON_CODING_SECTIONS = ["section_1", "section_2", "section_3", "section_4"] as const;
const SECTION_ORDER = ["section_1", "section_2", "section_3", "section_coding", "section_4"] as const;

const BASE_WEIGHT = 0.7;
const FOLLOWUP_WEIGHT = 0.3;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Canonicalization (deterministic) ---

export type CanonicalTurn = {
  role: "Q" | "A";
  label: "INITIAL" | "FOLLOWUP";
  text: string;
  turnIndex: number;
};

/**
 * Build a canonical section transcript: only PROMPT_PRESENTED and CANDIDATE_MESSAGE in order.
 * First question = INITIAL, rest = FOLLOWUP. No timestamps, no IDs.
 */
export function canonicalizeSectionTranscript(
  events: InterviewEvent[],
  sectionId: string
): { canonical: string; turns: CanonicalTurn[] } {
  const sectionEvents = events.filter((e) => (e.payload?.section_id ?? e.section_id) === sectionId);
  const turns: CanonicalTurn[] = [];
  let lastPrompt: string | null = null;
  let promptCount = 0;

  for (const e of sectionEvents) {
    if (e.event_type === "PROMPT_PRESENTED") {
      lastPrompt = (e.payload?.prompt_text as string) ?? "";
      if (!lastPrompt.trim()) continue;
      promptCount++;
      const label = promptCount === 1 ? "INITIAL" : "FOLLOWUP";
      turns.push({ role: "Q", label, text: lastPrompt.trim(), turnIndex: turns.length + 1 });
    } else if (e.event_type === "CANDIDATE_MESSAGE" && lastPrompt) {
      const text = (e.payload?.text as string) ?? "";
      turns.push({ role: "A", label: promptCount === 1 ? "INITIAL" : "FOLLOWUP", text: text.trim(), turnIndex: turns.length + 1 });
      lastPrompt = null;
    }
  }

  const lines: string[] = [];
  for (const t of turns) {
    const prefix = t.role === "Q" ? `[${t.label}] Q:` : "A:";
    lines.push(`${prefix} ${t.text}`);
  }
  const canonical = lines.join("\n\n");
  return { canonical, turns };
}

// --- Extraction pass (Pass 1) ---

const ExtractionSchema = z.object({
  initial_question: z.string(),
  followup_questions: z.array(z.string()),
  candidate_answers_to_initial: z.object({
    summary_bullets: z.array(z.string()),
    grounded_quotes: z.array(z.string())
  }),
  candidate_answers_to_each_followup: z.array(
    z.object({
      followup_question: z.string(),
      summary_bullets: z.array(z.string()),
      grounded_quotes: z.array(z.string())
    })
  )
});

type ExtractionResult = z.infer<typeof ExtractionSchema>;

// --- Scoring pass (Pass 2) ---

const SectionScoringSchema = z.object({
  base_initial_score: z.number().min(0).max(1),
  followup_score: z.number().min(0).max(1),
  rationale_bullets: z.array(z.string()),
  evidence: z.array(
    z.object({
      claim: z.string(),
      quote: z.string(),
      turn: z.number(),
      qa: z.enum(["Q", "A"])
    })
  )
});

type SectionScoringResult = z.infer<typeof SectionScoringSchema>;

// --- Judge output (per section + final) ---

export const JudgeSectionOutputSchema = z.object({
  section_id: z.string(),
  base_initial_score: z.number(),
  followup_score: z.number(),
  section_score: z.number(),
  rationale_bullets: z.array(z.string()),
  evidence: z.array(
    z.object({
      claim: z.string(),
      quote: z.string(),
      turn: z.number(),
      qa: z.enum(["Q", "A"])
    })
  )
});

export const JudgeOutputSchema = z.object({
  schemaVersion: z.string(),
  sections: z.record(z.string(), JudgeSectionOutputSchema),
  final_score: z.number()
});

export type JudgeSectionOutput = z.infer<typeof JudgeSectionOutputSchema>;
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

// --- LLM calls ---

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for LLM judge evaluation");
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0,
    max_tokens: 2000
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  return raw.replace(/^```json\s*|\s*```$/g, "").trim();
}

function buildExtractionPrompt(sectionId: string, canonical: string, _rubric: SectionRubricConfig): { system: string; user: string } {
  const system = `You are an evaluation extractor. Extract structured content from a section transcript.
Output valid JSON only, no markdown. Keys: initial_question (string), followup_questions (array of strings), candidate_answers_to_initial (object with summary_bullets and grounded_quotes arrays), candidate_answers_to_each_followup (array of objects with followup_question, summary_bullets, grounded_quotes).
- initial_question: the exact first question in the transcript (labeled [INITIAL] Q:).
- followup_questions: in order, each follow-up question (labeled [FOLLOWUP] Q:).
- candidate_answers_to_initial: bullets summarizing the candidate's response to the initial question, and grounded_quotes (short quotes from the candidate).
- candidate_answers_to_each_followup: one object per follow-up, in the same order as followup_questions.`;

  const user = `Section: ${sectionId}\n\nTranscript:\n${canonical}`;
  return { system, user };
}

function buildScoringPrompt(
  sectionId: string,
  extraction: ExtractionResult,
  rubric: SectionRubricConfig,
  schemaVersion: string
): { system: string; user: string } {
  const anchors = rubric.anchors
    ? `\nCalibration anchors:\n- 0.2: ${rubric.anchors!["0.2"]}\n- 0.6: ${rubric.anchors!["0.6"]}\n- 0.9: ${rubric.anchors!["0.9"]}`
    : "";

  const system = `You are an interview section scorer. Score only based on what was asked.
Output valid JSON only. Keys: base_initial_score (number 0-1), followup_score (number 0-1), rationale_bullets (array of 2-5 strings), evidence (array of objects with claim, quote, turn, qa "Q" or "A").
- base_initial_score: grade the candidate's response to the INITIAL question only, using the base rubric.${anchors}
- followup_score: grade only how well the candidate answered the follow-up questions that were actually asked (adherence + substantive detail). Do NOT penalize for content never asked. Use the follow-up scoring rules.
- rationale_bullets: 2-5 short bullets explaining the scores.
- evidence: cite candidate quotes (quote, turn number, qa "A") and which claim they support.

Base rubric for initial question:\n${rubric.base_rubric_prompt}

Follow-up scoring rules:\n${rubric.followup_scoring_rules}

Schema version: ${schemaVersion}.`;

  const user = `Section: ${sectionId}\n\nExtracted content:\n${JSON.stringify(extraction, null, 2)}`;
  return { system, user };
}

function parseJSON<T>(raw: string, schema: z.ZodType<T>): { success: true; data: T } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    if (result.success) return { success: true, data: result.data };
    return { success: false, error: result.error.message };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runExtractionPass(
  sectionId: string,
  canonical: string,
  rubric: SectionRubricConfig
): Promise<ExtractionResult | null> {
  const { system, user } = buildExtractionPrompt(sectionId, canonical, rubric);
  const raw = await callLLM(system, user);
  const parsed = parseJSON(raw, ExtractionSchema);
  if (parsed.success) return parsed.data;
  const retryRaw = await callLLM(
    system,
    user + "\n\n[Previous output was invalid. Fix the JSON to match the required schema exactly.]",
    false
  );
  const retry = parseJSON(retryRaw, ExtractionSchema);
  if (retry.success) return retry.data;
  console.error(`[llmJudge] Extraction failed for ${sectionId}:`, parsed.error, retry.error);
  return null;
}

async function runScoringPass(
  sectionId: string,
  extraction: ExtractionResult,
  rubric: SectionRubricConfig,
  schemaVersion: string
): Promise<SectionScoringResult | null> {
  const { system, user } = buildScoringPrompt(sectionId, extraction, rubric, schemaVersion);
  const raw = await callLLM(system, user);
  let parsed = parseJSON(raw, SectionScoringSchema);
  if (!parsed.success) {
    const retryRaw = await callLLM(
      system,
      user + "\n\n[Previous output was invalid JSON or out of range. Fix: base_initial_score and followup_score must be numbers between 0 and 1. Output valid JSON only.]"
    );
    parsed = parseJSON(retryRaw, SectionScoringSchema);
  }
  if (!parsed.success) {
    console.error(`[llmJudge] Scoring failed for ${sectionId}:`, parsed.error);
    return null;
  }
  return parsed.data;
}

export function computeSectionScore(
  base_initial_score: number,
  followup_score: number,
  numFollowups: number
): number {
  const b = Math.max(0, Math.min(1, base_initial_score));
  const f = numFollowups === 0 ? b : Math.max(0, Math.min(1, followup_score));
  return round2(BASE_WEIGHT * b + FOLLOWUP_WEIGHT * f);
}

// --- Coding score (deterministic) ---

export function computeCodingScore(events: InterviewEvent[]): number {
  const codingEvents = events.filter(
    (e) => (e.payload?.section_id ?? e.section_id) === "section_coding" && e.event_type === "CODE_TESTS_RESULT"
  );
  let totalPassed = 0;
  let totalTests = 0;
  for (const e of codingEvents) {
    const passed = Number(e.payload?.passed ?? 0);
    const total = Number(e.payload?.total ?? 0);
    if (total > 0) {
      totalPassed += passed;
      totalTests += total;
    }
  }
  if (totalTests === 0) return 0;
  return round2(Math.max(0, Math.min(1, totalPassed / totalTests)));
}

// --- Main entry ---

export type LlmJudgeOptions = {
  /** Store canonical transcript and judge JSON for debugging */
  storeDebug?: boolean;
};

export type LlmJudgeResult = {
  output: JudgeOutput;
  canonicalTranscripts: Record<string, string>;
  judgeRawPerSection: Record<string, { extraction?: string; scoring?: string }>;
};

let llmJudgeMock: ((schemaVersion: string, events: InterviewEvent[]) => Promise<LlmJudgeResult>) | null = null;

export function setLLMJudgeEvaluationImpl(
  fn: ((schemaVersion: string, events: InterviewEvent[]) => Promise<LlmJudgeResult>) | null
): void {
  llmJudgeMock = fn;
}

export async function runLLMJudgeEvaluation(
  schemaVersion: string,
  events: InterviewEvent[],
  _options?: LlmJudgeOptions
): Promise<LlmJudgeResult> {
  if (llmJudgeMock) return llmJudgeMock(schemaVersion, events);

  const rubric = getRubricConfig(schemaVersion);
  if (!rubric) throw new Error(`No rubric config for schemaVersion: ${schemaVersion}`);

  const canonicalTranscripts: Record<string, string> = {};
  const judgeRawPerSection: Record<string, { extraction?: string; scoring?: string }> = {};
  const sections: Record<string, JudgeSectionOutput> = {};

  for (const sectionId of NON_CODING_SECTIONS) {
    const config = rubric.sections[sectionId];
    if (!config) continue;

    const { canonical, turns } = canonicalizeSectionTranscript(events, sectionId);
    canonicalTranscripts[sectionId] = canonical;

    if (canonical.trim() === "") {
      sections[sectionId] = {
        section_id: sectionId,
        base_initial_score: 0,
        followup_score: 0,
        section_score: 0,
        rationale_bullets: ["No transcript for this section."],
        evidence: []
      };
      continue;
    }

    const extraction = await runExtractionPass(sectionId, canonical, config);
    if (!extraction) {
      sections[sectionId] = {
        section_id: sectionId,
        base_initial_score: 0,
        followup_score: 0,
        section_score: 0,
        rationale_bullets: ["Evaluation extraction failed."],
        evidence: []
      };
      continue;
    }

    const scoring = await runScoringPass(sectionId, extraction, config, schemaVersion);
    if (!scoring) {
      sections[sectionId] = {
        section_id: sectionId,
        base_initial_score: 0,
        followup_score: 0,
        section_score: 0,
        rationale_bullets: ["Evaluation scoring failed."],
        evidence: []
      };
      continue;
    }

    const numFollowups = extraction.followup_questions.length;
    const followupScore = numFollowups === 0 ? scoring.base_initial_score : scoring.followup_score;
    const section_score = computeSectionScore(scoring.base_initial_score, followupScore, numFollowups);

    sections[sectionId] = {
      section_id: sectionId,
      base_initial_score: round2(scoring.base_initial_score),
      followup_score: round2(scoring.followup_score),
      section_score,
      rationale_bullets: scoring.rationale_bullets,
      evidence: scoring.evidence
    };
  }

  const codingScore = computeCodingScore(events);
  sections["section_coding"] = {
    section_id: "section_coding",
    base_initial_score: codingScore,
    followup_score: codingScore,
    section_score: codingScore,
    rationale_bullets: ["Deterministic: fraction of test cases passed."],
    evidence: []
  };

  let final_score = 0;
  for (const sid of SECTION_ORDER) {
    const s = sections[sid];
    if (s) final_score += s.section_score;
  }
  final_score = round2(final_score);

  const output: JudgeOutput = {
    schemaVersion,
    sections,
    final_score
  };

  return {
    output,
    canonicalTranscripts,
    judgeRawPerSection
  };
}

// --- Map to existing EvaluationOutput shape (for runEvaluation integration) ---

const SECTION_TO_METRIC_NAME: Record<string, string> = {
  section_1: MOCK1_METRIC_NAMES[0],
  section_2: MOCK1_METRIC_NAMES[1],
  section_3: MOCK1_METRIC_NAMES[2],
  section_coding: MOCK1_METRIC_NAMES[3],
  section_4: MOCK1_METRIC_NAMES[4]
};

function judgeEvidenceToPointers(
  sectionId: string,
  evidence: JudgeSectionOutput["evidence"]
): EvidencePointer[] {
  return evidence.map((e) => ({
    type: "transcript_quote" as const,
    section_id: sectionId,
    quote: e.quote,
    metadata: { claim: e.claim, turn: e.turn, qa: e.qa }
  }));
}

export function mapJudgeOutputToEvaluationOutput(
  interviewId: string,
  judgeOutput: JudgeOutput,
  context: EvaluationOutput["context"],
  evaluationVersion: string
): EvaluationOutput {
  const metrics: MetricOutput[] = [];
  const sections: SectionEvaluation[] = [];

  for (const sectionId of SECTION_ORDER) {
    const sec = judgeOutput.sections[sectionId];
    const metricName = SECTION_TO_METRIC_NAME[sectionId];
    if (!sec || !metricName) continue;

    const value = Math.max(0, Math.min(1, sec.section_score));
    metrics.push({
      name: metricName,
      value,
      scale: "0-1",
      explanation: sec.rationale_bullets.join(" "),
      evidence: judgeEvidenceToPointers(sectionId, sec.evidence)
    });

    sections.push({
      section_id: sectionId,
      summary: sec.rationale_bullets.join(" "),
      signals: [],
      metrics: [{ name: metricName, value, scale: "0-1", explanation: sec.rationale_bullets.join(" "), evidence: judgeEvidenceToPointers(sectionId, sec.evidence) }]
    });
  }

  const finalScore0to5 = judgeOutput.final_score;
  const overall_score = Math.round((finalScore0to5 / 5) * 100) / 100;
  let overall_band: EvaluationOutput["overall_band"] = null;
  if (overall_score >= 0.8) overall_band = "STRONG_SIGNAL";
  else if (overall_score >= 0.5) overall_band = "MIXED_SIGNAL";
  else overall_band = "WEAK_SIGNAL";

  return {
    interview_id: interviewId,
    evaluation_version: evaluationVersion,
    signal_defs_version: "llm-judge-v1",
    metric_weights_version: "llm-judge-v1",
    overall_score,
    overall_band,
    metrics,
    sections,
    context
  };
}
