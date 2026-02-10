"use client";

import Link from "next/link";

export interface AppShellProps {
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
  title?: string;
}

export function AppShell({ children, rightSlot, title = "AI Interviewer" }: AppShellProps) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto max-w-[1100px] px-4 py-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/ops/interviews" className="text-lg font-semibold text-text hover:opacity-90">
              {title}
            </Link>
            <nav className="flex gap-2 text-sm">
              <Link
                href="/ops/interviews"
                className="text-muted hover:text-text transition-colors duration-150"
              >
                Interviews
              </Link>
              <Link
                href="/ops/invites"
                className="text-muted hover:text-text transition-colors duration-150"
              >
                Invites
              </Link>
            </nav>
          </div>
          {rightSlot != null && <div className="flex items-center gap-2">{rightSlot}</div>}
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] p-4 md:p-6">{children}</main>
    </div>
  );
}
