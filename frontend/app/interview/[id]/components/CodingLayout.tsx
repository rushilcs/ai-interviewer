"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { SectionNavigator } from "./SectionNavigator";
import { CountdownPill } from "./CountdownPill";
import { Button } from "@/components/ui/Button";
import type { InterviewSnapshot } from "@/lib/useSnapshot";

interface CodingLayoutProps {
  snapshot: InterviewSnapshot | null;
  interviewId: string;
  token: string | null;
  nextSection?: { id: string; name: string } | null;
  onNextSectionClick?: () => void;
}

export function CodingLayout({
  snapshot,
  interviewId,
  token,
  nextSection,
  onNextSectionClick,
}: CodingLayoutProps) {
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const currentSection = snapshot?.current_section;
  const sectionObjective = currentSection?.objective;

  return (
    <div className="h-screen w-full flex flex-col lg:flex-row bg-bg overflow-hidden">
      {/* Left: Navigator (desktop) - unchanged */}
      <aside
        className="hidden lg:flex flex-col w-[280px] flex-shrink-0 border-r border-border bg-surface h-full"
        aria-label="Section navigator"
      >
        <SectionNavigator
          snapshot={snapshot}
          sectionCount={snapshot?.current_section_questions_count ?? 0}
          sectionMax={snapshot?.current_section_max_questions ?? 0}
          problemContext={snapshot?.problem_context ?? null}
          nextSection={nextSection}
          onNextSectionClick={onNextSectionClick}
        />
      </aside>

      {/* Main: header + objective + Begin Coding Assessment button only */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-surface">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setNavigatorOpen(true)}
              className="lg:hidden"
            >
              Sections
            </Button>
            <h1 className="text-lg font-semibold text-text truncate">
              {currentSection?.name ?? "Coding"}
            </h1>
          </div>
          <CountdownPill remainingSeconds={currentSection?.remaining_seconds ?? null} />
        </div>
        {navigatorOpen && (
          <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-overlay" onClick={() => setNavigatorOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-surface border-r border-border shadow-lg flex flex-col">
              <div className="p-3 border-b border-border flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => setNavigatorOpen(false)}>
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
                  onNextSectionClick={onNextSectionClick}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center p-8">
          <div className="max-w-[70ch] w-full space-y-6 text-sm text-left">
            {sectionObjective && (
              <div>
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted mb-3">Objective</h2>
                <div className="objective-content text-sm text-text leading-relaxed [&_>*:first-child]:mt-0 [&_p]:my-2 [&_p]:leading-relaxed [&_h1]:font-semibold [&_h1]:text-text [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-base [&_h2]:font-semibold [&_h2]:text-text [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-base [&_h3]:font-semibold [&_h3]:text-text [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:list-outside [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:list-outside [&_li]:my-0.5 [&_li]:pl-0.5 [&_strong]:font-semibold [&_strong]:text-text">
                  <ReactMarkdown>{sectionObjective}</ReactMarkdown>
                </div>
              </div>
            )}
            <a
              href={`/interview/${interviewId}/coding?token=${encodeURIComponent(token ?? "")}`}
              className="inline-block"
            >
              <Button variant="primary" size="lg">
                Begin Coding Assessment
              </Button>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
