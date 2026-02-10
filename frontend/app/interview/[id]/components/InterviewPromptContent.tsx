"use client";

import ReactMarkdown from "react-markdown";

/**
 * Splits prompt text into primary (first sentence) and supporting (rest).
 * Sentence boundaries: . ? ! followed by space or end of string.
 * Multiple questions (e.g. "What X? How Y?") become primary + supporting lines.
 */
function parsePromptStructure(raw: string): { primary: string; supporting: string[] } {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { primary: "", supporting: [] };

  // Split on sentence boundaries: . ? ! followed by space or end
  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return { primary: trimmed, supporting: [] };
  if (sentences.length === 1) return { primary: sentences[0], supporting: [] };

  const primary = sentences[0];
  const supporting = sentences.slice(1);
  return { primary, supporting };
}

export interface InterviewPromptContentProps {
  /** Raw prompt text (will be parsed into primary + supporting) */
  promptText: string;
  /** Section label shown above the prompt (e.g. "Problem Framing & Success Definition") */
  sectionName: string;
}

export function InterviewPromptContent({ promptText, sectionName }: InterviewPromptContentProps) {
  const { primary, supporting } = parsePromptStructure(promptText || "No question yet.");
  const hasContent = primary || supporting.length > 0;

  return (
    <div className="max-w-[70ch] mx-auto text-left">
      {/* Section Label — small, muted */}
      <p className="text-xs font-medium uppercase tracking-wide text-muted mb-3">
        {sectionName}
      </p>

      {/* Primary Question — large, high-contrast */}
      {primary && (
        <div className="text-lg md:text-xl font-semibold text-text leading-relaxed mb-4 prose prose-invert prose-p:my-0 prose-p:leading-relaxed max-w-none">
          <ReactMarkdown>{primary}</ReactMarkdown>
        </div>
      )}

      {/* Supporting Guidance — secondary, spaced */}
      {supporting.length > 0 && (
        <div className="space-y-2 text-base text-muted leading-relaxed prose prose-invert prose-p:my-0 prose-p:leading-relaxed max-w-none">
          {supporting.map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted select-none flex-shrink-0">•</span>
              <div className="flex-1 min-w-0">
                <ReactMarkdown>{line}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}

      {!hasContent && (
        <p className="text-base text-muted">No question yet.</p>
      )}
    </div>
  );
}
