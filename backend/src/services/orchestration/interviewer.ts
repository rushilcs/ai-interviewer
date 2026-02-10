/**
 * Interviewer decision engine. Uses canonical spec (mock-1): initial prompt per section only.
 * Follow-ups are generated dynamically by the interviewer AI — this module only decides
 * whether to ask initial or signal that a follow-up is needed.
 */

import type { InterviewSchemaDef } from "./schema";
import type { InterviewEvent } from "./state";
import { reduceInterviewState } from "./state";
import { getPromptsForSection } from "../../prompts/mle-v1";
import type { PromptDef } from "../../prompts/mle-v1";
import {
  DEFAULT_FOLLOWUP_BUDGET,
  MAX_FOLLOWUPS_PER_SECTION,
  needs_more_followups
} from "../interviewer/constants";

export type PromptDecision =
  | { action: "ask"; prompt: PromptDef }
  | { action: "ask_followup"; section_id: string }
  | { action: "mark_section_satisfied"; section_id: string }
  | { action: "none" };

/**
 * Get the last event in the given section (by section_id).
 */
function getLastEventInSection(
  sectionId: string,
  events: InterviewEvent[]
): InterviewEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const evSectionId = (ev.payload?.section_id as string) ?? ev.section_id ?? null;
    if (evSectionId === sectionId) return ev;
  }
  return null;
}

export { MAX_FOLLOWUPS_PER_SECTION };

/**
 * Count how many PROMPT_PRESENTED events have been emitted in this section.
 */
function countPromptsInSection(
  sectionId: string,
  events: InterviewEvent[]
): number {
  return events.filter((ev) => {
    if (ev.event_type !== "PROMPT_PRESENTED") return false;
    const evSectionId = (ev.payload?.section_id as string) ?? ev.section_id ?? null;
    return evSectionId === sectionId;
  }).length;
}

/**
 * Check if any PROMPT_PRESENTED has been emitted in this section.
 */
function hasPromptPresentedInSection(
  sectionId: string,
  events: InterviewEvent[]
): boolean {
  return countPromptsInSection(sectionId, events) > 0;
}

/**
 * Check if the interviewer has already decided no more follow-ups for this section (LLM returned "satisfied").
 */
function hasInterviewerSectionSatisfied(
  sectionId: string,
  events: InterviewEvent[]
): boolean {
  return events.some((ev) => {
    if (ev.event_type !== "INTERVIEWER_SECTION_SATISFIED") return false;
    const evSectionId = (ev.payload?.section_id as string) ?? ev.section_id ?? null;
    return evSectionId === sectionId;
  });
}

/**
 * Build a transcript of Q&A from previous sections (section order from schema) for long-term memory.
 * Format: "Section [name]: Q: ... A: ..." per exchange. Excludes current section.
 */
export function getTranscriptForPreviousSections(
  schema: InterviewSchemaDef,
  currentSectionId: string,
  events: InterviewEvent[]
): string {
  const sectionIds = schema.sections.map((s) => s.id);
  const currentIdx = sectionIds.indexOf(currentSectionId);
  if (currentIdx <= 0) return "";

  const previousIds = sectionIds.slice(0, currentIdx);
  const lines: string[] = [];

  for (const secId of previousIds) {
    const spec = schema.sections.find((s) => s.id === secId);
    const secName = spec?.name ?? secId;
    const sectionEvents = events.filter((ev) => {
      const evSectionId = (ev.payload?.section_id as string) ?? ev.section_id ?? null;
      return evSectionId === secId;
    });
    const pairs: string[] = [];
    let lastPrompt = "";
    for (const ev of sectionEvents) {
      if (ev.event_type === "PROMPT_PRESENTED") {
        lastPrompt = (ev.payload?.prompt_text as string) ?? "";
      } else if (ev.event_type === "CANDIDATE_MESSAGE" && lastPrompt) {
        const answer = (ev.payload?.text as string) ?? "";
        pairs.push(`Q: ${lastPrompt}\nA: ${answer}`);
        lastPrompt = "";
      }
    }
    if (pairs.length > 0) {
      lines.push(`Section "${secName}":\n${pairs.join("\n\n")}`);
    }
  }

  return lines.join("\n\n---\n\n");
}

