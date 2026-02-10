"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import { useSnapshot } from "@/lib/useSnapshot";
import { talentFetch, type ApiError } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Banner } from "@/components/ui/Banner";
import { InterviewLayout } from "./components/InterviewLayout";
import { CodingLayout } from "./components/CodingLayout";

export default function InterviewIdPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const token = searchParams.get("token");

  const [messageText, setMessageText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [assistantResponse, setAssistantResponse] = useState<{
    text: string;
    blocked: boolean;
  } | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [assistantSending, setAssistantSending] = useState(false);
  const [showIncompleteSectionWarning, setShowIncompleteSectionWarning] = useState(false);

  const { snapshot, events, loading, error: snapshotError, refetch } = useSnapshot(
    id,
    token,
    { enabled: !!id && !!token, intervalMs: 1500 }
  );

  const invalidToken = !token || (snapshotError && (snapshotError.includes("Invalid") || snapshotError.includes("401")));

  const sendMessage = useCallback(async () => {
    if (!token || !id || !messageText.trim()) return;
    setSending(true);
    setNetworkError(null);
    try {
      await talentFetch(`/api/talent/interviews/${id}/messages`, token, {
        method: "POST",
        body: { client_event_id: `msg-${Date.now()}`, text: messageText.trim() },
      });
      setMessageText("");
      await refetch();
    } catch (err) {
      setNetworkError((err as ApiError).message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  }, [id, token, messageText, refetch]);

  const markDone = useCallback(async () => {
    if (!token || !id) return;
    setSending(true);
    setNetworkError(null);
    try {
      await talentFetch(`/api/talent/interviews/${id}/section-done`, token, {
        method: "POST",
        body: { client_event_id: `done-${Date.now()}` },
      });
      refetch();
    } catch (err) {
      setNetworkError((err as ApiError).message ?? "Failed");
    } finally {
      setSending(false);
    }
  }, [id, token, refetch]);

  const advance = useCallback(async () => {
    if (!token || !id) return;
    setSending(true);
    setNetworkError(null);
    try {
      await talentFetch(`/api/talent/interviews/${id}/advance`, token, {
        method: "POST",
        body: {},
      });
      refetch();
    } catch (err) {
      setNetworkError((err as ApiError).message ?? "Failed");
    } finally {
      setSending(false);
    }
  }, [id, token, refetch]);

  const askAssistant = useCallback(async () => {
    if (!token || !id || !assistantText.trim()) return;
    setAssistantSending(true);
    setNetworkError(null);
    try {
      const res = await talentFetch<{ text: string; blocked?: boolean }>(
        `/api/talent/interviews/${id}/assistant/query`,
        token,
        {
          method: "POST",
          body: { client_event_id: `a-${Date.now()}`, text: assistantText.trim() },
        }
      );
      setAssistantResponse({ text: res.text ?? "", blocked: res.blocked ?? false });
      setAssistantText("");
      refetch();
    } catch (err) {
      setNetworkError((err as ApiError).message ?? "Assistant request failed");
    } finally {
      setAssistantSending(false);
    }
  }, [id, token, assistantText, refetch]);

  const advanceTriggeredRef = useRef(false);
  useEffect(() => {
    if (snapshot?.recommended_action !== "expire_section") {
      advanceTriggeredRef.current = false;
      return;
    }
    if (snapshot?.status !== "IN_PROGRESS" || advanceTriggeredRef.current) return;
    advanceTriggeredRef.current = true;
    advance();
  }, [snapshot?.recommended_action, snapshot?.status, advance]);

  if (invalidToken && !snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
        <Card className="w-full max-w-md">
          <div className="p-6 text-center">
            <p className="text-danger font-medium">Invalid or expired token</p>
            <p className="text-muted text-sm mt-2">You need a valid invite link to access this interview.</p>
          </div>
        </Card>
      </div>
    );
  }

  const isCodingSection = snapshot?.current_section?.id === "section_coding";
  const totalSections = snapshot?.total_sections ?? 4;
  const sectionCount = snapshot?.current_section_questions_count ?? 0;
  const sectionMax = snapshot?.current_section_max_questions ?? 3;
  const completedSections = snapshot?.sections?.filter((s) => s.ended_at).length ?? 0;
  const overallProgress =
    totalSections > 0
      ? (completedSections + (sectionMax > 0 ? sectionCount / sectionMax : 0)) / totalSections
      : 0;
  const currentSectionIndex = snapshot?.sections?.findIndex((s) => s.id === snapshot?.current_section?.id) ?? -1;
  const nextSection = currentSectionIndex >= 0 && snapshot?.sections && currentSectionIndex < snapshot.sections.length - 1
    ? snapshot.sections[currentSectionIndex + 1]
    : null;
  const sectionQuestionsComplete =
    (!isCodingSection &&
      (snapshot?.current_section_interviewer_satisfied === true ||
        (sectionMax > 0 && sectionCount >= sectionMax))) ||
    (isCodingSection && snapshot?.coding_section_complete === true);

  const handleMoveToNextSection = useCallback(() => {
    if (sectionQuestionsComplete) {
      markDone();
    } else {
      setShowIncompleteSectionWarning(true);
    }
  }, [sectionQuestionsComplete, markDone]);

  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">
      {/* Global progress bar (optional top bar) */}
      {snapshot?.status === "IN_PROGRESS" && (
        <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-1.5">
          <div className="mx-auto max-w-[1100px] flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Overall</span>
            <div className="flex-1 max-w-[200px] h-1.5 rounded-full bg-surface2 overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.min(100, overallProgress * 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted">{Math.round(overallProgress * 100)}%</span>
          </div>
        </div>
      )}

      {snapshot?.status === "COMPLETED" && (
        <div className="flex-shrink-0 px-4 py-2">
          <Banner variant="info">Interview completed. You can close this page.</Banner>
        </div>
      )}
      {networkError && (
        <div className="flex-shrink-0 px-4 py-2">
          <Banner variant="error">{networkError}</Banner>
        </div>
      )}

      {isCodingSection ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <CodingLayout
            snapshot={snapshot}
            interviewId={id}
            token={token}
            nextSection={nextSection}
            onNextSectionClick={handleMoveToNextSection}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <InterviewLayout
            snapshot={snapshot}
            events={events}
            loading={loading}
            messageText={messageText}
            onMessageChange={setMessageText}
            onSendMessage={sendMessage}
            sending={sending}
            onOpenAssistant={() => setAssistantOpen(true)}
            onNextSectionClick={handleMoveToNextSection}
            nextSection={nextSection}
            sectionQuestionsComplete={sectionQuestionsComplete}
          />
        </div>
      )}

      {/* Incomplete section warning modal */}
      {showIncompleteSectionWarning && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incomplete-section-title"
        >
          <Card className="w-full max-w-md p-6 shadow-lg">
            <h2 id="incomplete-section-title" className="text-lg font-semibold text-text mb-2">
              Section not finished
            </h2>
            <p className="text-sm text-muted mb-6">
              You have not finished the current section. You may proceed to the next section, but you will not be able to return.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowIncompleteSectionWarning(false)}
              >
                Stay
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setShowIncompleteSectionWarning(false);
                  markDone();
                }}
                disabled={sending}
              >
                Proceed to next section
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Assistant modal */}
      {assistantOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-overlay"
          onClick={() => setAssistantOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <Card
            className="w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-text">Assistant</h2>
              <Button variant="secondary" onClick={() => setAssistantOpen(false)}>
                Close
              </Button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <div className="flex gap-2 mb-3">
                <Input
                  value={assistantText}
                  onChange={(e) => setAssistantText(e.target.value)}
                  placeholder="Ask a question (concepts only)…"
                  disabled={snapshot?.status === "COMPLETED"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      askAssistant();
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  onClick={askAssistant}
                  disabled={assistantSending || !assistantText.trim() || snapshot?.status === "COMPLETED"}
                >
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
                    <span className="inline-block text-xs font-medium text-danger uppercase mb-2">
                      Blocked
                    </span>
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
