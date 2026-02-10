"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { talentFetch, type ApiError } from "@/lib/api";

type SessionResponse = {
  interview_id: string;
  schema_version: string;
  role_name: string;
  status: string;
  sections: { id: string; name: string; duration_seconds: number }[];
};

function InterviewSessionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid or expired token");
      return;
    }
    let cancelled = false;
    talentFetch<SessionResponse>("/api/talent/session", token)
      .then((data) => {
        if (!cancelled) {
          setSession(data);
          setError(null);
        }
      })
      .catch((err: ApiError) => {
        if (!cancelled) {
          setError(err.message ?? "Invalid or expired token");
          setSession(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleStart() {
    if (!session?.interview_id || !token) return;
    setStarting(true);
    try {
      await talentFetch(`/api/talent/interviews/${session.interview_id}/start`, token, {
        method: "POST",
        body: {},
      });
      router.replace(`/interview/${session.interview_id}?token=${encodeURIComponent(token)}`);
    } catch (err) {
      setError((err as ApiError).message ?? "Failed to start");
    } finally {
      setStarting(false);
    }
  }

  if (error && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-danger">{error}</p>
            <p className="text-muted text-sm mt-2">Invalid or expired token</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Interview Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!session ? (
            <p className="text-muted text-sm">Loading…</p>
          ) : (
            <>
              <div>
                <p className="text-sm text-muted">Role</p>
                <p className="font-medium text-text">{session.role_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted">Schema version</p>
                <p className="font-mono text-sm text-text">{session.schema_version}</p>
              </div>
              <div>
                <p className="text-sm text-muted mb-2">Sections</p>
                <ul className="list-none space-y-1">
                  {session.sections?.map((s) => (
                    <li
                      key={s.id}
                      className="flex justify-between text-sm border-b border-border py-2"
                    >
                      <span className="text-text">{s.name}</span>
                      <span className="text-muted">{s.duration_seconds}s</span>
                    </li>
                  ))}
                </ul>
              </div>
              {session.status === "NOT_STARTED" && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={handleStart}
                  disabled={starting}
                >
                  {starting ? "Starting…" : "Start"}
                </Button>
              )}
              {session.status !== "NOT_STARTED" && (
                <p className="text-muted text-sm">
                  This interview has already been started.{" "}
                  <a
                    href={`/interview/${session.interview_id}?token=${encodeURIComponent(token!)}`}
                    className="text-primary hover:underline"
                  >
                    Continue to interview
                  </a>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function InterviewSessionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
        <Card className="w-full max-w-xl">
          <CardContent className="p-6 text-center">
            <p className="text-muted text-sm">Loading…</p>
          </CardContent>
        </Card>
      </div>
    }>
      <InterviewSessionContent />
    </Suspense>
  );
}
