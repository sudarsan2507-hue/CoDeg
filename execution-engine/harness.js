import { randomBytes } from "node:crypto";

// Builds a self-contained Python program: the player's code at module level,
// followed by a test loop that measures per-test time (perf_counter) and peak
// memory (tracemalloc). The harness prints exactly one line prefixed with a
// random token, so user print() calls cannot spoof the result.
export function buildHarness({ code, functionName, tests }) {
  const token = `__CODEG_${randomBytes(8).toString("hex")}__`;
  const testsB64 = Buffer.from(JSON.stringify(tests), "utf8").toString("base64");

  const source = `${code}

import base64 as __b64
import json as __json
import time as __time
import tracemalloc as __tm


def __codeg_run():
    tests = __json.loads(__b64.b64decode("${testsB64}").decode("utf-8"))
    fn = globals().get(${JSON.stringify(functionName)})
    if not callable(fn):
        print("${token}" + __json.dumps({"error": "function ${functionName} is not defined"}))
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
        except Exception as exc:  # noqa: BLE001 - report anything the code raises
            entry["error"] = (type(exc).__name__ + ": " + str(exc))[:200]
        finally:
            if __tm.is_tracing():
                __tm.stop()
        results.append(entry)

    print("${token}" + __json.dumps({"results": results, "peak_kb": round(peak_kb, 1)}))


__codeg_run()
`;

  return { source, token };
}
