/**
 * Coding environment API: problems, drafts, run, submit.
 * All routes require talent token and interview (interview_id in path).
 */

import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../../utils/httpError";
import { validateBody } from "../../middlewares/validate";
import { getProblem, getProblemSummaries } from "../../coding/problems";
import { getDraft, setDraft } from "../../coding/drafts";
import { addSubmission, hasSubmitted } from "../../coding/submissions";
import { checkRateLimit } from "../../coding/rateLimit";
import { runCode, validateCodeSize } from "../../../../services/runner/src/index";

const codingRouter = Router();

const draftSchema = z.object({
  problem_id: z.string().min(1),
  language: z.enum(["python", "java", "cpp"]),
  code: z.string()
});

const runSubmitSchema = z.object({
  problem_id: z.string().min(1),
  language: z.enum(["python", "java", "cpp"]),
  code: z.string()
});

// GET /api/talent/interviews/:interview_id/coding/problems
codingRouter.get("/problems", (_req, res, next) => {
  try {
    const summaries = getProblemSummaries();
    res.json({ problems: summaries });
  } catch (e) {
    next(e);
  }
});

// GET /api/talent/interviews/:interview_id/coding/draft?problem_id=...&language=...
codingRouter.get("/draft", (req, res, next) => {
  try {
    const interviewId = req.talentInterview!.id;
    const problem_id = req.query.problem_id as string;
    const language = req.query.language as string;
    if (!problem_id || !language) {
      throw new HttpError(400, "problem_id and language are required");
    }
    const code = getDraft(interviewId, problem_id, language);
    res.json({ code: code ?? "" });
  } catch (e) {
    next(e);
  }
});

// PUT /api/talent/interviews/:interview_id/coding/draft
codingRouter.put("/draft", validateBody(draftSchema), (req, res, next) => {
  try {
    const interviewId = req.talentInterview!.id;
    const { problem_id, language, code } = req.body as z.infer<typeof draftSchema>;
    if (hasSubmitted(interviewId, problem_id)) {
      throw new HttpError(400, "Code is locked; this problem has already been submitted.");
    }
    try {
      validateCodeSize(code);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : "Code too long");
    }
    setDraft(interviewId, problem_id, language, code);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/talent/interviews/:interview_id/coding/run
codingRouter.post("/run", validateBody(runSubmitSchema), async (req, res, next) => {
  try {
    const inviteId = req.invite!.id;
    const { problem_id, language, code } = req.body as z.infer<typeof runSubmitSchema>;

    const rl = checkRateLimit(`coding:${inviteId}`);
    if (!rl.allowed) {
      throw new HttpError(429, `Rate limit exceeded. Try again in ${rl.retryAfterSeconds ?? 60} seconds.`);
    }

    const problem = getProblem(problem_id);
    if (!problem) throw new HttpError(404, "Problem not found");

    const publicTests = problem.tests.filter((t) => t.visibility === "public");
    const result = await runCode({
      problemId: problem_id,
      language,
      code,
      tests: publicTests,
      mode: "run",
      tolerance: problem.compare_tolerance
    });

    res.json({
      run_id: `run-${Date.now()}`,
      results: result.results,
      summary: result.summary,
      compile_error: result.compile_error ?? undefined
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/talent/interviews/:interview_id/coding/submit
codingRouter.post("/submit", validateBody(runSubmitSchema), async (req, res, next) => {
  try {
    const inviteId = req.invite!.id;
    const interviewId = req.talentInterview!.id;
    const { problem_id, language, code } = req.body as z.infer<typeof runSubmitSchema>;

    if (hasSubmitted(interviewId, problem_id)) {
      throw new HttpError(400, "This problem has already been submitted. You cannot submit again.");
    }

    const rl = checkRateLimit(`coding:${inviteId}`);
    if (!rl.allowed) {
      throw new HttpError(429, `Rate limit exceeded. Try again in ${rl.retryAfterSeconds ?? 60} seconds.`);
    }

    const problem = getProblem(problem_id);
    if (!problem) throw new HttpError(404, "Problem not found");

    const result = await runCode({
      problemId: problem_id,
      language,
      code,
      tests: problem.tests,
      mode: "submit",
      tolerance: problem.compare_tolerance
    });

    addSubmission(interviewId, problem_id);

    const { passed, total } = result.summary;
    let status: "accepted" | "partial" | "failed" = "failed";
    if (passed === total && total > 0) status = "accepted";
    else if (passed > 0) status = "partial";

    res.json({
      submission_id: `sub-${Date.now()}`,
      summary: { passed, total, status },
      compile_error: result.compile_error ?? undefined
    });
  } catch (e) {
    next(e);
  }
});

export { codingRouter };
