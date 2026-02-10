import { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { HttpError } from "../utils/httpError";

type AuthTokenPayload = JwtPayload & {
  sub: string;
  email: string;
  role: "OPS_ADMIN" | "OPS_REVIEWER";
};

export function requireOpsAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next(new HttpError(401, "Missing bearer token"));
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    req.authUser = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role
    };
    next();
  } catch {
    next(new HttpError(401, "Invalid token"));
  }
}
