"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

interface ContextDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  problemContext: string | undefined;
  sectionObjective: string | undefined;
  sectionId: string | undefined;
  sectionName: string;
  hasSeenObjective: boolean;
  onDismissObjective: () => void;
}

export function ContextDrawer({
  isOpen,
  onToggle,
  problemContext,
  sectionObjective,
  sectionId,
  sectionName,
  hasSeenObjective,
  onDismissObjective,
}: ContextDrawerProps) {
  const [showObjectiveExpanded, setShowObjectiveExpanded] = useState(false);

  const showObjectiveBanner = sectionId && sectionObjective && !hasSeenObjective;

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-3 py-2 text-sm font-medium text-muted hover:text-text hover:bg-surface2/50 transition-colors border-t border-border"
      >
        {isOpen ? "Hide problem context" : "View problem context"}
      </button>
      {isOpen && (
        <div className="max-h-[40vh] overflow-y-auto border-t border-border bg-surface2/30">
          <div className="p-4 space-y-4 text-sm">
            {showObjectiveBanner && !showObjectiveExpanded && (
              <div className="rounded-xl border border-primary/40 bg-surface2 p-4">
                <h3 className="text-xs font-medium uppercase text-muted mb-2">
                  {sectionName} — Objective
                </h3>
                <div className="text-text prose prose-invert prose-p:my-1 prose-headings:my-2 prose-sm max-w-none mb-3">
                  <ReactMarkdown>{sectionObjective}</ReactMarkdown>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onDismissObjective();
                    setShowObjectiveExpanded(false);
                  }}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Got it
                </button>
              </div>
            )}
            {hasSeenObjective && sectionObjective && (
              <div>
                {showObjectiveExpanded ? (
                  <div className="rounded-xl border border-border bg-surface2 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-medium uppercase text-muted">Objective</h3>
                      <button
                        type="button"
                        onClick={() => setShowObjectiveExpanded(false)}
                        className="text-xs text-muted hover:text-text"
                      >
                        Collapse
                      </button>
                    </div>
                    <div className="text-text prose prose-invert prose-p:my-1 prose-sm max-w-none">
                      <ReactMarkdown>{sectionObjective}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowObjectiveExpanded(true)}
                    className="text-sm text-muted hover:text-primary"
                  >
                    Objective (view)
                  </button>
                )}
              </div>
            )}
            {problemContext && (
              <div>
                <h3 className="text-xs font-medium uppercase text-muted mb-2">
                  Problem context
                </h3>
                <div className="text-text prose prose-invert prose-p:my-1 prose-headings:my-2 prose-sm max-w-none">
                  <ReactMarkdown>{problemContext}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
