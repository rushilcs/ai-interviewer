"use client";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

interface ResponseComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  disabled: boolean;
  assistantMode?: boolean;
  onOpenAssistant?: () => void;
}

export function ResponseComposer({
  value,
  onChange,
  onSend,
  sending,
  disabled,
  assistantMode,
  onOpenAssistant,
}: ResponseComposerProps) {
  return (
    <div className="flex flex-col gap-2 p-4 border-t border-border bg-surface flex-shrink-0">
      {assistantMode && onOpenAssistant && (
        <p className="text-xs text-muted">
          Need help?{" "}
          <button
            type="button"
            onClick={onOpenAssistant}
            className="text-primary hover:underline"
          >
            Assistant (concepts only)
          </button>
        </p>
      )}
      <div className="flex gap-2 items-end">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your response…"
          className="min-h-[80px] flex-1"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <Button
          variant="primary"
          onClick={onSend}
          disabled={sending || !value.trim() || disabled}
          className="flex-shrink-0"
        >
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
