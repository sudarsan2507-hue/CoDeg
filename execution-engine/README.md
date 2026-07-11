# Execution Engine

Runs untrusted player Python against a problem's hidden tests and reports
metrics that the combat system consumes.

## How a submission runs

1. `harness.js` builds a single Python file: player code + a test loop.
   Per test it records wall time (`time.perf_counter`) and peak memory
   (`tracemalloc`), then prints one line prefixed with a random token —
   player `print()` output can't spoof the result.
2. A runner executes that file:
   - **Docker** (the only runner enabled by default): a pinned version+base
     tag (`CODEG_DOCKER_IMAGE`, default `python:3.12.7-alpine3.20`) with
     `--network none`, 192MB memory cap, 1 CPU, pids limit, read-only rootfs
     plus a small `noexec` tmpfs `/tmp`, all capabilities dropped. The
     container is force-removed on timeout.
   - **Local fallback**: host `python -I` subprocess with a hard kill
     timeout and **no other isolation** — no network/filesystem/memory
     restriction. This is arbitrary code execution on the host. It only runs
     if you explicitly set `ALLOW_UNSANDBOXED_EXECUTION=true`; without Docker
     and without that flag, `runPython` refuses to execute anything at all
     (fails closed) rather than silently downgrading. Use it for solo local
     play only — never on a server anyone else can reach.
3. `index.js` parses the token line into an evaluation:
   `{ verdict, passed, total, execTimeMs, memoryKb, tests[] }`.

## Notes

- `tracemalloc` adds overhead to timings; both players pay it equally, so the
  speed comparison stays fair. `refTimeMs` per problem is calibrated with
  tracing on.
- Infinite loops / too-slow solutions hit the process timeout → verdict
  `timeout` → the attack fails.
- The runner is chosen once at boot (`detectRunner()`). If Docker dies
  mid-match, `runPython` only falls back to the local runner when
  `ALLOW_UNSANDBOXED_EXECUTION=true`; otherwise it reports an execution error
  instead of quietly running the next submission unsandboxed.
- The Docker image tag is pinned but not digest-pinned by default (Docker
  Desktop isn't guaranteed to be reachable to resolve a digest at doc-writing
  time). For a real deployment, resolve and hardcode the digest:
  `docker inspect --format='{{index .RepoDigests 0}}' python:3.12.7-alpine3.20`
  → set `CODEG_DOCKER_IMAGE=python@sha256:...`.
