"use client";

import { useState } from "react";

export interface CollapsibleProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Simple collapsible panel. Uses border, surface2, no new colors.
 */
export function Collapsible({
  title,
  children,
  defaultOpen = false,
  className = ""
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`rounded-xl border border-border bg-surface overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-center justify-between text-left text-sm font-medium text-text hover:bg-surface2 transition-colors duration-150"
      >
        <span>{title}</span>
        <span className="text-muted">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="px-4 py-3 pt-0 border-t border-border text-sm text-text whitespace-pre-wrap leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}
