import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { spawnCapture } from "./spawnCapture.js";

// Pinned to a specific version+base tag rather than the floating "3.12-alpine"
// so the sandbox doesn't silently change under us. Override via env for
// operators who want to pin an exact sha256 digest in production, e.g.
// CODEG_DOCKER_IMAGE=python@sha256:<digest> (get it with
// `docker inspect --format='{{index .RepoDigests 0}}' python:3.12.7-alpine3.20`).
export const DOCKER_IMAGE = process.env.CODEG_DOCKER_IMAGE || "python:3.12.7-alpine3.20";

// Primary runner: executes the harness inside a locked-down container.
// No network, capped memory/CPU/pids, read-only filesystem, dropped caps.
export async function runDocker({ source, timeoutMs }) {
  const dir = await mkdtemp(path.join(tmpdir(), "codeg-"));
  const file = path.join(dir, "main.py");
  await writeFile(file, source, "utf8");

  const name = `codeg-${randomBytes(6).toString("hex")}`;
  const args = [
    "run",
    "--rm",
    "--name", name,
    "--network", "none",
    "--memory", "192m",
    "--memory-swap", "192m",
    "--cpus", "1",
    "--pids-limit", "64",
    "--read-only",
    // Scratch space some stdlib calls expect (e.g. tempfile); ephemeral,
    // capped, and noexec so nothing written there can be run as a binary.
    "--tmpfs", "/tmp:rw,size=16m,noexec,nosuid",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "-v", `${dir}:/code:ro`,
    DOCKER_IMAGE,
    "python", "-I", "/code/main.py"
  ];

  try {
    return await spawnCapture("docker", args, {
      timeoutMs,
      onTimeout: () => {
        // Killing the docker CLI doesn't kill the container; remove it too.
        spawn("docker", ["rm", "-f", name], { stdio: "ignore", windowsHide: true });
      }
    });
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
