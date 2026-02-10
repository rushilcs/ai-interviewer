/**
 * Unit tests for LLM judge evaluation: canonicalization, zod schemas, deterministic formula.
 * No OpenAI calls; uses mocks or pure functions only.
 */

import { describe, expect, test } from "vitest";
import {
  canonicalizeSectionTranscript,
  computeCodingScore,
  computeSectionScore,
  mapJudgeOutputToEvaluationOutput,
  JudgeOutputSchema,
  JudgeSectionOutputSchema
} from "../src/services/evaluation/llmJudgeEvaluator";
import type { InterviewEvent } from "../src/services/orchestration/state";
import type { JudgeOutput, JudgeSectionOutput } from "../src/services/evaluation/llmJudgeEvaluator";

function ev(seq: number, event_type: string, sectionId: string | null, payload: Record<string, unknown> = {}): InterviewEvent {
  return {
    seq,
    event_type,
    payload: { ...payload, section_id: sectionId },
    created_at: "2025-01-01T00:00:00Z",
    section_id: sectionId
  };
}

describe("canonicalizeSectionTranscript", () => {
  test("extracts only PROMPT_PRESENTED and CANDIDATE_MESSAGE in order", () => {
    const events: InterviewEvent[] = [
      ev(1, "SECTION_STARTED", "section_1", { section_name: "Problem Framing" }),
      ev(2, "PROMPT_PRESENTED", "section_1", { prompt_text: "Restate the problem.", prompt_id: "section_1_initial" }),
      ev(3, "CANDIDATE_MESSAGE", "section_1", { text: "We want to maximize engagement." }),
      ev(4, "PROMPT_PRESENTED", "section_1", { prompt_text: "What metrics?", prompt_id: "section_1_followup_1" }),
      ev(5, "CANDIDATE_MESSAGE", "section_1", { text: "NDCG and CTR." })
    ];
    const { canonical, turns } = canonicalizeSectionTranscript(events, "section_1");
    expect(turns).toHaveLength(4);
    expect(turns[0].label).toBe("INITIAL");
    expect(turns[0].role).toBe("Q");
    expect(turns[0].text).toBe("Restate the problem.");
    expect(turns[1].role).toBe("A");
    expect(turns[2].label).toBe("FOLLOWUP");
    expect(turns[2].text).toBe("What metrics?");
    expect(canonical).toContain("[INITIAL] Q:");
    expect(canonical).toContain("[FOLLOWUP] Q:");
    expect(canonical).not.toContain("SECTION_STARTED");
  });

  test("filters by section_id", () => {
    const events: InterviewEvent[] = [
      ev(1, "PROMPT_PRESENTED", "section_1", { prompt_text: "Q1", prompt_id: "p1" }),
      ev(2, "CANDIDATE_MESSAGE", "section_1", { text: "A1" }),
      ev(3, "PROMPT_PRESENTED", "section_2", { prompt_text: "Q2", prompt_id: "p2" })
    ];
    const { turns } = canonicalizeSectionTranscript(events, "section_1");
    expect(turns).toHaveLength(2);
    expect(turns[0].text).toBe("Q1");
    expect(turns[1].text).toBe("A1");
  });

  test("empty section returns empty canonical", () => {
    const events: InterviewEvent[] = [ev(1, "PROMPT_PRESENTED", "section_2", { prompt_text: "Other section." })];
    const { canonical, turns } = canonicalizeSectionTranscript(events, "section_1");
    expect(turns).toHaveLength(0);
    expect(canonical).toBe("");
  });
});

