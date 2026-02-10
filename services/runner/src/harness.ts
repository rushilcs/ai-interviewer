import * as fs from "fs";
import * as path from "path";
import { PROBLEM_FN } from "./config";
export interface TestCaseDef {
  id: string;
  test_index: number;
  visibility: "public" | "hidden";
  input_json: Record<string, unknown>;
  expected_json: unknown;
  tolerance?: number;
  timeout_ms?: number;
}

const MAX_DISPLAY = 200;

function truncate(s: string, max: number = MAX_DISPLAY): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

export function compareOutput(
  actual: unknown,
  expected: unknown,
  tolerance?: number
): { pass: boolean; actualStr: string; expectedStr: string } {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (tolerance != null && typeof expected === "number" && typeof actual === "number") {
    const pass = Math.abs(actual - expected) <= tolerance;
    return { pass, actualStr: truncate(actualStr), expectedStr: truncate(expectedStr) };
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return { pass: false, actualStr: truncate(actualStr), expectedStr: truncate(expectedStr) };
    for (let i = 0; i < expected.length; i++) {
      if (JSON.stringify(actual[i]) !== JSON.stringify(expected[i])) {
        return { pass: false, actualStr: truncate(actualStr), expectedStr: truncate(expectedStr) };
      }
    }
    return { pass: true, actualStr: truncate(actualStr), expectedStr: truncate(expectedStr) };
  }
  const pass = actualStr === expectedStr;
  return { pass, actualStr: truncate(actualStr), expectedStr: truncate(expectedStr) };
}

export function generatePythonRunner(problemId: string): string {
  const conf = PROBLEM_FN[problemId];
  if (!conf) throw new Error(`Unknown problem: ${problemId}`);
  const args = conf.argKeys.map((k) => `input_json["${k}"]`).join(", ");
  return `
import sys
import json

try:
    import solution
except Exception as e:
    print(json.dumps({"__error": str(e)}), file=sys.stderr)
    sys.exit(1)

input_str = sys.stdin.read()
try:
    input_json = json.loads(input_str)
except Exception as e:
    print(json.dumps({"__error": "Invalid input JSON: " + str(e)}), file=sys.stderr)
    sys.exit(1)

try:
    result = solution.${conf.fn}(${args})
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"__error": str(e)}), file=sys.stderr)
    sys.exit(1)
`.trim();
}

export function writePythonFiles(
  dir: string,
  problemId: string,
  code: string
): void {
  fs.writeFileSync(path.join(dir, "solution.py"), code, "utf8");
  fs.writeFileSync(path.join(dir, "runner.py"), generatePythonRunner(problemId), "utf8");
}

export function getTestInputJson(test: TestCaseDef): string {
  return JSON.stringify(test.input_json);
}
