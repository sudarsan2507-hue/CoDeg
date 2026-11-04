# CoDeg - Dev notes

Real-time 1v1 coding duel: both players get the same Python problem; the first
correct solution attacks. Speed scales damage, low memory grants defense.
Scope decisions live in `docs/mvp_plan.md` - respect its exclusions (no AI,
no ranking, no replays, Python only) unless the user says otherwise.

## Commands

- `npm run setup` - install backend + frontend deps (run `npm install` at root once for concurrently)
- `npm run dev` - backend :4000 + frontend :5173 (two tabs to self-duel); **requires Docker Desktop running** - code execution fails closed without it
- `npm run dev:unsandboxed` - same, but runs player code as a bare host subprocess (no isolation) when Docker isn't available; solo local play only, never for a reachable server
- `npm run test` - unit tests (`test:combat`) + full e2e duel (`test:duel`); append `:unsandboxed` to the duel variants if Docker isn't running
- `npm run build` - vite build (backend serves `frontend/dist` if present)

## Map

- `shared/` - socket event names (`protocol.js`) + combat math (`combat.js`); imported relatively by BOTH backend and frontend (vite `fs.allow: [".."]`)
- `execution-engine/` - python harness (token-prefixed result line), docker runner (locked-down, digest-pinnable via `CODEG_DOCKER_IMAGE`), local `python -I` fallback gated behind `ALLOW_UNSANDBOXED_EXECUTION=true`; auto-detects at boot, fails closed otherwise
- `backend/src/duel.js` - duel state machine; `roundSeq` guards stale async evaluations; sudden-death rounds on a tie; reconnect grace period via per-fighter `token`
- `backend/src/matchmaking.js` - FIFO queue + `duelsById` registry (keyed by duel id, not socket id, so reconnects survive a socket id change)
- `backend/src/rateLimit.js` - in-memory per-IP sliding window for connections/queue joins
- `backend/src/matchLog.js` - best-effort JSONL append of completed matches (`database/matches.log.jsonl`, gitignored) - not real persistence, just restart durability
- `frontend/src/lib/duelStore.js` - module store so payloads survive route changes; also persists `{duelId, token}` to `sessionStorage` and auto-retries `duel:rejoin` on every socket reconnect

## Conventions

- Plain JS (ESM) everywhere, no TypeScript; double quotes, 2-space indent
- The user commits their own work - **never git commit and never add authoring attribution/Co-Authored-By trailers**
