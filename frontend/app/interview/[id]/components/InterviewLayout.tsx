"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { SectionNavigator } from "./SectionNavigator";
import { ActivePrompt } from "./ActivePrompt";
import { TranscriptPanel } from "./TranscriptPanel";
import { ResponseComposer } from "./ResponseComposer";
import { CountdownPill } from "./CountdownPill";
import { Button } from "@/components/ui/Button";
import type { InterviewSnapshot, SnapshotEvent } from "@/lib/useSnapshot";

const SIDEBAR_WIDTH_KEY = "interview-sidebar-width";
const MIN_SIDEBAR = 220;
const DEFAULT_SIDEBAR = 560; // 2x original 280px

function getMaxSidebarWidth(): number {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR;
  return Math.max(MIN_SIDEBAR, Math.floor(window.innerWidth * 0.75));
}

function getStoredSidebarWidth(): number {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR;
  try {
    const maxW = getMaxSidebarWidth();
    const w = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? "", 10);
    if (Number.isFinite(w) && w >= MIN_SIDEBAR && w <= maxW) return w;
    if (Number.isFinite(w) && w > maxW) return maxW;
  } catch {}
  return DEFAULT_SIDEBAR;
}

interface InterviewLayoutProps {
  snapshot: InterviewSnapshot | null;
  events: SnapshotEvent[];
  loading: boolean;
  messageText: string;
  onMessageChange: (v: string) => void;
  onSendMessage: () => void;
  sending: boolean;
  onOpenAssistant: () => void;
  onNextSectionClick: () => void;
  nextSection: { id: string; name: string } | null;
  sectionQuestionsComplete: boolean;
}

export function InterviewLayout({
  snapshot,
  events,
  loading,
  messageText,
  onMessageChange,
  onSendMessage,
  sending,
  onOpenAssistant,
  onNextSectionClick,
  nextSection,
  sectionQuestionsComplete,
}: InterviewLayoutProps) {
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR);
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSidebarWidth(getStoredSidebarWidth());
  }, []);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const maxW = getMaxSidebarWidth();
      const x = Math.min(e.clientX, maxW);
      if (x >= MIN_SIDEBAR) {
        setSidebarWidth(x);
        try {
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(x));
        } catch {}
      }
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  const currentSection = snapshot?.current_section;
  const currentPromptText = snapshot?.current_prompt?.text ?? "";
  const sectionName = currentSection?.name ?? "Current section";

  // Only show "move to next section" after the user has responded to the last question
  const lastPromptOrResponse = events
    .filter((e) => e.event_type === "PROMPT_PRESENTED" || e.event_type === "CANDIDATE_MESSAGE")
    .pop();
  const userRespondedToLastQuestion = lastPromptOrResponse?.event_type === "CANDIDATE_MESSAGE";
  const showSectionComplete =
    sectionQuestionsComplete && nextSection && userRespondedToLastQuestion;

  const [navigatorOpen, setNavigatorOpen] = useState(false);

  const mainContent = (
    <>
      {/* Header: section title (left) + timer + Assistant (right) */}
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-border bg-surface">
        <h1 className="text-lg font-semibold text-text truncate">
          {currentSection?.name ?? "Interview"}
        </h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <CountdownPill remainingSeconds={currentSection?.remaining_seconds ?? null} />
          <Button variant="secondary" onClick={onOpenAssistant} className="h-8 px-3 text-xs">
            Assistant
          </Button>
        </div>
      </div>

      {/* Move-on message when LLM is done and user has responded to last question */}
      {showSectionComplete && (
        <div className="flex-shrink-0 px-4 py-2 bg-primary/10 border-b border-border">
          <p className="text-sm text-text">
            When you&apos;re ready, click <strong>{nextSection.name}</strong> in the Sections list to continue.
          </p>
        </div>
      )}

      {/* Active Prompt + Transcript */}
      <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
        <div className="flex-shrink-0">
          <ActivePrompt promptText={currentPromptText} sectionName={sectionName} />
        </div>
        <TranscriptPanel
          events={events}
          isOpen={isTranscriptOpen}
          onToggle={() => setIsTranscriptOpen((o) => !o)}
          loading={loading}
          sectionCompleteMessage={
            showSectionComplete
              ? `You've completed the questions for this section. When you're ready, click **${nextSection.name}** in the Sections list to continue.`
              : null
          }
        />
      </div>

      <ResponseComposer
        value={messageText}
        onChange={onMessageChange}
        onSend={onSendMessage}
        sending={sending}
        disabled={snapshot?.status === "COMPLETED"}
      />
    </>
  );

  return (
    <div className="h-full w-full flex flex-col lg:flex-row bg-bg overflow-hidden">
      {/* Desktop: resizable left sidebar (scrollable content) */}
      <aside
        ref={sidebarRef}
        className="hidden lg:flex flex-col flex-shrink-0 min-h-0 border-r border-border bg-surface min-w-0"
        style={{ width: sidebarWidth }}
        aria-label="Section navigator"
      >
        <SectionNavigator
          snapshot={snapshot}
          sectionCount={snapshot?.current_section_questions_count ?? 0}
          sectionMax={snapshot?.current_section_max_questions ?? 0}
          problemContext={snapshot?.problem_context ?? null}
          nextSection={nextSection}
          onNextSectionClick={onNextSectionClick}
          nextSectionDisabled={sending || snapshot?.status === "COMPLETED"}
        />
      </aside>
      {/* Resize handle */}
      <div
        className="hidden lg:block w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 bg-border transition-colors"
        onMouseDown={startDrag}
        aria-hidden
      />

      {/* Mobile: Sections button + sheet */}
      <div className="lg:hidden flex-shrink-0 border-b border-border bg-surface px-4 py-2 flex items-center justify-between">
        <Button variant="secondary" onClick={() => setNavigatorOpen(true)} className="h-8 px-3 text-xs">
          Sections
        </Button>
        <div className="flex items-center gap-2">
          <CountdownPill remainingSeconds={currentSection?.remaining_seconds ?? null} />
          <Button variant="secondary" onClick={onOpenAssistant} className="h-8 px-3 text-xs">
            Assistant
          </Button>
        </div>
      </div>
      {navigatorOpen && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-overlay" onClick={() => setNavigatorOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-surface border-r border-border shadow-lg flex flex-col">
            <div className="p-3 border-b border-border flex justify-end">
              <Button variant="secondary" onClick={() => setNavigatorOpen(false)} className="h-8 px-3 text-xs">
                Close
              </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <SectionNavigator
                snapshot={snapshot}
                sectionCount={snapshot?.current_section_questions_count ?? 0}
                sectionMax={snapshot?.current_section_max_questions ?? 0}
                problemContext={snapshot?.problem_context ?? null}
                nextSection={nextSection}
                onNextSectionClick={() => {
                  onNextSectionClick();
                  setNavigatorOpen(false);
                }}
                nextSectionDisabled={sending || snapshot?.status === "COMPLETED"}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main: no scroll; only transcript scrolls; composer fixed at bottom */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {mainContent}
      </main>
    </div>
  );
}
