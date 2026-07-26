import { randomBytes } from "node:crypto";

// Builds a self-contained Python program that runs the player's function
// against the hidden tests and prints exactly one token-prefixed result line.
//
// Integrity: the player's code CANNOT forge that result line. Before any player
// code runs, the harness redirects the real stdout (both the OS fd 1 and the
// Python-level sys.stdout) to /dev/null, keeping a private duplicate of the
// real stdout fd that it never exposes. Player code is then exec'd in an
// isolated namespace, so:
//   - anything it prints (or writes to fd 1 directly) lands in /dev/null;
//   - it never sees the private fd, the token, or the harness globals;
//   - even a top-level `sys.exit()` is caught, so it can't stop the harness
//     from emitting the genuine result AFTER the player code has run.
// Node reads the LAST token line, and the harness always emits last, so a
// forged line (even from an exotic fd-scan) is overwritten by the real one.
export function buildHarness({ code, functionName, tests }) {
  const token = `__CODEG_${randomBytes(8).toString("hex")}__`;
  const testsB64 = Buffer.from(JSON.stringify(tests), "utf8").toString("base64");
  const codeB64 = Buffer.from(code, "utf8").toString("base64");

  const source = `import base64 as __b64
import io as __io
import json as __json
import os as __os
import sys as __sys
import time as __time
import tracemalloc as __tm

# Seal stdout before any player code executes (see harness.js for why).
__real_fd = __os.dup(1)
__null_fd = __os.open(__os.devnull, __os.O_WRONLY)
__os.dup2(__null_fd, 1)
__sys.stdout = __io.StringIO()

__token = ${JSON.stringify(token)}
__function_name = ${JSON.stringify(functionName)}


def __codeg_emit(obj):
    __os.write(__real_fd, (__token + __json.dumps(obj) + "\\n").encode("utf-8"))


def __codeg_run():
    tests = __json.loads(__b64.b64decode(${JSON.stringify(testsB64)}).decode("utf-8"))
    player_src = __b64.b64decode(${JSON.stringify(codeB64)}).decode("utf-8")

    ns = {"__name__": "__player__"}
    try:
        exec(compile(player_src, "<player>", "exec"), ns)
    except BaseException as exc:  # noqa: BLE001 - a load error shouldn't crash the harness
        __codeg_emit({"error": "load error: " + type(exc).__name__ + ": " + str(exc)[:180]})
        return

    fn = ns.get(__function_name)
    if not callable(fn):
        __codeg_emit({"error": "function " + __function_name + " is not defined"})
        return

    results = []
    peak_kb = 0.0
    for test in tests:
        entry = {"passed": False, "time_ms": 0.0, "error": None}
        try:
            __tm.start()
            t0 = __time.perf_counter()
            out = fn(*test["input"])
            entry["time_ms"] = round((__time.perf_counter() - t0) * 1000.0, 3)
            _, peak = __tm.get_traced_memory()
            peak_kb = max(peak_kb, peak / 1024.0)
            norm = __json.loads(__json.dumps(out))
            if norm == test["expected"]:
                entry["passed"] = True
            else:
                entry["got"] = repr(norm)[:120]
        except BaseException as exc:  # noqa: BLE001 - report anything the code raises, incl. SystemExit
            entry["error"] = (type(exc).__name__ + ": " + str(exc))[:200]
        finally:
            if __tm.is_tracing():
                __tm.stop()
        results.append(entry)

    __codeg_emit({"results": results, "peak_kb": round(peak_kb, 1)})


try:
    __codeg_run()
except BaseException as __exc:  # noqa: BLE001
    try:
        __codeg_emit({"error": "harness error: " + str(__exc)[:180]})
    except Exception:
        pass

# Terminate immediately so no lingering thread can append after the real line.
__os._exit(0)
`;

  return { source, token };
}
