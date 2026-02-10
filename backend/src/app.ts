import express from "express";
import { authRouter } from "./routes/auth";
import { rolesRouter } from "./routes/roles";
import { invitesRouter } from "./routes/ops/invites";
import { opsInterviewsRouter } from "./routes/ops/interviews";
import { talentRouter } from "./routes/talent";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";

const ALLOWED_ORIGINS = (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (ALLOWED_ORIGINS.includes(origin) || origin === "http://localhost:3000")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Invite-Token");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/roles", rolesRouter);
  app.use("/api/interview-invites", invitesRouter);
  app.use("/api/ops/interviews", opsInterviewsRouter);
  app.use("/api/talent", talentRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
