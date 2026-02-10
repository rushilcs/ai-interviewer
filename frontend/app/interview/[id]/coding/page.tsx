"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import { talentFetch, type ApiError } from "@/lib/api";
import { useSnapshot } from "@/lib/useSnapshot";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Input } from "@/components/ui/Input";
import ReactMarkdown from "react-markdown";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type Language = "python" | "java" | "cpp";

interface PublicTestCase {
  test_index: number;
  input_json: Record<string, unknown>;
  expected_display: string;
}

interface ProblemSummary {
  id: string;
  title: string;
  statement_md: string;
  constraints_md: string;
  examples: PublicTestCase[];
  signatures: Record<Language, string>;
  template_by_language: Record<Language, string>;
}

interface TestResultRow {
  test_id: string;
  test_index: number;
  pass: boolean;
  actual: string | null;
  expected: string | null;
  runtime_ms: number;
  error: string | null;
  timed_out?: boolean;
}

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" }
];

const TRUNCATE = 200;
function truncateStr(s: string, max: number = TRUNCATE): string {
  return s.length <= max ? s : s.slice(0, max) + "...";
}

export default function CodingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const token = searchParams.get("token");

  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState("");
  const [runResultsByProblem, setRunResultsByProblem] = useState<Record<string, TestResultRow[]>>({});
  const [submitSummaryByProblem, setSubmitSummaryByProblem] = useState<Record<string, { passed: number; total: number; status: string }>>({});
  const [compileErrorByProblem, setCompileErrorByProblem] = useState<Record<string, string | null>>({});
  const [errorByProblem, setErrorByProblem] = useState<Record<string, string | null>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantText, setAssistantText] = useState("");
  const [assistantResponse, setAssistantResponse] = useState<{ text: string; blocked: boolean } | null>(null);
  const [assistantSending, setAssistantSending] = useState(false);

  const { snapshot } = useSnapshot(id, token, { enabled: !!id && !!token, intervalMs: 1500 });
  const submittedProblemIds = snapshot?.coding_submitted_problem_ids ?? [];
  const isCurrentProblemSubmitted =
    selectedProblemId != null && submittedProblemIds.includes(selectedProblemId);

  const selectedProblem = problems.find((p) => p.id === selectedProblemId);
  const runResults = selectedProblemId ? runResultsByProblem[selectedProblemId] ?? null : null;
  const submitSummary = selectedProblemId ? submitSummaryByProblem[selectedProblemId] ?? null : null;
  const compileError = selectedProblemId ? compileErrorByProblem[selectedProblemId] ?? null : null;
  const error = selectedProblemId ? errorByProblem[selectedProblemId] ?? null : null;

  const basePath = `/api/talent/interviews/${id}/coding`;
  const authToken = token ?? "";

  const fetchProblems = useCallback(async () => {
    if (!id || !authToken) return;
    try {
      const data = await talentFetch<{ problems: ProblemSummary[] }>(`${basePath}/problems`, authToken);
      setProblems(data.problems ?? []);
      if (data.problems?.length && !selectedProblemId) setSelectedProblemId(data.problems[0].id);
    } catch (e) {
      setLoadError((e as ApiError).message ?? "Failed to load problems");
    } finally {
      setLoading(false);
    }
  }, [id, authToken, basePath, selectedProblemId]);

  const fetchDraft = useCallback(async (problemId: string, lang: Language, template: string) => {
    if (!id || !authToken) return;
    try {
      const data = await talentFetch<{ code: string }>(
        `${basePath}/draft?problem_id=${encodeURIComponent(problemId)}&language=${encodeURIComponent(lang)}`,
        authToken
      );
      const draft = (data.code ?? "").trim();
      setCode(draft ? data.code! : template);
    } catch {
      setCode(template);
    }
  }, [id, authToken, basePath]);

  useEffect(() => {
    fetchProblems();
  }, [fetchProblems]);

  useEffect(() => {
    if (!selectedProblemId || !selectedProblem) return;
    const template = selectedProblem.template_by_language[language] ?? "";
    setCode(template);
    fetchDraft(selectedProblemId, language, template);
  }, [selectedProblemId, language, selectedProblem, fetchDraft]);

  useEffect(() => {
    if (!selectedProblemId || !authToken) return;
    if (submittedProblemIds.includes(selectedProblemId)) return; // Don't save draft after submit (code is locked)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      talentFetch(`${basePath}/draft`, authToken, {
        method: "PUT",
        body: { problem_id: selectedProblemId, language, code }
      }).catch(() => {});
      debounceRef.current = null;
    }, 1000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, selectedProblemId, language, authToken, basePath, submittedProblemIds]);

  const handleRun = useCallback(async () => {
    if (!selectedProblemId || !authToken) return;
    setRunning(true);
    setRunResultsByProblem((prev) => ({ ...prev, [selectedProblemId]: [] }));
    setSubmitSummaryByProblem((prev) => ({ ...prev, [selectedProblemId]: undefined! }));
    setCompileErrorByProblem((prev) => ({ ...prev, [selectedProblemId]: null }));
    setErrorByProblem((prev) => ({ ...prev, [selectedProblemId]: null }));
    try {
      const data = await talentFetch<{
        results: TestResultRow[];
        summary: { passed: number; total: number };
        compile_error?: string;
      }>(`${basePath}/run`, authToken, {
        method: "POST",
        body: { problem_id: selectedProblemId, language, code }
      });
      setRunResultsByProblem((prev) => ({ ...prev, [selectedProblemId]: data.results ?? [] }));
      setCompileErrorByProblem((prev) => ({ ...prev, [selectedProblemId]: data.compile_error ?? null }));
    } catch (e) {
      setErrorByProblem((prev) => ({ ...prev, [selectedProblemId]: (e as ApiError).message ?? "Run failed" }));
    } finally {
      setRunning(false);
    }
  }, [selectedProblemId, language, code, authToken, basePath]);

  const handleSubmit = useCallback(async () => {
    if (!selectedProblemId || !authToken) return;
    setSubmitting(true);
    setRunResultsByProblem((prev) => ({ ...prev, [selectedProblemId]: prev[selectedProblemId] ?? [] }));
    setCompileErrorByProblem((prev) => ({ ...prev, [selectedProblemId]: null }));
    setErrorByProblem((prev) => ({ ...prev, [selectedProblemId]: null }));
    try {
      const data = await talentFetch<{
        summary: { passed: number; total: number; status: string };
        compile_error?: string;
      }>(`${basePath}/submit`, authToken, {
        method: "POST",
        body: { problem_id: selectedProblemId, language, code }
      });
      setSubmitSummaryByProblem((prev) => ({ ...prev, [selectedProblemId]: data.summary ?? { passed: 0, total: 0, status: "failed" } }));
      setCompileErrorByProblem((prev) => ({ ...prev, [selectedProblemId]: data.compile_error ?? null }));
    } catch (e) {
      setErrorByProblem((prev) => ({ ...prev, [selectedProblemId]: (e as ApiError).message ?? "Submit failed" }));
    } finally {
      setSubmitting(false);
    }
  }, [selectedProblemId, language, code, authToken, basePath]);

  const askAssistant = useCallback(async () => {
    if (!authToken || !id || !assistantText.trim()) return;
    setAssistantSending(true);
    try {
      const res = await talentFetch<{ text: string; blocked?: boolean }>(
        `/api/talent/interviews/${id}/assistant/query`,
        authToken,
        { method: "POST", body: { client_event_id: `a-${Date.now()}`, text: assistantText.trim() } }
      );
      setAssistantResponse({ text: res.text ?? "", blocked: res.blocked ?? false });
      setAssistantText("");
    } catch (e) {
      setAssistantResponse({ text: (e as ApiError).message ?? "Request failed", blocked: false });
    } finally {
      setAssistantSending(false);
    }
  }, [id, authToken, assistantText]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
        <Card className="w-full max-w-md p-6">
          <p className="text-danger font-medium">Missing token</p>
          <p className="text-muted text-sm mt-2">Use your invite link to access the coding section.</p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
        {loadError ? (
          <Banner variant="error">{loadError}</Banner>
        ) : (
          <p className="text-muted">Loading…</p>
        )}
      </div>
    );
  }

  if (loadError && !problems.length) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
        <Banner variant="error">{loadError}</Banner>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto max-w-[1600px] px-4 py-3 flex items-center justify-between">
          <span className="text-lg font-semibold text-text">Coding</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setAssistantOpen(true)}>
              Assistant (concepts only)
            </Button>
            <a
              href={`/interview/${id}?token=${encodeURIComponent(token ?? "")}`}
              className="text-sm text-primary hover:underline"
            >
              ← Back to interview
            </a>
          </div>
        </div>
      </header>

      <div className="flex-1 flex mx-auto w-full max-w-[1600px] p-4 gap-4 min-h-0">
        {/* Leftmost: question titles only */}
        <nav className="w-[200px] flex-shrink-0 flex flex-col gap-1">
          <h2 className="text-xs font-medium text-muted uppercase mb-2 px-1">Questions</h2>
          {problems.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProblemId(p.id)}
              className={`text-left rounded-lg px-3 py-2.5 text-sm border transition-colors ${
                selectedProblemId === p.id
                  ? "bg-primary/10 border-primary text-text font-medium"
                  : "border-border bg-surface text-muted hover:bg-surface2 hover:text-text"
              }`}
            >
              {p.title}
            </button>
          ))}
        </nav>

        {/* Middle: problem statement when one selected */}
        <div className="w-[380px] flex-shrink-0 overflow-auto">
          <Card className="p-4 h-full">
            {selectedProblem ? (
              <>
                <div className="problem-statement text-sm text-text leading-relaxed [&_>*:first-child]:mt-0 [&_p]:my-2 [&_p]:leading-relaxed [&_h1]:font-semibold [&_h1]:text-text [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-base [&_h2]:font-semibold [&_h2]:text-text [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-base [&_h3]:font-semibold [&_h3]:text-text [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:list-outside [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:list-outside [&_li]:my-0.5 [&_li]:pl-0.5 [&_strong]:font-semibold [&_strong]:text-text [&_code]:bg-surface2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs">
                  <ReactMarkdown>{selectedProblem.statement_md}</ReactMarkdown>
                </div>
                <h3 className="text-xs font-medium text-muted uppercase mt-4 mb-2">Constraints</h3>
                <div className="problem-statement text-sm text-muted leading-relaxed [&_>*:first-child]:mt-0 [&_p]:my-2 [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_code]:bg-surface2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs">
                  <ReactMarkdown>{selectedProblem.constraints_md}</ReactMarkdown>
                </div>
                <h3 className="text-xs font-medium text-muted uppercase mt-4 mb-2">Examples</h3>
                <div className="space-y-2 text-xs">
                  {selectedProblem.examples.slice(0, 3).map((ex) => (
                    <div key={ex.test_index} className="bg-surface2 p-2 rounded">
                      <span className="text-muted">Input:</span>
                      <pre className="font-mono mt-1 break-all">{JSON.stringify(ex.input_json)}</pre>
                      <span className="text-muted mt-1 block">Expected:</span>
                      <pre className="font-mono mt-1">{truncateStr(ex.expected_display)}</pre>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted text-sm">Select a question from the left.</p>
            )}
          </Card>
        </div>

        {/* Right: editor + results */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <Card className="flex-1 flex flex-col min-h-0 p-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="h-9 rounded-lg border border-border bg-surface2 text-text text-sm px-3"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Button variant="primary" onClick={handleRun} disabled={running || submitting}>
                {running ? "Running…" : "Run"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleSubmit}
                disabled={running || submitting || isCurrentProblemSubmitted}
                title={isCurrentProblemSubmitted ? "Already submitted (one submit per question)" : undefined}
              >
                {submitting ? "Submitting…" : isCurrentProblemSubmitted ? "Submitted" : "Submit"}
              </Button>
            </div>
            <div className="flex-1 min-h-[300px] border border-border rounded-lg overflow-hidden relative">
              {isCurrentProblemSubmitted && (
                <div className="absolute top-2 right-2 z-10 rounded bg-surface2 border border-border px-2 py-1 text-xs font-medium text-muted">
                  Submitted — code locked
                </div>
              )}
              <MonacoEditor
                height="100%"
                language={language === "python" ? "python" : language === "java" ? "java" : "cpp"}
                value={code}
                onChange={(v) => !isCurrentProblemSubmitted && setCode(v ?? "")}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  scrollBeyondLastLine: false,
                  padding: { top: 8 },
                  readOnly: isCurrentProblemSubmitted
                }}
              />
            </div>
          </Card>

          <Card className="mt-4 p-4">
            <h2 className="text-sm font-medium text-muted uppercase mb-3">
              Results {selectedProblem ? `— ${selectedProblem.title}` : ""}
            </h2>
            {error && (
              <Banner variant="error" className="mb-3">
                {error}
              </Banner>
            )}
            {compileError && (
              <Banner variant="error" className="mb-3">
                Compile/runtime error: {compileError}
              </Banner>
            )}
            {submitSummary != null && (
              <div className="mb-3">
                <p className="text-text font-medium">
                  Passed {submitSummary.passed}/{submitSummary.total} — {submitSummary.status}
                </p>
              </div>
            )}
            {runResults != null && runResults.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b border-border">
                      <th className="py-2 pr-4">Test #</th>
                      <th className="py-2 pr-4">Pass</th>
                      <th className="py-2 pr-4">Runtime (ms)</th>
                      <th className="py-2 pr-4">Error</th>
                      <th className="py-2 pr-4">Expected</th>
                      <th className="py-2">Actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runResults.map((r) => (
                      <tr key={r.test_id} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-mono">{r.test_index + 1}</td>
                        <td className="py-2 pr-4">
                          <span className={r.pass ? "text-success" : "text-danger"}>{r.pass ? "Pass" : "Fail"}</span>
                          {r.timed_out && <span className="text-warning ml-1">(TLE)</span>}
                        </td>
                        <td className="py-2 pr-4">{r.runtime_ms}</td>
                        <td className="py-2 pr-4 text-danger max-w-[200px] truncate" title={r.error ?? ""}>
                          {r.error ? truncateStr(r.error) : "—"}
                        </td>
                        <td className="py-2 pr-4 max-w-[200px] truncate font-mono text-muted" title={r.expected ?? ""}>
                          {r.expected != null ? truncateStr(r.expected) : "—"}
                        </td>
                        <td className="py-2 max-w-[200px] truncate font-mono text-muted" title={r.actual ?? ""}>
                          {r.actual != null ? truncateStr(r.actual) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!runResults?.length && !submitSummary && !error && !compileError && (
              <p className="text-muted text-sm">Run or submit to see results for this question.</p>
            )}
          </Card>
        </div>
      </div>

      {assistantOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setAssistantOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <Card
            className="w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-text">Assistant (concepts only)</h2>
              <Button variant="secondary" onClick={() => setAssistantOpen(false)}>
                Close
              </Button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <p className="text-muted text-xs mb-2">
                Ask about concepts or clarifications. The assistant will not give hints, solutions, or walkthroughs.
              </p>
              <div className="flex gap-2 mb-3">
                <Input
                  value={assistantText}
                  onChange={(e) => setAssistantText(e.target.value)}
                  placeholder="Ask a question…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      askAssistant();
                    }
                  }}
                />
                <Button variant="secondary" onClick={askAssistant} disabled={assistantSending || !assistantText.trim()}>
                  Ask
                </Button>
              </div>
              {assistantResponse && (
                <div
                  className={`rounded-[10px] border px-3 py-2 text-sm ${
                    assistantResponse.blocked
                      ? "border-danger bg-surface2 text-danger"
                      : "border-border bg-surface2 text-text"
                  }`}
                >
                  {assistantResponse.blocked && (
                    <span className="inline-block text-xs font-medium text-danger uppercase mb-2">Blocked</span>
                  )}
                  {assistantResponse.text}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
