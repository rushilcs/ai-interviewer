/**
 * Tests for budgeted follow-ups and coverage-based stop.
 * Uses synthetic events only (no DB) so interview dev data is never touched.
 */

import { describe, expect, test } from "vitest";
import { needs_more_followups } from "../src/services/interviewer/constants";
import { decideNextPrompt } from "../src/services/orchestration/interviewer";
import { loadSchema } from "../src/services/orchestration/schema";
import type { InterviewEvent } from "../src/services/orchestration/state";
import {
  buildFollowUpSystemPrompt,
  COVERAGE_CHECKPOINTS,
  isDuplicateOrNearDuplicate
} from "../src/services/interviewer/followUp";

const schema = loadSchema("mle-v1");

function baseEvents(sectionId: string): InterviewEvent[] {
  return [
    {
      seq: 1,
      event_type: "INTERVIEW_CREATED",
      payload: {},
      created_at: "2025-01-01T00:00:00Z",
      section_id: null
    },
    {
      seq: 2,
      event_type: "INTERVIEW_STARTED",
      payload: {},
      created_at: "2025-01-01T00:00:01Z",
      section_id: null
    },
    {
      seq: 3,
      event_type: "SECTION_STARTED",
      payload: {
        section_id: sectionId,
        section_name: "Problem Framing",
        deadline_at: "2025-01-01T00:10:00Z"
      },
      created_at: "2025-01-01T00:00:01Z",
      section_id: sectionId
    }
  ];
}

function promptPresented(seq: number, sectionId: string, promptId: string): InterviewEvent {
  return {
    seq,
    event_type: "PROMPT_PRESENTED",
    payload: { prompt_id: promptId, prompt_text: "Question...", section_id: sectionId },
    created_at: "2025-01-01T00:00:02Z",
    section_id: sectionId
  };
}

function candidateMessage(seq: number, sectionId: string, text: string): InterviewEvent {
  return {
    seq,
    event_type: "CANDIDATE_MESSAGE",
    payload: { text },
    created_at: "2025-01-01T00:00:03Z",
    section_id: sectionId
  };
}

describe("isDuplicateOrNearDuplicate", () => {
  test("detects rephrase of same question (monitor vs handle monitoring)", () => {
    const existing = [
      "How would you monitor the model's performance and detect potential issues after deployment?"
    ];
    const rephrase =
      "How would you handle monitoring the model's performance and detecting potential issues once it's deployed?";
    expect(isDuplicateOrNearDuplicate(rephrase, existing)).toBe(true);
  });

  test("allows genuinely different question", () => {
    const existing = [
      "How would you monitor the model's performance and detect potential issues after deployment?"
    ];
    expect(isDuplicateOrNearDuplicate("What would you do if latency increased by 2x in production?", existing)).toBe(false);
    expect(isDuplicateOrNearDuplicate("How would you retrain the model when distribution shifts?", existing)).toBe(false);
  });

  test("empty existing list returns false", () => {
    expect(isDuplicateOrNearDuplicate("Any question here.", [])).toBe(false);
  });

  test("exact duplicate is detected", () => {
    const q = "What metrics would you use for offline evaluation?";
    expect(isDuplicateOrNearDuplicate(q, [q])).toBe(true);
  });
});

describe("needs_more_followups", () => {
  test("short strong answer (section_1) returns false", () => {
    const msg =
      "We want to maximize long-term value. We'll use NDCG and A/B tests. Latency and scale matter.";
    expect(needs_more_followups(msg, "section_1")).toBe(false);
  });

  test("explicit uncertainty triggers true", () => {
    expect(needs_more_followups("I'm not sure about that.", "section_1")).toBe(true);
    expect(needs_more_followups("I don't know.", "section_2")).toBe(true);
    expect(needs_more_followups("No idea, skip.", "section_1")).toBe(true);
  });

  test("empty message returns true", () => {
    expect(needs_more_followups("", "section_1")).toBe(true);
    expect(needs_more_followups("   ", "section_2")).toBe(true);
  });

  test("verbose but weak (few concepts) returns true", () => {
    const longButVague =
      "Well, I think we need to do something good for the product. It's complicated. There are many factors.";
    expect(needs_more_followups(longButVague, "section_1")).toBe(true);
  });

  test("unknown section_id returns false", () => {
    expect(needs_more_followups("random text", "section_unknown")).toBe(false);
  });

  test("section_2: strong concise answer returns false", () => {
    const msg =
      "I'd use a ranking model with a baseline. Features: embeddings and engagement. We'd evaluate with offline NDCG and online A/B. Cold start we'd handle with exploration.";
    expect(needs_more_followups(msg, "section_2")).toBe(false);
  });
});

