import { type NextFunction, type Request, type Response } from "express";
import { pool } from "../db/pool";
import { HttpError } from "../utils/httpError";

type InviteRow = {
  id: string;
  role_id: string;
  token: string;
  expires_at: Date | null;
  max_starts: number;
  starts_used: number;
  revoked_at: Date | null;
};

/**
 * Resolve invite token from query param `token` or header `X-Invite-Token`.
 * Talent endpoints: use ?token=... for GET (e.g. session link) and X-Invite-Token for others.
 */
function getTokenFromRequest(req: Request): string | null {
  const query = (req.query.token as string) ?? null;
  const header = (req.headers["x-invite-token"] as string) ?? null;
  return query ?? header ?? null;
}

/**
 * Require valid invite token. Validates: exists, not revoked, not expired, starts_used < max_starts.
 * Sets req.invite. Use for GET /api/talent/session.
 */
export async function requireTalentToken(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token || token.trim() === "") {
    next(new HttpError(401, "Missing invite token"));
    return;
  }

  const result = await pool.query<InviteRow>(
    `SELECT id, role_id, token, expires_at, max_starts, starts_used, revoked_at
     FROM interview_invites WHERE token = $1`,
    [token]
  );
  if (result.rowCount !== 1) {
    next(new HttpError(401, "Invalid invite token"));
    return;
  }

  const invite = result.rows[0];
  if (invite.revoked_at != null) {
    next(new HttpError(403, "Invite has been revoked"));
    return;
  }
  if (invite.expires_at != null && new Date(invite.expires_at) < new Date()) {
    next(new HttpError(403, "Invite has expired"));
    return;
  }
  // starts_used < max_starts is enforced only in POST /start when actually starting

  req.invite = {
    id: invite.id,
    role_id: invite.role_id,
    token: invite.token,
    expires_at: invite.expires_at ? new Date(invite.expires_at).toISOString() : null,
    max_starts: invite.max_starts,
    starts_used: invite.starts_used,
    revoked_at: invite.revoked_at ? new Date(invite.revoked_at).toISOString() : null
  };
  next();
}

/**
 * Require talent token and that the interview belongs to this invite (interview.invite_id = invite.id).
 * Sets req.invite and req.talentInterview. Use for /api/talent/interviews/:interview_id/*.
 */
export async function requireTalentTokenAndInterview(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token || token.trim() === "") {
    next(new HttpError(401, "Missing invite token"));
    return;
  }

  const inviteResult = await pool.query<InviteRow>(
    `SELECT id, role_id, token, expires_at, max_starts, starts_used, revoked_at
     FROM interview_invites WHERE token = $1`,
    [token]
  );
  if (inviteResult.rowCount !== 1) {
    next(new HttpError(401, "Invalid invite token"));
    return;
  }

  const invite = inviteResult.rows[0];
  if (invite.revoked_at != null) {
    next(new HttpError(403, "Invite has been revoked"));
    return;
  }
  if (invite.expires_at != null && new Date(invite.expires_at) < new Date()) {
    next(new HttpError(403, "Invite has expired"));
    return;
  }

  const interviewId = req.params.interview_id;
  if (!interviewId) {
    next(new HttpError(400, "Missing interview_id"));
    return;
  }

  const interviewResult = await pool.query<{ id: string; invite_id: string | null; status: string; schema_version: string }>(
    `SELECT id, invite_id, status, schema_version FROM interviews WHERE id = $1`,
    [interviewId]
  );
  if (interviewResult.rowCount !== 1) {
    next(new HttpError(404, "Interview not found"));
    return;
  }

  const interview = interviewResult.rows[0];
  if (interview.invite_id !== invite.id) {
    next(new HttpError(403, "This invite does not have access to this interview"));
    return;
  }

  req.invite = {
    id: invite.id,
    role_id: invite.role_id,
    token: invite.token,
    expires_at: invite.expires_at ? new Date(invite.expires_at).toISOString() : null,
    max_starts: invite.max_starts,
    starts_used: invite.starts_used,
    revoked_at: invite.revoked_at ? new Date(invite.revoked_at).toISOString() : null
  };
  req.talentInterview = {
    id: interview.id,
    invite_id: interview.invite_id,
    status: interview.status,
    schema_version: interview.schema_version
  };
  next();
}