describe("computeCodingScore", () => {
  test("no test events returns 0", () => {
    const events: InterviewEvent[] = [ev(1, "SECTION_STARTED", "section_coding", {})];
    expect(computeCodingScore(events)).toBe(0);
  });

  test("all passed returns 1", () => {
    const events: InterviewEvent[] = [
      ev(1, "CODE_TESTS_RESULT", "section_coding", { passed: 5, total: 5, problem_id: "dcg" })
    ];
    expect(computeCodingScore(events)).toBe(1);
  });

  test("partial passed returns fraction rounded to 2 decimals", () => {
    const events: InterviewEvent[] = [
      ev(1, "CODE_TESTS_RESULT", "section_coding", { passed: 2, total: 3, problem_id: "dcg" })
    ];
    expect(computeCodingScore(events)).toBe(0.67);
  });

  test("aggregates multiple CODE_TESTS_RESULT events", () => {
    const events: InterviewEvent[] = [
      ev(1, "CODE_TESTS_RESULT", "section_coding", { passed: 2, total: 2, problem_id: "p1" }),
      ev(2, "CODE_TESTS_RESULT", "section_coding", { passed: 1, total: 2, problem_id: "p2" })
    ];
    expect(computeCodingScore(events)).toBe(0.75);
  });
});

describe("Judge output zod schemas", () => {
  test("JudgeSectionOutputSchema accepts valid section", () => {
    const section: JudgeSectionOutput = {
      section_id: "section_1",
      base_initial_score: 0.8,
      followup_score: 0.7,
      section_score: 0.77,
      rationale_bullets: ["Good restatement.", "Addressed follow-ups."],
      evidence: [{ claim: "Restated goal", quote: "We want to maximize...", turn: 2, qa: "A" }]
    };
    expect(JudgeSectionOutputSchema.parse(section)).toEqual(section);
  });

  test("JudgeOutputSchema accepts valid full output", () => {
    const output: JudgeOutput = {
      schemaVersion: "mle-v1",
      final_score: 3.5,
      sections: {
        section_1: {
          section_id: "section_1",
          base_initial_score: 0.7,
          followup_score: 0.6,
          section_score: 0.67,
          rationale_bullets: ["OK."],
          evidence: []
        }
      }
    };
    expect(JudgeOutputSchema.parse(output)).toEqual(output);
  });

});

describe("mapJudgeOutputToEvaluationOutput", () => {
  test("produces overall_score 0-1 from final_score 0-5 and band", () => {
    const judgeOutput: JudgeOutput = {
      schemaVersion: "mle-v1",
      final_score: 4,
      sections: {
        section_1: { section_id: "section_1", base_initial_score: 0.8, followup_score: 0.8, section_score: 0.8, rationale_bullets: [], evidence: [] },
        section_2: { section_id: "section_2", base_initial_score: 0.8, followup_score: 0.8, section_score: 0.8, rationale_bullets: [], evidence: [] },
        section_3: { section_id: "section_3", base_initial_score: 0.8, followup_score: 0.8, section_score: 0.8, rationale_bullets: [], evidence: [] },
        section_coding: { section_id: "section_coding", base_initial_score: 0.8, followup_score: 0.8, section_score: 0.8, rationale_bullets: [], evidence: [] },
        section_4: { section_id: "section_4", base_initial_score: 0.8, followup_score: 0.8, section_score: 0.8, rationale_bullets: [], evidence: [] }
      }
    };
    const out = mapJudgeOutputToEvaluationOutput("inv-1", judgeOutput, {
      assistant_usage_count: 0,
      time_per_section_seconds: {},
      disconnect_count: 0
    }, "ess-v2");
    expect(out.overall_score).toBe(0.8);
    expect(out.overall_band).toBe("STRONG_SIGNAL");
    expect(out.metrics).toHaveLength(5);
    expect(out.sections).toHaveLength(5);
  });
});

describe("deterministic section score formula", () => {
  test("section_score = 0.70 * base + 0.30 * followup, rounded to 2 decimals", () => {
    expect(computeSectionScore(0.8, 0.6, 2)).toBe(0.74);
    expect(computeSectionScore(1, 0, 1)).toBe(0.7);
    expect(computeSectionScore(0.5, 0.5, 0)).toBe(0.5);
  });

  test("when 0 follow-ups, followup_score is not used (caller passes base as followup)", () => {
    const score = computeSectionScore(0.9, 0.9, 0);
    expect(score).toBe(0.9);
  });
});
