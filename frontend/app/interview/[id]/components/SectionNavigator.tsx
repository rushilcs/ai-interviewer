"use client";

import ReactMarkdown from "react-markdown";
import { Card } from "@/components/ui/Card";

type Section = { id: string; name: string; ended_at?: string };
type SnapshotLike = { sections?: Section[]; current_section?: { id: string } | null };

interface SectionNavigatorProps {
  snapshot: SnapshotLike | null;
  /** Section progress: questions asked in current section (for bar below sections list) */
  sectionCount?: number;
  sectionMax?: number;
  problemContext?: string | null;
  nextSection?: { id: string; name: string } | null;
  onNextSectionClick?: () => void;
  nextSectionDisabled?: boolean;
}

export function SectionNavigator({
  snapshot,
  sectionCount = 0,
  sectionMax = 0,
  problemContext,
  nextSection,
  onNextSectionClick,
  nextSectionDisabled,
}: SectionNavigatorProps) {
  const sections = snapshot?.sections ?? [];
  const currentSectionId = snapshot?.current_section?.id ?? null;

  return (
    <Card className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <h2 className="text-sm font-medium text-muted uppercase">Sections</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <nav className="space-y-1" aria-label="Interview sections">
          {sections.map((sec) => {
            const isCurrent = sec.id === currentSectionId;
            const isDone = !!sec.ended_at;
            const currentIdx = sections.findIndex((s) => s.id === currentSectionId);
            const thisIdx = sections.findIndex((s) => s.id === sec.id);
            const isNext = nextSection && sec.id === nextSection.id && onNextSectionClick;
            const isLocked = !isDone && !isCurrent && thisIdx > currentIdx;

            // Next section (clickable): white text, no box
            if (isNext) {
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={onNextSectionClick}
                  disabled={nextSectionDisabled}
                  className="w-full text-left rounded-md px-2 py-1.5 text-sm text-text font-medium hover:bg-surface2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sec.name} →
                </button>
              );
            }

            // Current: box + blue text. Done: gray + check. Locked: gray. Other: white.
            return (
              <div
                key={sec.id}
                className={`rounded-md px-2 py-1.5 text-sm ${
                  isCurrent
                    ? "border border-primary bg-primary/10 text-primary font-medium"
                    : isDone
                      ? "text-muted"
                      : isLocked
                        ? "text-muted opacity-75"
                        : "text-text"
                }`}
              >
                {sec.name}
                {isDone && <span className="ml-1 text-xs">✓</span>}
              </div>
            );
          })}
        </nav>
        <div className="mt-3 pt-3 border-t border-border">
          <div className="h-1.5 w-full rounded-full bg-surface2 overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{
                width:
                  sectionMax > 0
                    ? `${Math.min(100, (sectionCount / sectionMax) * 100)}%`
                    : "0%"
              }}
            />
          </div>
          <p className="text-xs text-muted mt-1">
            {sectionMax > 0 ? `Questions: ${sectionCount} / ${sectionMax}` : "Section progress"}
          </p>
        </div>

        {problemContext && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted mb-3">Problem context</h3>
            <div className="problem-context text-sm text-text leading-relaxed [&_>*:first-child]:mt-0 [&_p]:my-2 [&_p]:leading-relaxed [&_h1]:font-semibold [&_h1]:text-text [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-base [&_h2]:font-semibold [&_h2]:text-text [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-base [&_h3]:font-semibold [&_h3]:text-text [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:list-outside [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:list-outside [&_li]:my-0.5 [&_li]:pl-0.5 [&_strong]:font-semibold [&_strong]:text-text">
              <ReactMarkdown>{problemContext}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
