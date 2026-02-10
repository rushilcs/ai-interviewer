/**
 * In-memory code drafts keyed by (attempt_id, problem_id, language).
 * Replace with DB persistence when storage is configured.
 */

const store = new Map<string, { code: string; updated_at: string }>();

function key(attemptId: string, problemId: string, language: string): string {
  return `${attemptId}:${problemId}:${language}`;
}

export function getDraft(attemptId: string, problemId: string, language: string): string | null {
  const ent = store.get(key(attemptId, problemId, language));
  return ent?.code ?? null;
}

export function setDraft(attemptId: string, problemId: string, language: string, code: string): void {
  store.set(key(attemptId, problemId, language), {
    code,
    updated_at: new Date().toISOString()
  });
}
