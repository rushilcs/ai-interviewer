"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Banner } from "@/components/ui/Banner";
import { CopyButton } from "@/components/ui/CopyButton";
import { truncateId } from "@/lib/format";
import { opsFetch, type ApiError } from "@/lib/api";

type ReplaySection = {
  section_id: string;
  messages: { seq: number; text: string; created_at: string }[];
  prompts: { seq: number; prompt_id: string; text: string; created_at: string }[];
};

type CodingSubmissionEntry = {
  seq: number;
  problem_id: string;
  code_text: string;
  language: string;
  created_at: string;
};

type CodingTestResultEntry = {
  seq: number;
  problem_id: string;
  passed: number;
  total: number;
  created_at: string;
};

type ReplayResponse = {
  interview_id: string;
  sections: ReplaySection[];
  assistant_usage: { seq: number; query: string; response?: string; blocked?: boolean }[];
  section_timing: { section_id: string; started_at?: string; ended_at?: string; duration_seconds?: number }[];
  disconnect_count: number;
  coding_submissions?: CodingSubmissionEntry[];
  coding_test_results?: CodingTestResultEntry[];
};

type EvidencePointer = {
  type?: string;
  section_id?: string | null;
  from_seq?: number;
  to_seq?: number;
  quote?: string;
};

type MetricOutput = {
  name: string;
  value: number;
  scale?: string;
  explanation?: string;
  evidence?: EvidencePointer[];
};

type SignalOutput = {
  name: string;
  value: number;
  explanation?: string;
  evidence?: EvidencePointer[];
};

type SectionEvaluation = {
  section_id: string;
  summary?: string;
  signals?: SignalOutput[];
  metrics?: MetricOutput[];
};

type EvaluationResponse = {
  interview_id: string;
  evaluation_version: string;
  overall_score: number | null;
  overall_band: string | null;
  metrics: MetricOutput[];
  sections: SectionEvaluation[];
  signals?: unknown;
  created_at: string;
};

