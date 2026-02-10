import type { TestCaseDef } from "./harness";
import { runPython, type RunResult } from "./executor";
import { RUNNER_CONFIG } from "./config";

export type { RunResult, TestResultOut } from "./executor";
export type { TestCaseDef } from "./harness";

export type Language = "python" | "java" | "cpp";

export interface RunOptions {
  problemId: string;
  language: Language;
  code: string;
  tests: TestCaseDef[];
  mode: "run" | "submit";
  tolerance?: number;
}

export function validateCodeSize(code: string): void {
  if (Buffer.byteLength(code, "utf8") > RUNNER_CONFIG.MAX_CODE_BYTES) {
    throw new Error(`Code exceeds maximum size of ${RUNNER_CONFIG.MAX_CODE_BYTES / 1024}KB`);
  }
}

export async function runCode(options: RunOptions): Promise<RunResult> {
  const { problemId, language, code, tests, tolerance } = options;
  validateCodeSize(code);
  if (language === "python") {
    return runPython(problemId, code, tests, { tolerance });
  }
  return {
    results: tests.map((t) => ({
      test_id: t.id,
      test_index: t.test_index,
      pass: false,
      actual: null,
      expected: null,
      runtime_ms: 0,
      error: "Java and C++ are not yet supported. Use Python.",
      timed_out: false
    })),
    summary: { passed: 0, total: tests.length },
    compile_error: "Java and C++ are not yet supported. Use Python."
  };
}
