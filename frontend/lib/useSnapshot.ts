"use client";

import { useState, useEffect, useCallback } from "react";
import { talentFetch } from "./api";
import { useInterval } from "./polling";

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
  status: string;
  schema_version: string;
  problem_context?: string;
  current_section: {
    id: string;
    name: string;
    objective?: string;
    deadline_at: string | null;
    remaining_seconds: number | null;
  } | null;
  current_prompt: CurrentPrompt | null;
  sections: {
    id: string;
    name: string;
    objective?: string;
    started_at?: string;
    ended_at?: string;
    end_reason?: string;
  }[];
  last_seq: number;
  events: SnapshotEvent[];
  recommended_action: "none" | "expire_section";
  current_section_questions_count?: number;
  current_section_max_questions?: number;
  total_sections?: number;
  /** Coding section: problem ids that have been submitted (one submit per problem). */
  coding_submitted_problem_ids?: string[];
  /** Coding section: true when all problems have been submitted (enables next section without warning). */
  coding_section_complete?: boolean;
  /** True when interviewer has finished questions for this section (enables next section without warning). */
  current_section_interviewer_satisfied?: boolean;
};

export function useSnapshot(
  interviewId: string | null,
  token: string | null,
  options: { enabled?: boolean; intervalMs?: number } = {}
) {
  const { enabled = true, intervalMs = 1500 } = options;
  const [snapshot, setSnapshot] = useState<InterviewSnapshot | null>(null);
  const [events, setEvents] = useState<SnapshotEvent[]>([]);
  const [lastSeq, setLastSeq] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    if (!interviewId || !token) return;
    const since = lastSeq > 0 ? lastSeq : undefined;
    const path = since != null
      ? `/api/talent/interviews/${interviewId}/snapshot?since_seq=${since}`
      : `/api/talent/interviews/${interviewId}/snapshot`;
    try {
      const data = await talentFetch<InterviewSnapshot>(path, token);
      setSnapshot(data);
      if (data.events && data.events.length > 0) {
        setEvents((prev) => {
          const bySeq = new Map(prev.map((e) => [e.seq, e]));
          for (const e of data.events) {
            bySeq.set(e.seq, e);
          }
          return Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq);
        });
        const maxSeq = Math.max(...data.events.map((e) => e.seq));
        setLastSeq((prev) => Math.max(prev, maxSeq, data.last_seq ?? 0));
      }
      if (data.last_seq != null) {
        setLastSeq((prev) => Math.max(prev, data.last_seq));
      }
      setError(null);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "Failed to load snapshot";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [interviewId, token, lastSeq]);

  useEffect(() => {
    if (!enabled || !interviewId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchSnapshot();
  }, [enabled, interviewId, token]);

  useInterval(
    enabled && interviewId && token ? fetchSnapshot : () => {},
    enabled && interviewId && token ? intervalMs : null
  );

  return { snapshot, events, loading, error, lastSeq, refetch: fetchSnapshot };
}
