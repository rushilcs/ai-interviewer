"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, THead, TRow, TH, TD } from "@/components/ui/Table";
import { CopyButton } from "@/components/ui/CopyButton";
import { formatDateTime, truncateId } from "@/lib/format";
import { opsFetch, type ApiError } from "@/lib/api";

type InterviewRow = {
  id: string;
  role_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
};

type ListResponse = { interviews: InterviewRow[] };

export default function OpsInterviewsPage() {
  const router = useRouter();
  const [list, setList] = useState<InterviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function handleLogout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("ops_jwt");
    }
    router.replace("/ops/login");
  }

  async function load() {
    const jwt = typeof window !== "undefined" ? localStorage.getItem("ops_jwt") : null;
    if (!jwt) {
      router.replace("/ops/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await opsFetch<ListResponse>("/api/ops/interviews");
      setList(data.interviews ?? []);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        if (typeof window !== "undefined") localStorage.removeItem("ops_jwt");
        router.replace("/ops/login");
        return;
      }
      setError(e.message ?? "Failed to load interviews");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AppShell
      rightSlot={
        <Button variant="ghost" onClick={handleLogout}>
          Logout
        </Button>
      }
    >
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-xl font-semibold text-text">Interviews</h1>
        <Button variant="secondary" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-[10px] border border-danger bg-surface2 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TRow>
                <TH className="font-mono">Interview ID</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Started</TH>
                <TH>Completed</TH>
                <TH></TH>
              </TRow>
            </THead>
            <tbody>
              {list.map((row) => (
                <TRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/ops/interviews/${row.id}`)}
                >
                  <TD className="font-mono text-xs">
                    <span className="flex items-center gap-2">
                      {truncateId(row.id)}
                      <CopyButton text={row.id} label="Copy" />
                    </span>
                  </TD>
                  <TD>{row.role_name}</TD>
                  <TD>
                    <Badge status={row.status} />
                  </TD>
                  <TD className="text-muted text-sm">{formatDateTime(row.started_at)}</TD>
                  <TD className="text-muted text-sm">{formatDateTime(row.completed_at)}</TD>
                  <TD>
                    <Link href={`/ops/interviews/${row.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                  </TD>
                </TRow>
              ))}
            </tbody>
          </Table>
          {list.length === 0 && (
            <div className="p-8 text-center text-muted text-sm">No interviews yet.</div>
          )}
        </Card>
      )}
    </AppShell>
  );
}