function formatMetricName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function EvaluationTextView({ data }: { data: EvaluationResponse }) {
  const metrics = Array.isArray(data.metrics) ? data.metrics : [];
  const sections = Array.isArray(data.sections) ? data.sections : [];

  return (
    <div className="space-y-6 text-sm text-text">
      {/* Overall */}
      <div className="space-y-1">
        <h3 className="text-xs font-semibold uppercase text-muted tracking-wide">Overall</h3>
        <div className="rounded-[10px] border border-border bg-surface2 px-4 py-3 space-y-1">
          <p>
            <span className="text-muted">Score: </span>
            <span className="font-medium">
              {data.overall_score != null ? data.overall_score.toFixed(2) : "—"}
            </span>
            {data.overall_score != null && (
              <span className="text-muted ml-2">(scale 0–1)</span>
            )}
          </p>
          <p>
            <span className="text-muted">Band: </span>
            <span className="font-medium">{data.overall_band ?? "—"}</span>
          </p>
        </div>
      </div>

      {/* Metrics (subscores) */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted tracking-wide">Metrics</h3>
        <ul className="space-y-3">
          {metrics.map((m) => (
            <li key={m.name} className="rounded-[10px] border border-border bg-surface2 px-4 py-3">
              <p className="font-medium text-text">{formatMetricName(m.name)}</p>
              <p className="text-muted mt-0.5">
                Value: <span className="text-text">{m.value.toFixed(2)}</span>
                {m.scale && <span className="ml-1">({m.scale})</span>}
              </p>
              {m.explanation && (
                <p className="text-muted mt-1 text-xs">{m.explanation}</p>
              )}
              {m.evidence && m.evidence.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted mb-1">Evidence</p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs text-muted">
                    {m.evidence.map((e, i) => (
                      <li key={i}>
                        {e.quote ? (
                          <span className="text-text">"{e.quote}"</span>
                        ) : (
                          <span>
                            {e.section_id ?? "—"} seq {e.from_seq ?? "?"}–{e.to_seq ?? "?"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Sections */}
      {sections.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted tracking-wide">Sections</h3>
          <ul className="space-y-4">
            {sections.map((sec) => (
              <li key={sec.section_id} className="rounded-[10px] border border-border bg-surface2 px-4 py-3">
                <p className="font-medium text-text">{sec.section_id.replace(/_/g, " ")}</p>
                {sec.summary && (
                  <p className="text-muted mt-1 text-xs">{sec.summary}</p>
                )}
                {sec.signals && sec.signals.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-muted mb-1">Signals</p>
                    <ul className="space-y-1 text-xs">
                      {sec.signals.map((s) => (
                        <li key={s.name}>
                          <span className="text-text">{formatMetricName(s.name)}</span>
                          <span className="text-muted"> = {s.value}</span>
                          {s.evidence && s.evidence.length > 0 && s.evidence[0].quote && (
                            <span className="text-muted ml-1"> — "{s.evidence[0].quote}"</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {sec.metrics && sec.metrics.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs font-medium text-muted mb-1">Section metrics</p>
                    <ul className="space-y-0.5 text-xs text-muted">
                      {sec.metrics.map((sm) => (
                        <li key={sm.name}>
                          {formatMetricName(sm.name)}: <span className="text-text">{sm.value.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function OpsInterviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadReplay() {
    if (!id) return;
    setReplayError(null);
    try {
      const data = await opsFetch<ReplayResponse>(`/api/ops/interviews/${id}/replay`);
      setReplay(data);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        if (typeof window !== "undefined") localStorage.removeItem("ops_jwt");
        router.replace("/ops/login");
        return;
      }
      setReplayError(e.message ?? "Failed to load replay");
    }
  }

  async function loadEvaluation() {
    if (!id) return;
    setEvalError(null);
    try {
      const data = await opsFetch<EvaluationResponse>(`/api/ops/interviews/${id}/evaluation`);
      setEvaluation(data);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        if (typeof window !== "undefined") localStorage.removeItem("ops_jwt");
        router.replace("/ops/login");
        return;
      }
      if (e.status === 404) {
        setEvaluation(null);
        return;
      }
      setEvalError(e.message ?? "Failed to load evaluation");
    }
  }

  async function loadInterviewStatus() {
    if (!id) return;
    try {
      const data = await opsFetch<{ interviews: { status: string }[] }>("/api/ops/interviews");
      const found = data.interviews?.find((i: { id: string }) => i.id === id);
      if (found) setStatus(found.status);
    } catch {
      // ignore
    }
  }

  async function refresh() {
    setLoading(true);
    await Promise.all([loadReplay(), loadEvaluation(), loadInterviewStatus()]);
    setLoading(false);
  }

  async function runEvaluation() {
    if (!id) return;
    setEvalLoading(true);
    setEvalError(null);
    try {
      await opsFetch(`/api/ops/interviews/${id}/evaluate`, { method: "POST" });
      await loadEvaluation();
    } catch (err) {
      const e = err as ApiError;
      setEvalError(e.message ?? "Evaluation failed");
    } finally {
      setEvalLoading(false);
    }
  }

  useEffect(() => {
    const jwt = typeof window !== "undefined" ? localStorage.getItem("ops_jwt") : null;
    if (!jwt) {
      router.replace("/ops/login");
      return;
    }
    refresh();
  }, [id]);

  return (
    <AppShell>
      <div className="mb-4">
        <Link href="/ops/interviews" className="text-sm text-primary hover:underline">
          ← Back to interviews
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-text">
            Interview {truncateId(id)}
          </h1>
          <CopyButton text={id} label="Copy" />
          {status && <Badge status={status} />}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={runEvaluation}
            disabled={evalLoading || status !== "COMPLETED"}
          >
            {evalLoading ? "Running…" : "Run evaluation"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        {/* Left: Evaluation */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-base font-semibold text-text">Evaluation</h2>
            </div>
            <div className="p-4">
              {evalError && <Banner variant="error" className="mb-4">{evalError}</Banner>}
              {evaluation ? (
                <div className="overflow-auto max-h-[500px] pr-2">
                  <EvaluationTextView data={evaluation} />
                </div>
              ) : (
                <p className="text-muted text-sm">
                  No evaluation yet. Run evaluation when interview is completed.
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Right: Replay */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-base font-semibold text-text">Replay</h2>
            </div>
            <div className="p-4">
              {replayError && <Banner variant="error" className="mb-4">{replayError}</Banner>}
              {replay ? (
                <div className="space-y-6">
                  {replay.sections?.map((sec) => (
                    <div key={sec.section_id}>
                      <h3 className="text-sm font-medium text-muted mb-2 uppercase">
                        {sec.section_id.replace(/_/g, " ")}
                      </h3>
                      <div className="space-y-2">
                        {[...(sec.prompts ?? []), ...(sec.messages ?? [])]
                          .sort(
                            (a, b) =>
                              (a as { seq: number }).seq - (b as { seq: number }).seq
                          )
                          .map((item, idx) => {
                            const isPrompt = "prompt_id" in item;
                            return (
                              <div
                                key={idx}
                                className={`rounded-[10px] border border-border px-3 py-2 text-sm ${
                                  isPrompt ? "bg-surface2 text-muted" : "bg-surface"
                                }`}
                              >
                                <span className="text-xs font-medium text-muted mr-2">
                                  {isPrompt ? "Interviewer" : "Candidate"}:
                                </span>
                                {(item as { text?: string }).text ?? ""}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                  {(replay.coding_submissions?.length ?? 0) > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-muted mb-2 uppercase">
                        Coding — Submissions & test results
                      </h3>
                      <div className="space-y-4">
                        {replay.coding_submissions?.map((sub, i) => {
                          const result = replay.coding_test_results?.find(
                            (r) => r.problem_id === sub.problem_id
                          );
                          return (
                            <div
                              key={i}
                              className="rounded-[10px] border border-border bg-surface2 overflow-hidden"
                            >
                              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                                <span className="text-xs font-medium text-muted">
                                  Problem: {sub.problem_id}
                                </span>
                                <span className="text-xs text-muted">
                                  {sub.language}
                                  {result != null && (
                                    <span className="ml-2 text-text">
                                      Tests: {result.passed}/{result.total}
                                    </span>
                                  )}
                                </span>
                              </div>
                              <pre className="p-3 text-xs text-text overflow-auto max-h-[200px] whitespace-pre-wrap font-mono bg-surface">
                                {sub.code_text}
                              </pre>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {replay.assistant_usage?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-muted mb-2 uppercase">
                        Assistant usage
                      </h3>
                      <ul className="space-y-2 text-sm">
                        {replay.assistant_usage.map((a, i) => (
                          <li key={i} className="rounded-[10px] border border-border bg-surface2 px-3 py-2">
                            <span className="text-muted">Q:</span> {a.query}
                            {a.response != null && (
                              <>
                                <br />
                                <span className="text-muted">A:</span> {a.response}
                                {a.blocked && (
                                  <span className="ml-2 text-danger text-xs">(blocked)</span>
                                )}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-muted">
                    Disconnects: {replay.disconnect_count ?? 0}
                  </p>
                </div>
              ) : (
                <p className="text-muted text-sm">Loading…</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