/**
 * Decide the next interviewer action. At most one prompt per call.
 * - If no prompt has been presented in the current section → ask initial (from spec).
 * - If the last event in the section is CANDIDATE_MESSAGE → signal ask_followup (LLM will generate).
 * - Otherwise → none.
 */
export function decideNextPrompt(
  schemaVersion: string,
  schema: InterviewSchemaDef,
  events: InterviewEvent[]
): PromptDecision {
  const state = reduceInterviewState(schema, events);

  if (state.status !== "IN_PROGRESS") {
    return { action: "none" };
  }

  const currentSectionId = state.current_section_id;
  if (!currentSectionId) {
    return { action: "none" };
  }

  // Interviewer does not handle the coding section; no prompts are presented there.
  if (currentSectionId === "section_coding") {
    return { action: "none" };
  }

  const sectionPrompts = getPromptsForSection(schemaVersion, currentSectionId);
  if (!sectionPrompts) {
    return { action: "none" };
  }

  const hasInitial = hasPromptPresentedInSection(currentSectionId, events);
  if (!hasInitial) {
    return { action: "ask", prompt: sectionPrompts.initial };
  }

  const promptCount = countPromptsInSection(currentSectionId, events);
  if (promptCount >= 1 + MAX_FOLLOWUPS_PER_SECTION) {
    return { action: "mark_section_satisfied", section_id: currentSectionId };
  }

  if (hasInterviewerSectionSatisfied(currentSectionId, events)) {
    return { action: "none" };
  }

  const lastInSection = getLastEventInSection(currentSectionId, events);
  if (lastInSection?.event_type === "CANDIDATE_MESSAGE") {
    const followUpCount = promptCount - 1;
    if (followUpCount >= DEFAULT_FOLLOWUP_BUDGET) {
      const lastMessage = getLastCandidateMessageInSection(currentSectionId, events);
      if (!needs_more_followups(lastMessage ?? "", currentSectionId)) {
        return { action: "mark_section_satisfied", section_id: currentSectionId };
      }
    }
    return { action: "ask_followup", section_id: currentSectionId };
  }

  return { action: "none" };
}

/**
 * Progress for the current section: questions asked so far and cap.
 * Used by snapshot for progress bars.
 */
export function getSectionProgress(
  sectionId: string | null,
  events: InterviewEvent[]
): { questions_asked_in_section: number; max_questions_in_section: number } {
  const max = 1 + MAX_FOLLOWUPS_PER_SECTION;
  if (!sectionId) return { questions_asked_in_section: 0, max_questions_in_section: max };
  return {
    questions_asked_in_section: countPromptsInSection(sectionId, events),
    max_questions_in_section: max
  };
}

/**
 * Get the text of the most recent CANDIDATE_MESSAGE in the given section.
 * Used by the route to pass to the follow-up LLM.
 */
export function getLastCandidateMessageInSection(
  sectionId: string,
  events: InterviewEvent[]
): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.event_type !== "CANDIDATE_MESSAGE") continue;
    const evSectionId = (ev.payload?.section_id as string) ?? ev.section_id ?? null;
    if (evSectionId !== sectionId) continue;
    const text = ev.payload?.text as string;
    return typeof text === "string" ? text : "";
  }
  return null;
}

/**
 * Get recent PROMPT_PRESENTED texts in this section (newest first), so the follow-up LLM can avoid repeating.
 */
export function getRecentPromptTextsInSection(
  sectionId: string,
  events: InterviewEvent[],
  maxCount: number = 5
): string[] {
  const texts: string[] = [];
  for (let i = events.length - 1; i >= 0 && texts.length < maxCount; i--) {
    const ev = events[i];
    if (ev.event_type !== "PROMPT_PRESENTED") continue;
    const evSectionId = (ev.payload?.section_id as string) ?? ev.section_id ?? null;
    if (evSectionId !== sectionId) continue;
    const text = (ev.payload?.prompt_text as string) ?? "";
    if (text.trim()) texts.push(text.trim());
  }
  return texts;
}
