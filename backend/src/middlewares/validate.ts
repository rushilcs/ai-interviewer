import { type NextFunction, type Request, type Response } from "express";
import type { ZodTypeAny } from "zod";
import { HttpError } from "../utils/httpError";

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(", ");
      next(new HttpError(400, message));
      return;
    }
    req.body = result.data;
    next();
  };
}
