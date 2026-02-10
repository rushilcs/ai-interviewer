import type { InterviewSchemaDef } from "./schema";
import type { InterviewEvent } from "./state";
import {
  type ReducedState,
  type SectionEndReason,
  buildSnapshotSections,
  getCurrentSectionInfo,
  getRecommendedAction,
  getRemainingSeconds
} from "./state";
import { getSectionProgress } from "./interviewer";
import { getMock1Spec } from "../../specs/mock-1";

export type SnapshotEvent = {
  seq: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  section_id: string | null;
};

export type CurrentPrompt = {
  prompt_id: string;
  text: string;
  section_id: string;
};

export type InterviewSnapshot = {
  interview_id: string;
  status: ReducedState["status"];
  schema_version: string;
  problem_context: string;
  current_section: {
    id: string;
    name: string;
    objective: string;
    deadline_at: string | null;
    remaining_seconds: number | null;
  } | null;
  current_prompt: CurrentPrompt | null;
  sections: {
    id: string;
    name: string;
    objective: string;
    started_at?: string;
    ended_at?: string;
    end_reason?: SectionEndReason;
  }[];
  last_seq: number;
  events: SnapshotEvent[];
  recommended_action: "none" | "expire_section";
  /** For progress bars: prompts asked in current section. */
  current_section_questions_count: number;
  /** For progress bars: max prompts (initial + follow-ups) in current section. */
  current_section_max_questions: number;
  /** Total number of sections in the interview. */
  total_sections: number;
  /** True when interviewer has marked current section satisfied (questions finished; can proceed without warning). */
  current_section_interviewer_satisfied: boolean;
};

export function buildInterviewSnapshot(
  interviewId: string,
  schemaVersion: string,
  schema: InterviewSchemaDef,
  state: ReducedState,
  eventsSince: SnapshotEvent[],
  nowIso: string,
  fullEvents?: InterviewEvent[] | null
): InterviewSnapshot {
  const current = getCurrentSectionInfo(schema, state);
  const remaining =
    state.current_section_id && state.section_deadline_at
      ? getRemainingSeconds(state, nowIso)
      : null;

  const current_prompt: CurrentPrompt | null =
    state.active_prompt_id && state.active_prompt_text && state.current_section_id
      ? {
          prompt_id: state.active_prompt_id,
          text: state.active_prompt_text,
          section_id: state.current_section_id
        }
      : null;

  const spec = getMock1Spec();
  const sectionsWithObjective = buildSnapshotSections(schema, state).map((sec) => {
    const sectionSpec = spec.sections.find((s) => s.id === sec.id);
    return {
      ...sec,
      objective: sectionSpec?.objective ?? ""
    };
  });

  const currentWithObjective =
    current != null
      ? {
          ...current,
          objective:
            spec.sections.find((s) => s.id === current.id)?.objective ?? ""
        }
      : null;

  const progress =
    fullEvents != null && state.current_section_id
      ? getSectionProgress(state.current_section_id, fullEvents)
      : { questions_asked_in_section: 0, max_questions_in_section: 1 };

  const current_section_interviewer_satisfied =
    state.current_section_id != null && fullEvents != null
      ? fullEvents.some((ev) => {
          if (ev.event_type !== "INTERVIEWER_SECTION_SATISFIED") return false;
          const evSectionId = (ev.payload?.section_id as string) ?? ev.section_id ?? null;
          return evSectionId === state.current_section_id;
        })
      : false;

  return {
    interview_id: interviewId,
    status: state.status,
    schema_version: schemaVersion,
    problem_context: spec.problem_context,
    current_section: currentWithObjective
      ? {
          id: currentWithObjective.id,
          name: currentWithObjective.name,
          objective: currentWithObjective.objective,
          deadline_at: currentWithObjective.deadline_at,
          remaining_seconds: remaining
        }
      : null,
    current_prompt,
    sections: sectionsWithObjective,
    last_seq: state.last_seq,
    events: eventsSince,
    recommended_action: getRecommendedAction(state, nowIso),
    current_section_questions_count: progress.questions_asked_in_section,
    current_section_max_questions: progress.max_questions_in_section,
    total_sections: schema.sections.length,
    current_section_interviewer_satisfied
  };
}
