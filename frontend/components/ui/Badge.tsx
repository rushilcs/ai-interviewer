"use client";

type Status =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "TERMINATED"
  | "PAUSED";

const statusClasses: Record<Status, string> = {
  NOT_STARTED: "border-muted text-muted bg-surface2",
  IN_PROGRESS: "border-primary text-primary bg-surface2",
  COMPLETED: "border-success text-success bg-surface2",
  TERMINATED: "border-danger text-danger bg-surface2",
  PAUSED: "border-warning text-warning bg-surface2",
};

export interface BadgeProps {
  status: Status | string;
  className?: string;
}

export function Badge({ status, className = "" }: BadgeProps) {
  const s = status as Status;
  const classes =
    statusClasses[s] ?? "border-muted text-muted bg-surface2";
  return (
    <span
      className={`
        inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium uppercase
        ${classes}
        ${className}
      `}
    >
      {status}
    </span>
  );
}
