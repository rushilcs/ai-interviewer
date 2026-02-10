/**
 * Shared types for coding environment (run/submit, problems, results).
 * Used by frontend and backend; hidden test data is never in these types on the wire.
 */

export type Language = "python" | "java" | "cpp";

export interface CodingRunRequest {
  attempt_id: string;
  problem_id: string;
  language: Language;
  code: string;
}

export interface CodingSubmitRequest {
  attempt_id: string;
  problem_id: string;
  language: Language;
  code: string;
}

/** Per-test result for RUN (public tests only); expected/actual may be truncated in UI. */
export interface TestResult {
  test_id: string;
  test_index: number;
  pass: boolean;
  actual: string | null;
  expected: string | null;
  runtime_ms: number;
  error: string | null;
  timed_out?: boolean;
}

export interface CodingRunResponse {
  run_id: string;
  results: TestResult[];
  summary: { passed: number; total: number };
  compile_error?: string | null;
}

export interface CodingSubmitResponse {
  submission_id: string;
  summary: { passed: number; total: number; status: "accepted" | "partial" | "failed" };
  compile_error?: string | null;
}

/** Public test case (input + expected) for display in UI. */
export interface PublicTestCase {
  test_index: number;
  input_json: Record<string, unknown>;
  expected_display: string;
}

/** Problem summary for list/detail; no hidden tests. */
export interface ProblemSummary {
  id: string;
  title: string;
  statement_md: string;
  constraints_md: string;
  examples: PublicTestCase[];
  signatures: Record<Language, string>;
  template_by_language: Record<Language, string>;
}

/** Full test case (server-side only); visibility and expected for comparison. */
export interface TestCaseDef {
  id: string;
  test_index: number;
  visibility: "public" | "hidden";
  input_json: Record<string, unknown>;
  expected_json: unknown;
  tolerance?: number;
  timeout_ms?: number;
}
