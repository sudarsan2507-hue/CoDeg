# CoDeg - Real-Time Coding Duel

Two players get the same problem. First correct solution lands the hit.
**Execution speed scales the damage, memory efficiency blocks incoming damage.**
Three rounds (easy → medium → hard), 100 HP, KO or highest HP wins.

> A hybrid of competitive programming, real-time systems and game simulation,
> where code performance directly drives combat outcomes.

## Quickstart

```bash
npm run setup    # installs backend + frontend deps
npm install      # root: installs concurrently (once)
npm run dev      # backend :4000 + frontend :5173 - needs Docker Desktop running
```

Open http://localhost:5173 in **two browser tabs**, enter names, hit
*Find Match* in both - you're dueling yourself.

> Code executes inside a locked-down Docker sandbox (no network, capped
> memory/CPU/pids, read-only rootfs). **`npm run dev` refuses to execute any
> code if Docker isn't running** - it fails closed rather than silently
> falling back to something unsafe. If you don't have Docker installed, run
> `npm run dev:unsandboxed` instead: it executes player code as a bare host
> subprocess with **no sandboxing at all**. That's fine for playing against
> yourself in two tabs on your own machine - never run it on a server anyone
> else can reach. See [execution-engine/README.md](execution-engine/README.md).

## Combat rules (docs/mvp_plan.md)

| Code metric        | Combat effect                                   |
| ------------------ | ----------------------------------------------- |
| All tests pass     | Attack lands (first solver wins the round)      |
| Any test fails     | Attack misses - opponent sees it                |
| Execution time     | Damage multiplier 0.8×–1.5× vs reference time   |
| Peak memory        | Defense: ≤128KB blocks 15%, ≤1MB blocks 8%      |
| Too slow / crash   | Timeout or error - attack fails                 |

Fast solves play a *rapid* strike animation, slow ones a *heavy* hit. Defense
is standing **armor** earned from your most recent **passing** submission's
memory efficiency, carried forward across rounds (only passing runs set it, so
a deliberately-wrong low-memory submission can't game it). Since the first
correct solution ends the round immediately, this is what lets lean code
actually block a later incoming attack - you haven't usually solved the
*current* round when your opponent's hit lands. No passing solution yet → no
defense.

If both fighters are still tied on HP after the 3 base rounds, the duel goes
to **sudden death**: extra rounds (cycling back through the problem set, 90s
timer) until someone's HP actually separates them.

If your connection drops mid-duel (or you refresh the tab), you have **20
seconds** to reconnect before it's scored as a forfeit - the match keeps
your HP, round, and timer waiting for you.

## Flow

```
Editor → Socket.IO → Backend → Execution Engine (Docker/local python)
   → Evaluation (tests, time, memory) → Combat stats → WebSocket → Arena
```

## Structure

```
backend/            Express + Socket.IO: matchmaking, duel state machine, problems
execution-engine/   Python harness + Docker runner + local fallback
frontend/           React + Vite + Monaco: lobby, duel arena, results
shared/             Socket protocol + combat formulas (used by both sides)
database/           (post-MVP - matches/users are in-memory for now)
docs/               MVP plan + architecture notes
```

## Environment variables (backend)

| Variable                     | Default                   | Purpose                                                        |
| ----------------------------- | -------------------------- | --------------------------------------------------------------- |
| `PORT`                        | `4000`                     | Backend port                                                    |
| `ALLOWED_ORIGIN`               | `http://localhost:5173`    | Comma-separated CORS allowlist for the Socket.IO server; `*` disables the check |
| `ALLOW_UNSANDBOXED_EXECUTION`  | `false`                    | Opt in to running code without Docker (see Quickstart warning above) |
| `CODEG_DOCKER_IMAGE`           | `python:3.12.7-alpine3.20` | Override the sandbox image, e.g. to pin an exact digest for production |

## Testing

```bash
npm run test:combat   # unit tests for the damage/defense formulas (shared/combat.js)
npm run test:duel     # boots the real server, two socket clients play a full
                      # 3-round duel with real Python execution, asserts the flow
                      # (needs Docker running, or use npm run test:duel:unsandboxed)
npm test               # both
```

## Roadmap (post-MVP)

- More languages (JS, C++) - the harness/runner interface already isolates this
- Real persistence (PostgreSQL/Mongo) + Redis for live match state, then ranked
  ladder and auth (completed matches already append to
  `database/matches.log.jsonl` as a durability stopgap - see `database/README.md`)
- Replay + per-round performance analysis
- Strategy mode: program your fighter's logic instead of solving problems
- Complexity-aware scoring (estimate O(n) vs O(n²) from behavior at scale)
- Container warm-pool for execution (currently a fresh container per
  submission - simple and fully isolated, but adds cold-start latency)
