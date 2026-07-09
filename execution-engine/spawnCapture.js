import { spawn } from "node:child_process";

const MAX_OUTPUT = 1_000_000; // 1MB per stream, then the process is killed

// Runs a command, captures stdout/stderr, and hard-kills it after timeoutMs.
export function spawnCapture(command, args, { timeoutMs, onTimeout } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          if (onTimeout) onTimeout();
          child.kill("SIGKILL");
        }, timeoutMs)
      : null;

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > MAX_OUTPUT) child.kill("SIGKILL");
    });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr: stderr || String(err), code: -1, timedOut, spawnFailed: true });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut, spawnFailed: false });
    });
  });
}
