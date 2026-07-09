# CoDeg — Claude notes

Real-time 1v1 coding duel: both players get the same Python problem; the first
correct solution attacks. Speed scales damage, low memory grants defense.
Scope decisions live in `docs/mvp_plan.md` — respect its exclusions (no AI,
no ranking, no replays, Python only) unless the user says otherwise.

## Commands

- `npm run setup` — install backend + frontend deps (run `npm install` at root once for concurrently)
- `npm run dev` — backend :4000 + frontend :5173 (two tabs to self-duel)
- `npm run test:duel` — full e2e duel over real sockets + real Python execution
- `npm run build` — vite build (backend serves `frontend/dist` if present)

## Map

- `shared/` — socket event names (`protocol.js`) + combat math (`combat.js`); imported relatively by BOTH backend and frontend (vite `fs.allow: [".."]`)
- `execution-engine/` — python harness (token-prefixed result line), docker runner (locked-down `python:3.12-alpine`), local `python -I` fallback; auto-detects at boot
- `backend/src/duel.js` — duel state machine; `roundSeq` guards stale async evaluations
- `frontend/src/lib/duelStore.js` — module store so payloads survive route changes

## Conventions

- Plain JS (ESM) everywhere, no TypeScript; double quotes, 2-space indent
- The user commits their own work — **never git commit and never add Claude attribution/Co-Authored-By**
