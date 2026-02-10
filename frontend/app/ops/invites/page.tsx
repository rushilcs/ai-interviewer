"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { Banner } from "@/components/ui/Banner";
import { formatDateTime, truncateId } from "@/lib/format";
import { opsFetch, type ApiError } from "@/lib/api";

type Role = { id: string; name: string; schema_version: string };
type InviteRow = {
  id: string;
  role_id: string;
  candidate_email: string | null;
  expires_at: string | null;
  max_starts: number;
  starts_used: number;
  created_at: string;
  revoked_at: string | null;
};

export default function OpsInvitesPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [createdLink, setCreatedLink] = useState<{ invite_url: string; token: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLogout() {
    if (typeof window !== "undefined") localStorage.removeItem("ops_jwt");
    router.replace("/ops/login");
  }

  async function loadRoles() {
    try {
      const data = await opsFetch<{ roles: Role[] }>("/api/roles");
      setRoles(data.roles ?? []);
      if (data.roles?.length && !selectedRoleId) {
        setSelectedRoleId(data.roles[0].id);
      }
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        if (typeof window !== "undefined") localStorage.removeItem("ops_jwt");
        router.replace("/ops/login");
        return;
      }
      setError(e.message ?? "Failed to load roles");
    }
  }

  async function loadInvites() {
    try {
      const data = await opsFetch<{ invites: InviteRow[] }>("/api/interview-invites");
      setInvites(data.invites ?? []);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        if (typeof window !== "undefined") localStorage.removeItem("ops_jwt");
        router.replace("/ops/login");
        return;
      }
    }
  }

  useEffect(() => {
    const jwt = typeof window !== "undefined" ? localStorage.getItem("ops_jwt") : null;
    if (!jwt) {
      router.replace("/ops/login");
      return;
    }
    setLoading(true);
    Promise.all([loadRoles(), loadInvites()]).finally(() => setLoading(false));
  }, []);

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoleId) return;
    setCreating(true);
    setError(null);
    setCreatedLink(null);
    try {
      const data = await opsFetch<{ invite_id: string; token: string; invite_url: string }>(
        "/api/interview-invites",
        {
          method: "POST",
          body: {
            role_id: selectedRoleId,
            candidate_email: candidateEmail.trim() || null,
            expires_at: null,
          },
        }
      );
      setCreatedLink({ invite_url: data.invite_url, token: data.token });
      await loadInvites();
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        if (typeof window !== "undefined") localStorage.removeItem("ops_jwt");
        router.replace("/ops/login");
        return;
      }
      setError(e.message ?? "Failed to create invite");
    } finally {
      setCreating(false);
    }
  }

  function openAsCandidate() {
    if (!createdLink) return;
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/interview?token=${encodeURIComponent(createdLink.token)}`
        : createdLink.invite_url;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const roleNameById = Object.fromEntries(roles.map((r) => [r.id, r.name]));

  return (
    <AppShell rightSlot={<Button variant="ghost" onClick={handleLogout}>Logout</Button>}>
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-xl font-semibold text-text">Invites</h1>
      </div>

      {error && (
        <Banner variant="error" className="mb-4">
          {error}
        </Banner>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <h2 className="text-base font-semibold text-text mb-4">Create invite</h2>
          <form onSubmit={handleCreateInvite} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Role</label>
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="h-10 w-full rounded-[10px] bg-surface2 border border-border px-3 text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Candidate email (optional)
              </label>
              <Input
                type="email"
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                placeholder="candidate@example.com"
              />
            </div>
            <Button type="submit" variant="primary" disabled={creating || !selectedRoleId}>
              {creating ? "Creating…" : "Create invite"}
            </Button>
          </form>

          {createdLink && (
            <div className="mt-6 pt-4 border-t border-border space-y-3">
              <p className="text-sm font-medium text-muted">Invite link (share with candidate)</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-0 text-xs text-text bg-surface2 border border-border rounded-[10px] px-3 py-2 break-all font-mono">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/interview?token=${createdLink.token.slice(0, 12)}…`
                    : createdLink.invite_url}
                </code>
                <CopyButton
                  text={
                    typeof window !== "undefined"
                      ? `${window.location.origin}/interview?token=${encodeURIComponent(createdLink.token)}`
                      : createdLink.invite_url
                  }
                  label="Copy link"
                />
              </div>
              <Button variant="secondary" onClick={openAsCandidate}>
                Open as candidate
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-base font-semibold text-text mb-4">Recent invites</h2>
          {loading ? (
            <p className="text-muted text-sm">Loading…</p>
          ) : invites.length === 0 ? (
            <p className="text-muted text-sm">No invites yet.</p>
          ) : (
            <ul className="space-y-2">
              {invites.slice(0, 10).map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border text-sm"
                >
                  <span className="font-mono text-muted">{truncateId(inv.id)}</span>
                  <span className="text-text">{roleNameById[inv.role_id] ?? inv.role_id}</span>
                  <span className="text-muted">{formatDateTime(inv.created_at)}</span>
                  <span className="text-muted">
                    {inv.starts_used}/{inv.max_starts} starts
                  </span>
                  {inv.revoked_at && (
                    <span className="text-danger text-xs uppercase">Revoked</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
