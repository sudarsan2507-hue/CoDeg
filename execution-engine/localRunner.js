import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnCapture } from "./spawnCapture.js";

// Fallback runner: executes the harness with the host Python interpreter.
// No container isolation — fine for local play, not for public hosting.
export async function runLocal({ source, timeoutMs, pythonCommand = "python" }) {
  const dir = await mkdtemp(path.join(tmpdir(), "codeg-"));
  const file = path.join(dir, "main.py");
  await writeFile(file, source, "utf8");
  try {
    // -I: isolated mode (ignores env vars and user site-packages)
    return await spawnCapture(pythonCommand, ["-I", file], { timeoutMs });
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
