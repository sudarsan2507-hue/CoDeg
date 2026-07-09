# Execution Engine

Runs untrusted player Python against a problem's hidden tests and reports
metrics that the combat system consumes.

## How a submission runs

1. `harness.js` builds a single Python file: player code + a test loop.
   Per test it records wall time (`time.perf_counter`) and peak memory
   (`tracemalloc`), then prints one line prefixed with a random token —
   player `print()` output can't spoof the result.
2. A runner executes that file:
   - **Docker** (preferred): `python:3.12-alpine` with `--network none`,
     192MB memory cap, 1 CPU, pids limit, read-only rootfs, all capabilities
     dropped. The container is force-removed on timeout.
   - **Local fallback**: host `python -I` subprocess with a hard kill timeout.
     Used automatically when the Docker daemon isn't running. Fine for
     playing on your own machine — do not host publicly in this mode.
3. `index.js` parses the token line into an evaluation:
   `{ verdict, passed, total, execTimeMs, memoryKb, tests[] }`.

## Notes

- `tracemalloc` adds overhead to timings; both players pay it equally, so the
  speed comparison stays fair. `refTimeMs` per problem is calibrated with
  tracing on.
- Infinite loops / too-slow solutions hit the process timeout → verdict
  `timeout` → the attack fails.
- The runner is chosen once at boot (`detectRunner()`), with a mid-match
  fallback from docker → local if the daemon dies.
