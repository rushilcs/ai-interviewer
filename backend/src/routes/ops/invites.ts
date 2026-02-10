import { Router } from "express";
import crypto from "node:crypto";
import { pool } from "../../db/pool";
import { requireOpsAuth } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validate";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import { z } from "zod";

function isPgFkError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23503";
}

export const invitesRouter = Router();

const createInviteSchema = z.object({
  role_id: z.string().uuid(),
  candidate_email: z.string().email().optional().nullable(),
  expires_at: z.string().optional().nullable()
});

invitesRouter.post("/", requireOpsAuth, validateBody(createInviteSchema), async (req, res, next) => {
  try {
    const { role_id, candidate_email, expires_at } = req.body as z.infer<typeof createInviteSchema>;
    if (!req.authUser) throw new HttpError(401, "Unauthorized");

    const token = crypto.randomBytes(32).toString("hex");
    const result = await pool.query<{ id: string }>(
      `INSERT INTO interview_invites (role_id, candidate_email, token, expires_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [role_id, candidate_email ?? null, token, expires_at ?? null, req.authUser.id]
    );
    const invite_id = result.rows[0].id;
    const invite_url = `${env.INVITE_BASE_URL.replace(/\/$/, "")}/interview?token=${token}`;
    res.status(201).json({ invite_id, token, invite_url });
  } catch (e) {
    if (isPgFkError(e)) {
      next(new HttpError(401, "Session expired or invalid. Please log in again."));
      return;
    }
    next(e);
  }
});

invitesRouter.get("/", requireOpsAuth, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, role_id, candidate_email, expires_at, max_starts, starts_used, created_at, revoked_at
       FROM interview_invites ORDER BY created_at DESC`
    );
    res.json({ invites: result.rows });
  } catch (e) {
    next(e);
  }
});

invitesRouter.post("/:invite_id/revoke", requireOpsAuth, async (req, res, next) => {
  try {
    const { invite_id } = req.params;
    const result = await pool.query(
      `UPDATE interview_invites SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
      [invite_id]
    );
    if (result.rowCount !== 1) {
      throw new HttpError(404, "Invite not found or already revoked");
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
