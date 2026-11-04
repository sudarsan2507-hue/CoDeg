# CoDeg - Progress & Flaw Analysis

Real-time 1v1 Python coding duel. Both players get the same problem; the first
correct solution attacks. Execution speed scales damage, low memory grants
defense. Scope is governed by `docs/mvp_plan.md` (no AI, no ranking, no replays,
Python only).

_Last analysed: 2026-07-25 (against commit `1c3c42d`)._

---

## 1. What has been built so far

The MVP is **functionally complete end-to-end** - a full duel can be played
start to finish. Breakdown by area:

### Backend (`backend/`)
- [x] **Socket.IO + Express server** (`server.js`) - CORS allowlist, static
      serving of the built frontend, `/health` endpoint.
- [x] **FIFO matchmaking** (`matchmaking.js`) - pairs the two waiting sockets;
      `duelsById` registry keyed by duel id so reconnects survive socket-id changes.
- [x] **Duel state machine** (`duel.js`) - countdown → 3 rounds → KO / HP win;
      `roundSeq` guard drops stale async evaluations; sudden-death rounds on a tie;
      reconnect grace window via per-fighter `token`.
- [x] **Problem set** (`problems.js`) - 3 problems (easy/medium/hard) with hidden
      tests, reference solutions, per-problem time limits and base damage.
- [x] **Per-IP rate limiting** (`rateLimit.js`) - in-memory sliding window for
      connections and queue joins, with a periodic sweep.
- [x] **Match log** (`matchLog.js`) - best-effort JSONL append of completed
      matches (durability stopgap, not real persistence).

### Execution engine (`execution-engine/`)
- [x] **Runner auto-detection** (`index.js`) - Docker → host-Python (opt-in) →
      none. **Fails closed**: no Docker + no explicit opt-in = no code runs.
- [x] **Docker sandbox** (`dockerRunner.js`) - pinned image, `--network none`,
      capped memory/CPU/pids, read-only rootfs, `noexec` tmpfs, dropped caps,
      `no-new-privileges`.
- [x] **Host-Python fallback** (`localRunner.js`) - `python -I`, opt-in only.
- [x] **Test harness** (`harness.js`) - measures per-test time (`perf_counter`)
      and peak memory (`tracemalloc`); token-prefixed result line.
- [x] **Process capture** (`spawnCapture.js`) - output caps + hard kill timeout.

### Shared (`shared/`)
- [x] **Combat formulas** (`combat.js`) - speed multiplier, attack style, defense
      tiers, `computeAttack` (pure functions used by both sides).
- [x] **Socket protocol** (`protocol.js`) - event name constants.

### Frontend (`frontend/`)
- [x] **Home / lobby** (`Home.jsx`) - name entry, connection status, find/cancel match.
- [x] **Duel arena** (`Duel.jsx`) - Monaco editor, live HP bars, round timer,
      submit flow, per-test feedback, combat log, reconnect handling.
- [x] **Arena animations** (`Arena.jsx`) - CSS-animated fighters, damage floats.
- [x] **Result screen** (`Result.jsx`) - outcome, per-player stats, round table.
- [x] **Duel store** (`duelStore.js`) - module store + `sessionStorage`
      persistence; auto-retries `duel:rejoin` on every reconnect.

### Tooling / docs
- [x] Root orchestration scripts (`npm run dev`, `setup`, `build`, `test`).
- [x] Combat unit tests (`shared/__tests__/combat.test.js`).
- [x] End-to-end duel test (`backend/scripts/e2e-duel.js`) - real server, two
      clients, full 3-round match with real Python execution.
- [x] Docs: `README.md`, `loud.md`, `docs/architecture.md`, `docs/mvp_plan.md`.

---

## 2. Flaws found - ALL FIXED (2026-07-25)

Every issue from the original audit has been resolved. Details below; each is
verified by the test run in §3.

### ✅ P1 - Memory-defense mechanic was effectively dead in real matches
- **Was:** `startRound` reset every fighter's `lastMemoryKb = null`, but the
  first passing submission ends the round instantly - so the defender never had
  a reading when the attack resolved, and `defenseReduction` was always `0`.
