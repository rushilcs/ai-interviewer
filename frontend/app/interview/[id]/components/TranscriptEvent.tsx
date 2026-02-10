"use client";

import ReactMarkdown from "react-markdown";
import type { SnapshotEvent } from "@/lib/useSnapshot";
import { Divider } from "@/components/ui/Divider";

export function TranscriptEvent({ event }: { event: SnapshotEvent }) {
  const t = event.event_type;
  const payload = event.payload ?? {};

  if (t === "PROMPT_PRESENTED") {
    const text = (payload.prompt_text as string) ?? "";
    return (
      <div className="flex justify-start" data-role="interviewer">
        <div className="max-w-[85%] rounded-[10px] border border-border border-l-4 border-l-primary bg-surface2 px-3 py-2 text-sm">
          <span className="text-xs font-medium uppercase text-muted">Interviewer</span>
          <div className="mt-1 text-text prose prose-invert prose-p:my-1 prose-headings:my-2 prose-sm max-w-none">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  if (t === "CANDIDATE_MESSAGE") {
    const text = (payload.text as string) ?? "";
    return (
      <div className="flex justify-end" data-role="candidate">
        <div className="max-w-[85%] rounded-[10px] border border-border bg-surface px-3 py-2 text-sm">
          <span className="text-xs font-medium uppercase text-muted">You</span>
          <div className="mt-1 text-text prose prose-invert prose-p:my-1 prose-sm max-w-none">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  if (t === "SECTION_STARTED" || t === "SECTION_ENDED") {
    const sectionId = (payload.section_id as string) ?? event.section_id ?? "";
    const reason = t === "SECTION_ENDED" ? (payload.reason as string) ?? "" : "";
    return (
      <Divider
        label={t === "SECTION_STARTED" ? `Section: ${sectionId}` : `Section ended: ${reason}`}
      />
    );
  }

  if (t === "CANDIDATE_CODE_SUBMITTED") {
    const code = (payload.code_text as string) ?? "";
    const preview = code.length > 120 ? code.slice(0, 120) + "…" : code;
    return (
      <div className="flex justify-end" data-role="candidate">
        <div className="max-w-[85%] rounded-[10px] border border-border bg-surface px-3 py-2 text-sm">
          <span className="text-xs font-medium uppercase text-muted">You (code)</span>
          <pre className="mt-1 overflow-auto text-xs text-text whitespace-pre-wrap font-mono max-h-[200px]">{preview}</pre>
        </div>
      </div>
    );
  }

  if (t.startsWith("INTERVIEW_")) {
    return <Divider label={t.replace(/_/g, " ")} />;
  }

  return null;
}
