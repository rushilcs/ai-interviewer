/**
 * Build replay bundle from interview events. Used by GET /replay and by review assembler.
 * Chunk 5 replay logic in one place (no duplication).
 */

import { getEvents } from "../orchestration/eventStore";

export type ReplayMessage = { seq: number; text: string; created_at: string };
export type ReplayPrompt = { seq: number; prompt_id: string; text: string; created_at: string };
export type ReplaySection = {
  section_id: string;
  messages: ReplayMessage[];
  prompts: ReplayPrompt[];
};
export type ReplayAssistantEntry = {
  seq: number;
  query: string;
  response?: string;
  blocked?: boolean;
  created_at: string;
};
export type ReplayTimingEntry = {
  section_id: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
};

export type CodingSubmissionEntry = {
  seq: number;
  problem_id: string;
  code_text: string;
  language: string;
  created_at: string;
};

export type CodingTestResultEntry = {
  seq: number;
  problem_id: string;
  passed: number;
  total: number;
  created_at: string;
};

export type ReplayBundle = {
  interview_id: string;
  transcript_by_section: ReplaySection[];
  /** Flattened prompts (each section's prompts in order) for export */
  prompts: ReplayPrompt[];
  assistant_usage: ReplayAssistantEntry[];
  timing_per_section: ReplayTimingEntry[];
  disconnects: number;
  /** Coding section: submitted code per problem */
  coding_submissions: CodingSubmissionEntry[];
  /** Coding section: test run result per submission */
  coding_test_results: CodingTestResultEntry[];
};

export async function buildReplay(interviewId: string): Promise<ReplayBundle> {
  const events = await getEvents(interviewId);

  const bySection: Record<
    string,
    { messages: ReplayMessage[]; prompts: ReplayPrompt[] }
  > = {};
  const assistantUsage: ReplayAssistantEntry[] = [];
  const codingSubmissions: CodingSubmissionEntry[] = [];
  const codingTestResults: CodingTestResultEntry[] = [];
  const sectionIds = new Set<string>();
  let disconnect_count = 0;

  for (const e of events) {
    if (e.section_id) sectionIds.add(e.section_id);
    if (e.event_type === "CLIENT_DISCONNECTED" || e.event_type === "CLIENT_RECONNECTED")
      disconnect_count++;
    if (e.section_id === "section_coding" && e.event_type === "CANDIDATE_CODE_SUBMITTED") {
      codingSubmissions.push({
        seq: e.seq,
        problem_id: (e.payload?.problem_id as string) ?? "",
        code_text: (e.payload?.code_text as string) ?? "",
        language: (e.payload?.language as string) ?? "",
        created_at: e.created_at
      });
    }
    if (e.section_id === "section_coding" && e.event_type === "CODE_TESTS_RESULT") {
      codingTestResults.push({
        seq: e.seq,
        problem_id: (e.payload?.problem_id as string) ?? "",
        passed: Number(e.payload?.passed ?? 0),
        total: Number(e.payload?.total ?? 0),
        created_at: e.created_at
      });
    }
  }

  for (const sid of sectionIds) {
    bySection[sid] = { messages: [], prompts: [] };
  }

  const sectionStartedAt: Record<string, string> = {};
  const sectionEndedAt: Record<string, string> = {};

  for (const e of events) {
    if (e.event_type === "SECTION_STARTED" && e.section_id) {
      sectionStartedAt[e.section_id] = e.created_at;
    }
    if (e.event_type === "SECTION_ENDED" && e.section_id) {
      sectionEndedAt[e.section_id] = e.created_at;
    }

    if (e.event_type === "CANDIDATE_MESSAGE" && e.section_id) {
      const text = (e.payload?.text as string) ?? "";
      if (!bySection[e.section_id]) bySection[e.section_id] = { messages: [], prompts: [] };
      bySection[e.section_id].messages.push({ seq: e.seq, text, created_at: e.created_at });
    }
    if (e.event_type === "PROMPT_PRESENTED" && e.section_id) {
      if (!bySection[e.section_id]) bySection[e.section_id] = { messages: [], prompts: [] };
      bySection[e.section_id].prompts.push({
        seq: e.seq,
        prompt_id: (e.payload?.prompt_id as string) ?? "",
        text: (e.payload?.prompt_text as string) ?? "",
        created_at: e.created_at
      });
    }
    if (e.event_type === "ASSISTANT_QUERY") {
      assistantUsage.push({
        seq: e.seq,
        query: (e.payload?.text as string) ?? "",
        created_at: e.created_at
      });
    }
    if (e.event_type === "ASSISTANT_RESPONSE" || e.event_type === "ASSISTANT_RESPONSE_BLOCKED") {
      const last = assistantUsage[assistantUsage.length - 1];
      if (last) {
        last.response =
          (e.payload?.text as string) ?? (e.payload?.safe_alternative_text as string) ?? "";
        last.blocked =
          (e.payload?.blocked as boolean) ?? e.event_type === "ASSISTANT_RESPONSE_BLOCKED";
      }
    }
  }

  const timing_per_section: ReplayTimingEntry[] = [];
  for (const sid of sectionIds) {
    const started = sectionStartedAt[sid];
    const ended = sectionEndedAt[sid];
    let duration_seconds: number | undefined;
    if (started && ended) {
      duration_seconds = Math.round(
        (new Date(ended).getTime() - new Date(started).getTime()) / 1000
      );
    }
    timing_per_section.push({ section_id: sid, started_at: started, ended_at: ended, duration_seconds });
  }

  const transcript_by_section = Object.entries(bySection).map(([section_id, data]) => ({
    section_id,
    ...data
  }));

  const prompts: ReplayPrompt[] = transcript_by_section.flatMap((s) => s.prompts);

  return {
    interview_id: interviewId,
    transcript_by_section,
    prompts,
    assistant_usage: assistantUsage,
    timing_per_section,
    disconnects: disconnect_count,
    coding_submissions: codingSubmissions,
    coding_test_results: codingTestResults
  };
}