- **Fix:** removed the per-round reset (`duel.js`). Memory now **carries across
  rounds** as standing "armor" earned from your most recent *passing* solution's
  efficiency (only passing runs set it, so it can't be gamed). No solve yet → no
  defense, which is natural for round 1.
- **Verified:** new test *"memory defense carries across rounds"*; README updated
  to match the real behavior. Peak Memory / shield now actually show up.

### ✅ P1 - Result line was forgeable by malicious player code
- **Was:** player code sat at module level in the same file as the random token,
  so it could `open(__file__)`, read the token, `print` a forged pass, and
  `sys.exit()` before the harness ran.
- **Fix:** rewrote `harness.js`. Before any player code runs, the harness
  redirects real stdout (OS fd 1 **and** `sys.stdout`) to `/dev/null`, keeping a
  private duplicate fd it never exposes. Player code is `exec`'d in an isolated
  namespace (can't see the token/fd/globals); a top-level `sys.exit()` is caught;
  the genuine result is written last via the private fd, and `os._exit` prevents
  post-emit writes. Node reads the last token line, which is always the harness's.
- **Verified:** ran a live forgery attempt - the forged line went to `/dev/null`
  and the harness reported the real result. Full unsandboxed e2e duel still passes.

### ✅ P2 - Reconnect mid-round wiped the player's typed code
- **Fix:** `Duel.jsx` now tracks the shown round in `roundIndexRef` and only
  resets the editor when the round *index* actually changes, so a reconnect
  re-emit of the current round keeps your code.

### ✅ P2 - Combat events during the disconnect grace window were lost
- **Fix:** `duel.js` buffers the current round's combat events
  (`broadcastCombat` / `eventBuffer`, reset each round) and replays them to a
  fighter on reconnect via `sendSnapshot`.

### ✅ P2 - Rate limiting keyed on raw `handshake.address`
- **Fix:** `server.js` adds a `clientIp()` helper honoring the first
  `X-Forwarded-For` hop when `TRUST_PROXY=true` (off by default, since the header
  is spoofable when directly exposed).

### ✅ P2 - Thin test coverage on the state machine
- **Fix:** added `backend/src/__tests__/duel.test.js` (7 tests) covering round
  start, passing hit → damage → round end, miss, **defense carry-over**, the
  stale-eval `roundSeq` guard, timeout stalemate, and disconnect→reconnect swap.
  Made the runner injectable on `Duel` so this runs with no Docker/Python.

### ✅ P3 - Project hygiene
- Added `.editorconfig` (encodes the double-quote / 2-space conventions),
  `.env.example` (all env vars in one place), and a GitHub Actions CI workflow
  (`.github/workflows/ci.yml`) running the unit suites on every push/PR.

---

## 3. Status summary

| Area                        | State                                             |
| --------------------------- | ------------------------------------------------- |
| Core duel loop              | ✅ Working end-to-end                              |
| Matchmaking + reconnect     | ✅ Working (keeps code + combat log across drops)  |
| Docker sandbox execution    | ✅ Working, fail-closed                            |
| Combat: speed → damage      | ✅ Working                                         |
| Combat: memory → defense    | ✅ Working (carries as armor across rounds)        |
| Anti-cheat on results       | ✅ Result line no longer forgeable by player code  |
| Persistence                 | 🟡 Stopgap JSONL only (by design for MVP)          |
| Tests                       | ✅ 16 unit tests + full e2e duel, all passing      |
| CI                          | ✅ GitHub Actions on push/PR                        |

**Test run (2026-07-25):** `16 pass / 0 fail` unit + `PASS` full unsandboxed
e2e duel. Verified a live result-forgery attempt is defeated.

---

## 4. Suggested next steps (post-MVP, optional)
- Warm container pool to cut cold-start latency (already noted in README roadmap).
- Real persistence (Postgres/Redis) → ranked ladder + auth.
- Replays from the recorded combat-event stream.
- Optional ESLint/Prettier if the team wants enforced formatting (conventions
  are currently captured in `.editorconfig`).
- Gameplay depth - see the ideas discussed alongside this analysis.
