import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { RUNNER_CONFIG } from "./config";
import { writePythonFiles, getTestInputJson, compareOutput } from "./harness";
import type { TestCaseDef } from "./harness";

export interface TestResultOut {
  test_id: string;
  test_index: number;
  pass: boolean;
  actual: string | null;
  expected: string | null;
  runtime_ms: number;
  error: string | null;
  timed_out?: boolean;
}

export interface RunResult {
  results: TestResultOut[];
  summary: { passed: number; total: number };
  compile_error?: string | null;
}

const SANITIZE_RE = /at line \d+|File "[^"]+"/g;
function sanitizeError(msg: string): string {
  return msg.replace(SANITIZE_RE, "").replace(/\s+/g, " ").trim().slice(0, 500);
}

/** Strip Docker pull/progress output so we don't show it as the run error. */
function stripDockerPullOutput(stderr: string): string {
  if (/Unable to find image|Pulling from|Pulling fs layer|Downloading|Extracting|Pull complete|Already exists|Digest:|Status:/.test(stderr)) {
    const lines = stderr.split("\n").filter((l) => {
      const t = l.trim();
      return t && !/^(Pulling|Downloading|Extracting|Pull complete|Already exists|Digest:|Status:)/.test(t) && !/^[a-f0-9]+: Pulling fs layer/.test(t);
    });
    return lines.join("\n").trim() || "Docker image was pulled on first run. Please run again.";
  }
  return stderr;
}

function runDockerPython(
  workDir: string,
  inputJson: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; code: number; runtime_ms: number; timed_out: boolean }> {
  return new Promise((resolve) => {
    const start = Date.now();
    let timed_out = false;
    const proc = spawn(
      "docker",
      [
        "run",
        "-i",
        "--rm",
        "--network=none",
        "--memory=256m",
        "--memory-swap=256m",
        "--read-only",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "-v", `${workDir}:/workspace:ro`,
        "-w", "/workspace",
        "--name", `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        "python:3.11-slim",
        "timeout", String(Math.ceil(timeoutMs / 1000)),
        "python3", "runner.py"
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const killTimer = setTimeout(() => {
      timed_out = true;
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
    }, timeoutMs + 2000);

    let stdout = "";
    let stderr = "";
    const cap = RUNNER_CONFIG.MAX_OUTPUT_BYTES;
    proc.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
      if (Buffer.byteLength(stdout, "utf8") > cap) stdout = stdout.slice(0, cap) + "\n...[truncated]";
    });
    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (Buffer.byteLength(stderr, "utf8") > cap) stderr = stderr.slice(0, cap) + "\n...[truncated]";
    });
    proc.stdin?.end(inputJson, "utf8");
    proc.on("close", (code, signal) => {
      clearTimeout(killTimer);
      const runtime_ms = Date.now() - start;
      resolve({
        stdout: stdout.trim(),
        stderr: stripDockerPullOutput(stderr.trim()),
        code: code ?? -1,
        runtime_ms,
        timed_out
      });
    });
    proc.on("error", (err) => {
      clearTimeout(killTimer);
      resolve({
        stdout: "",
        stderr: sanitizeError(err.message),
        code: -1,
        runtime_ms: Date.now() - start,
        timed_out: false
      });
    });
  });
}

function parseJsonOutput(stdout: string): { result?: unknown; error?: string } {
  try {
    const line = stdout.split("\n").find((l) => l.trim().startsWith("{") || l.trim().startsWith("[") || /^-?\d/.test(l.trim()));
    if (!line) return { error: "No JSON output" };
    const trimmed = line.trim();
    if (/^-?\d/.test(trimmed) && !trimmed.startsWith("[")) {
      return { result: parseFloat(trimmed) };
    }
    return { result: JSON.parse(trimmed) };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function runPython(
  problemId: string,
  code: string,
  tests: TestCaseDef[],
  options: { tolerance?: number }
): Promise<RunResult> {
  const workDir = path.join(os.tmpdir(), `coding-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  fs.mkdirSync(workDir, { recursive: true });
  try {
    writePythonFiles(workDir, problemId, code);
    const results: TestResultOut[] = [];
    const overallDeadline = Date.now() + RUNNER_CONFIG.OVERALL_TIMEOUT_MS;
    for (const test of tests) {
      if (Date.now() > overallDeadline) {
        results.push({
          test_id: test.id,
          test_index: test.test_index,
          pass: false,
          actual: null,
          expected: null,
          runtime_ms: 0,
          error: "Overall time limit exceeded",
          timed_out: true
        });
        continue;
      }
      const timeoutMs = test.timeout_ms ?? RUNNER_CONFIG.PER_TEST_TIMEOUT_MS;
      const inputJson = getTestInputJson(test);
      const run = await runDockerPython(workDir, inputJson, timeoutMs);
      let pass = false;
      let actual: string | null = null;
      let expected: string | null = null;
      let error: string | null = null;
      if (run.timed_out) {
        error = "Time Limit Exceeded";
      } else if (run.stderr) {
        const parsed = parseJsonOutput(run.stderr);
        if (parsed.result != null && typeof parsed.result === "object" && (parsed.result as { __error?: string }).__error) {
          error = (parsed.result as { __error: string }).__error;
        } else if (parsed.error) {
          error = sanitizeError(run.stderr.slice(0, 500));
        } else {
          error = sanitizeError(run.stderr.slice(0, 500));
        }
      } else {
        const parsed = parseJsonOutput(run.stdout);
        if (parsed.error) {
          error = parsed.error;
        } else {
          const tol = options.tolerance ?? test.tolerance;
          const cmp = compareOutput(parsed.result, test.expected_json, tol);
          pass = cmp.pass;
          actual = cmp.actualStr;
          expected = cmp.expectedStr;
        }
      }
      results.push({
        test_id: test.id,
        test_index: test.test_index,
        pass,
        actual,
        expected,
        runtime_ms: run.runtime_ms,
        error: error || null,
        timed_out: run.timed_out
      });
    }
    const passed = results.filter((r) => r.pass).length;
    return {
      results,
      summary: { passed, total: results.length },
      compile_error: null
    };
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}
