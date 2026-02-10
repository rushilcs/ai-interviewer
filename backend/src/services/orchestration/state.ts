import type { InterviewSchemaDef } from "./schema";
import { getSectionById } from "./schema";

export type InterviewStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "TERMINATED";

export type SectionEndReason =
  | "time_expired"
  | "coverage_satisfied"
  | "candidate_done"
  | "system_error";

export type SectionProgress = {
  id: string;
  name: string;
  started_at: string | null;
  ended_at: string | null;
  end_reason: SectionEndReason | null;
};

export type ReducedState = {
  status: InterviewStatus;
  current_section_id: string | null;
  section_started_at: string | null;
  section_deadline_at: string | null;
  last_seq: number;
  section_progress: SectionProgress[];
  active_prompt_id: string | null;
  active_prompt_text: string | null;
};

export type InterviewEvent = {
  seq: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  section_id: string | null;
};

const SECTION_END_REASONS: SectionEndReason[] = [
  "time_expired",
  "coverage_satisfied",
  "candidate_done",
  "system_error"
];

function parseEndReason(reason: unknown): SectionEndReason | null {
  if (typeof reason !== "string") return null;
  if (SECTION_END_REASONS.includes(reason as SectionEndReason)) return reason as SectionEndReason;
  return null;
}

/**
 * Deterministic reducer: state = f(schema, ordered events).
 * No side effects; pure function.
 */
export function reduceInterviewState(
  schema: InterviewSchemaDef,
  events: InterviewEvent[]
): ReducedState {
  const sectionProgress: SectionProgress[] = schema.sections.map((s) => ({
    id: s.id,
    name: s.name,
    started_at: null,
    ended_at: null,
    end_reason: null
  }));

  let status: InterviewStatus = "NOT_STARTED";
  let current_section_id: string | null = null;
  let section_started_at: string | null = null;
  let section_deadline_at: string | null = null;
  let last_seq = 0;
  let active_prompt_id: string | null = null;
  let active_prompt_text: string | null = null;

  for (const ev of events) {
    last_seq = ev.seq;

    switch (ev.event_type) {
      case "INTERVIEW_CREATED":
        status = "NOT_STARTED";
        break;

      case "INTERVIEW_STARTED":
        status = "IN_PROGRESS";
        break;

      case "INTERVIEW_COMPLETED":
        status = "COMPLETED";
        current_section_id = null;
        section_started_at = null;
        section_deadline_at = null;
        active_prompt_id = null;
        active_prompt_text = null;
        break;

      case "INTERVIEW_TERMINATED":
        status = "TERMINATED";
        current_section_id = null;
        section_started_at = null;
        section_deadline_at = null;
        active_prompt_id = null;
        active_prompt_text = null;
        break;

      case "SECTION_STARTED": {
        const sectionId = (ev.payload.section_id as string) ?? ev.section_id ?? null;
        const sectionName = (ev.payload.section_name as string) ?? null;
        const deadlineAt = (ev.payload.deadline_at as string) ?? null;
        if (sectionId) {
          current_section_id = sectionId;
          section_started_at = ev.created_at;
          section_deadline_at = deadlineAt;
          const prog = sectionProgress.find((p) => p.id === sectionId);
          if (prog) {
            prog.started_at = ev.created_at;
          } else {
            sectionProgress.push({
              id: sectionId,
              name: sectionName ?? sectionId,
              started_at: ev.created_at,
              ended_at: null,
              end_reason: null
            });
          }
        }
        active_prompt_id = null;
        active_prompt_text = null;
        break;
      }

      case "SECTION_ENDED": {
        const sectionId = (ev.payload.section_id as string) ?? ev.section_id ?? null;
        const reason = parseEndReason(ev.payload.reason);
        if (sectionId) {
          const prog = sectionProgress.find((p) => p.id === sectionId);
          if (prog) {
            prog.ended_at = ev.created_at;
            prog.end_reason = reason;
          }
          if (current_section_id === sectionId) {
            current_section_id = null;
            section_started_at = null;
            section_deadline_at = null;
          }
        }
        break;
      }

      case "PROMPT_PRESENTED":
        active_prompt_id = (ev.payload.prompt_id as string) ?? null;
        active_prompt_text = (ev.payload.prompt_text as string) ?? null;
        break;

      case "SECTION_TIME_WARNING":
        // No state change; optional placeholder
        break;

      case "CANDIDATE_MESSAGE":
      case "CANDIDATE_MARKED_DONE":
      case "CLIENT_CONNECTED":
      case "CLIENT_DISCONNECTED":
      case "CLIENT_RECONNECTED":
        // No reducer state change for these
        break;

      default:
        break;
    }
  }

  return {
    status,
    current_section_id,
    section_started_at,
    section_deadline_at,
    last_seq,
    section_progress: sectionProgress,
    active_prompt_id,
    active_prompt_text
  };
}

/**
 * Compute recommended_action for snapshot: "expire_section" if current section
 * deadline is in the past and status is IN_PROGRESS.
 */
export function getRecommendedAction(
  state: ReducedState,
  nowIso: string
): "none" | "expire_section" {
  if (state.status !== "IN_PROGRESS" || !state.section_deadline_at) return "none";
  if (new Date(nowIso).getTime() >= new Date(state.section_deadline_at).getTime()) {
    return "expire_section";
  }
  return "none";
}

/**
 * Remaining seconds until section_deadline_at; null if no deadline or already passed.
 */
export function getRemainingSeconds(state: ReducedState, nowIso: string): number | null {
  if (!state.section_deadline_at) return null;
  const deadline = new Date(state.section_deadline_at).getTime();
  const now = new Date(nowIso).getTime();
  const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
  return remaining;
}

export function buildSnapshotSections(
  schema: InterviewSchemaDef,
  state: ReducedState
): { id: string; name: string; started_at?: string; ended_at?: string; end_reason?: SectionEndReason }[] {
  return state.section_progress.map((p) => ({
    id: p.id,
    name: p.name,
    ...(p.started_at && { started_at: p.started_at }),
    ...(p.ended_at && { ended_at: p.ended_at }),
    ...(p.end_reason && { end_reason: p.end_reason })
  }));
}

export function getCurrentSectionInfo(
  schema: InterviewSchemaDef,
  state: ReducedState
): { id: string; name: string; deadline_at: string | null } | null {
  if (!state.current_section_id) return null;
  const sec = getSectionById(schema, state.current_section_id);
  if (!sec) return { id: state.current_section_id, name: state.current_section_id, deadline_at: state.section_deadline_at };
  return {
    id: sec.id,
    name: sec.name,
    deadline_at: state.section_deadline_at
  };
}