describe("decideNextPrompt — budgeted follow-ups", () => {
  test("followUpCount = 2 and strong coverage → mark_section_satisfied (unlock next section)", () => {
    const events: InterviewEvent[] = [
      ...baseEvents("section_1"),
      promptPresented(4, "section_1", "section_1_initial"),
      candidateMessage(5, "section_1", "First answer."),
      promptPresented(6, "section_1", "section_1_followup_1"),
      candidateMessage(7, "section_1", "Second answer."),
      promptPresented(8, "section_1", "section_1_followup_2"),
      candidateMessage(9, "section_1", "We want to maximize long-term value. We'll use NDCG and A/B tests. Latency and scale matter.")
    ];
    const decision = decideNextPrompt("mle-v1", schema, events);
    expect(decision.action).toBe("mark_section_satisfied");
    expect(decision.action === "mark_section_satisfied" && decision.section_id).toBe("section_1");
  });

  test("followUpCount = 2 and missing ideas → action ask_followup", () => {
    const events: InterviewEvent[] = [
      ...baseEvents("section_1"),
      promptPresented(4, "section_1", "section_1_initial"),
      candidateMessage(5, "section_1", "First answer."),
      promptPresented(6, "section_1", "section_1_followup_1"),
      candidateMessage(7, "section_1", "I'm not sure.")
    ];
    const decision = decideNextPrompt("mle-v1", schema, events);
    expect(decision.action).toBe("ask_followup");
  });

  test("followUpCount = 4 → mark_section_satisfied (hard cap, unlock next section)", () => {
    const events: InterviewEvent[] = [
      ...baseEvents("section_1"),
      promptPresented(4, "section_1", "section_1_initial"),
      candidateMessage(5, "section_1", "A."),
      promptPresented(6, "section_1", "section_1_followup_1"),
      candidateMessage(7, "section_1", "B."),
      promptPresented(8, "section_1", "section_1_followup_2"),
      candidateMessage(9, "section_1", "C."),
      promptPresented(10, "section_1", "section_1_followup_3"),
      candidateMessage(11, "section_1", "D."),
      promptPresented(12, "section_1", "section_1_followup_4"),
      candidateMessage(13, "section_1", "I still don't know.")
    ];
    const decision = decideNextPrompt("mle-v1", schema, events);
    expect(decision.action).toBe("mark_section_satisfied");
  });

  test("section_coding unchanged: always none", () => {
    const events: InterviewEvent[] = [
      ...baseEvents("section_coding"),
      promptPresented(4, "section_coding", "section_coding_initial")
    ];
    const decision = decideNextPrompt("mle-v1", schema, events);
    expect(decision.action).toBe("none");
  });
});

describe("buildFollowUpSystemPrompt — coverage checkpoints and stop rule", () => {
  test("prompt for section_1 contains Coverage Checkpoints", () => {
    const prompt = buildFollowUpSystemPrompt({
      section_id: "section_1",
      intentsText: "- **Clarification**: Ask to clarify.",
      disallowedText: "Do not hint."
    });
    expect(prompt).toContain("COVERAGE CHECKPOINTS");
    expect(prompt).toContain("Restates the goal in own words");
    expect(prompt).toContain("Identifies user value / objective");
  });

  test("prompt with recent questions contains NO DUPLICATES / rephrase warning", () => {
    const prompt = buildFollowUpSystemPrompt({
      section_id: "section_1",
      intentsText: "- **Clarification**: Ask.",
      disallowedText: "Do not hint.",
      recent_questions_in_section: ["How would you monitor performance?"]
    });
    expect(prompt).toContain("NO DUPLICATES");
    expect(prompt).toContain("monitor");
    expect(prompt).toContain("handle monitoring");
  });

  test("prompt contains explicit MUST output [NO_MORE_FOLLOWUPS] rule", () => {
    const prompt = buildFollowUpSystemPrompt({
      section_id: "section_1",
      intentsText: "- **Clarification**: Ask.",
      disallowedText: "Do not hint."
    });
    expect(prompt).toContain("MUST output exactly [NO_MORE_FOLLOWUPS]");
  });

  test("section_coding has no checkpoint block", () => {
    const prompt = buildFollowUpSystemPrompt({
      section_id: "section_coding",
      intentsText: "",
      disallowedText: ""
    });
    expect(prompt).not.toContain("COVERAGE CHECKPOINTS for this section");
  });

  test("COVERAGE_CHECKPOINTS has section_1..4 with correct K", () => {
    expect(COVERAGE_CHECKPOINTS.section_1.k).toBe(4);
    expect(COVERAGE_CHECKPOINTS.section_2.k).toBe(4);
    expect(COVERAGE_CHECKPOINTS.section_3.k).toBe(4);
    expect(COVERAGE_CHECKPOINTS.section_4.k).toBe(3);
    expect(COVERAGE_CHECKPOINTS.section_coding).toBeUndefined();
  });
});
