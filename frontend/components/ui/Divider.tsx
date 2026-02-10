"use client";

export interface DividerProps {
  label?: string;
  className?: string;
}

export function Divider({ label, className = "" }: DividerProps) {
  return (
    <div className={`flex items-center gap-3 py-2 ${className}`}>
      <div className="flex-1 h-px bg-border" />
      {label && (
        <span className="text-xs text-muted font-medium uppercase shrink-0">
          {label}
        </span>
      )}
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
