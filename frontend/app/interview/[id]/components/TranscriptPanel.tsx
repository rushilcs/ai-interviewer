"use client";

import { useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { SnapshotEvent } from "@/lib/useSnapshot";
import { TranscriptEvent } from "./TranscriptEvent";

interface TranscriptPanelProps {
  events: SnapshotEvent[];
  isOpen: boolean;
  onToggle: () => void;
  loading?: boolean;
  /** When section is complete and next is unlocked, show this as an interviewer message in the chat */
  sectionCompleteMessage?: string | null;
}

/** Interviewer does not handle the coding section; hide any PROMPT_PRESENTED for section_coding. */
function isCodingSectionPrompt(ev: SnapshotEvent): boolean {
  if (ev.event_type !== "PROMPT_PRESENTED") return false;
  const sectionId = (ev.payload?.section_id as string) ?? ev.section_id ?? "";
  return sectionId === "section_coding";
}

export function TranscriptPanel({ events, isOpen, onToggle, loading, sectionCompleteMessage }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasCompleteMessage = !!sectionCompleteMessage;
  const filteredEvents = useMemo(
    () => events.filter((ev) => !isCodingSectionPrompt(ev)),
    [events]
  );

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEvents.length, isOpen, hasCompleteMessage]);

  return (
    <div className="flex-1 min-h-0 flex flex-col border-t border-border bg-surface2/30 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex-shrink-0 w-full px-4 py-2.5 flex items-center justify-between text-left text-sm font-medium text-muted hover:bg-surface2/50 transition-colors"
        aria-expanded={isOpen}
      >
        <span>Transcript ({filteredEvents.length + (hasCompleteMessage ? 1 : 0)})</span>
        <span className="text-muted">{isOpen ? "▼" : "▶"}</span>
      </button>
      {isOpen && (
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 border-t border-border"
        >
          {filteredEvents.length === 0 && !loading && !hasCompleteMessage && (
            <p className="text-muted text-sm">No messages yet.</p>
          )}
          {filteredEvents.map((ev) => (
            <TranscriptEvent key={ev.seq} event={ev} />
          ))}
          {sectionCompleteMessage && (
            <div className="flex justify-start" data-role="interviewer">
              <div className="max-w-[85%] rounded-[10px] border border-border border-l-4 border-l-primary bg-surface2 px-3 py-2 text-sm">
                <span className="text-xs font-medium uppercase text-muted">Interviewer</span>
                <div className="mt-1 text-text prose prose-invert prose-p:my-1 prose-headings:my-2 prose-sm max-w-none">
                  <ReactMarkdown>{sectionCompleteMessage}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
