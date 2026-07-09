import { buildHarness } from "./harness.js";
import { runLocal } from "./localRunner.js";
import { runDocker, DOCKER_IMAGE } from "./dockerRunner.js";
import { spawnCapture } from "./spawnCapture.js";

// Container startup isn't the player's fault; give docker runs extra headroom.
const DOCKER_STARTUP_GRACE_MS = 5000;

let runnerMode = null; // "docker" | "local" | "none"
let pythonCommand = "python";
let detectPromise = null;

export function currentRunnerMode() {
  return runnerMode ?? "detecting";
}

// Picks the best available runner once per process:
// docker (daemon up, image present or pullable) → host python → none.
export function detectRunner() {
  if (!detectPromise) {
    detectPromise = (async () => {
      if (await dockerReady()) {
        runnerMode = "docker";
        console.log(`[execution] using Docker sandbox (${DOCKER_IMAGE})`);
      } else if (await pythonReady()) {
        runnerMode = "local";
        console.warn(
          "[execution] Docker unavailable — falling back to host Python subprocess. " +
            "Fine for local play; start Docker Desktop to get container isolation."
        );
      } else {
        runnerMode = "none";
        console.error("[execution] no Python runtime found (need Docker or a python install)");
      }
      return runnerMode;
    })();
  }
  return detectPromise;
}

async function dockerReady() {
  const info = await spawnCapture("docker", ["info", "--format", "{{.ServerVersion}}"], {
    timeoutMs: 5000
  });
  if (info.code !== 0 || info.timedOut) return false;

  const inspect = await spawnCapture("docker", ["image", "inspect", DOCKER_IMAGE], {
    timeoutMs: 10000
  });
  if (inspect.code === 0) return true;

  console.log(`[execution] pulling ${DOCKER_IMAGE} (first run only)...`);
  const pull = await spawnCapture("docker", ["pull", DOCKER_IMAGE], { timeoutMs: 180000 });
  return pull.code === 0;
}

async function pythonReady() {
  for (const cmd of ["python", "py"]) {
    const check = await spawnCapture(cmd, ["--version"], { timeoutMs: 5000 });
    if (check.code === 0) {
      pythonCommand = cmd;
      return true;
    }
  }
  return false;
}

// Runs player code against a problem's tests and returns an evaluation:
// { verdict, passed, total, execTimeMs, memoryKb, tests[], error }
// verdict: "pass" | "partial" | "fail" | "timeout" | "error"
export async function runPython({ code, functionName, tests, timeoutMs = 10000 }) {
  await detectRunner();
  if (runnerMode === "none") {
    return failure("error", tests.length, "No Python runtime available on the server");
  }

  const { source, token } = buildHarness({ code, functionName, tests });
  let raw;
  if (runnerMode === "docker") {
    raw = await runDocker({ source, timeoutMs: timeoutMs + DOCKER_STARTUP_GRACE_MS });
    if (looksLikeDockerFailure(raw, token)) {
      console.warn("[execution] docker run failed, switching to local runner:", tail(raw.stderr, 200));
      runnerMode = "local";
      if (!(await pythonReady())) {
        runnerMode = "none";
        return failure("error", tests.length, "Docker failed and no host Python found");
      }
      raw = await runLocal({ source, timeoutMs, pythonCommand });
    }
  } else {
    raw = await runLocal({ source, timeoutMs, pythonCommand });
  }

  if (raw.timedOut) {
    return failure("timeout", tests.length, `Execution exceeded ${timeoutMs}ms — too slow, attack failed`);
  }

  const line = raw.stdout
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith(token));
  if (!line) {
    return failure("error", tests.length, tail(raw.stderr, 400) || "Process produced no result");
  }

  let payload;
  try {
    payload = JSON.parse(line.slice(token.length));
  } catch {
    return failure("error", tests.length, "Could not parse runner output");
  }
  if (payload.error) {
    return failure("error", tests.length, payload.error);
  }

  const results = payload.results ?? [];
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const execTimeMs = round2(results.reduce((sum, r) => sum + (r.time_ms || 0), 0));
  const verdict = passed === total && total > 0 ? "pass" : passed > 0 ? "partial" : "fail";

  return {
    verdict,
    passed,
    total,
    execTimeMs,
    memoryKb: payload.peak_kb ?? null,
    error: null,
    tests: results.map((r, i) => ({
      index: i + 1,
      passed: r.passed,
      timeMs: r.time_ms,
      error: r.error ?? null,
      got: r.got ?? null
    }))
  };
}

function looksLikeDockerFailure(raw, token) {
  if (raw.stdout.includes(token)) return false;
  if (raw.timedOut) return false;
  return raw.spawnFailed || /docker|daemon|pipe|mount|Cannot connect/i.test(raw.stderr);
}

function failure(verdict, total, error) {
  return { verdict, passed: 0, total, execTimeMs: 0, memoryKb: null, error, tests: [] };
}

function tail(text, n) {
  const t = (text || "").trim();
  return t.length > n ? t.slice(-n) : t;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
