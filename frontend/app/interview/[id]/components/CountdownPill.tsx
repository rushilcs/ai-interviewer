"use client";

export function CountdownPill({ remainingSeconds }: { remainingSeconds: number | null }) {
  if (remainingSeconds == null) return <span className="text-muted text-sm">—</span>;
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface2 px-3 py-1 text-sm font-mono text-text">
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}
