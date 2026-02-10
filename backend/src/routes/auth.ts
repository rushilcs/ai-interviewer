import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { pool } from "../db/pool";
import { requireOpsAuth } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { HttpError } from "../utils/httpError";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: "OPS_ADMIN" | "OPS_REVIEWER";
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const authRouter = Router();

authRouter.post("/login", validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const result = await pool.query<UserRow>(
      `
      SELECT id, email, password_hash, role
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );

    if (result.rowCount !== 1) {
      throw new HttpError(401, "Invalid email or password");
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      throw new HttpError(401, "Invalid email or password");
    }

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role
      },
      env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireOpsAuth, async (req, res, next) => {
  try {
    if (!req.authUser) {
      throw new HttpError(401, "Unauthorized");
    }

    const result = await pool.query<Pick<UserRow, "id" | "email" | "role">>(
      `
      SELECT id, email, role
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.authUser.id]
    );

    if (result.rowCount !== 1) {
      throw new HttpError(401, "Unauthorized");
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
