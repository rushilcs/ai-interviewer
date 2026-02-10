import { Router } from "express";
import { pool } from "../db/pool";
import { requireOpsAuth } from "../middlewares/auth";

export const rolesRouter = Router();

rolesRouter.get("/", requireOpsAuth, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, schema_version, is_active, created_at, updated_at FROM roles ORDER BY name`
    );
    res.json({ roles: result.rows });
  } catch (e) {
    next(e);
  }
});
