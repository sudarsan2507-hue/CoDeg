# CoDeg — Real-Time Coding Duel

Two players get the same problem. First correct solution lands the hit.
**Execution speed scales the damage, memory efficiency blocks incoming damage.**
Three rounds (easy → medium → hard), 100 HP, KO or highest HP wins.

> A hybrid of competitive programming, real-time systems and game simulation,
> where code performance directly drives combat outcomes.

## Quickstart

```bash
npm run setup    # installs backend + frontend deps
npm install      # root: installs concurrently (once)
npm run dev      # backend :4000 + frontend :5173
```

Open http://localhost:5173 in **two browser tabs**, enter names, hit
*Find Match* in both — you're dueling yourself.

> Code runs in a Docker sandbox (`python:3.12-alpine`, no network, capped
> memory/CPU) when Docker Desktop is running. Otherwise it falls back to a
> host Python subprocess — fine locally, not for public hosting.

## Combat rules (docs/mvp_plan.md)

| Code metric        | Combat effect                                   |
| ------------------ | ----------------------------------------------- |
| All tests pass     | Attack lands (first solver wins the round)      |
| Any test fails     | Attack misses — opponent sees it                |
| Execution time     | Damage multiplier 0.8×–1.5× vs reference time   |
| Peak memory        | Defense: ≤128KB blocks 15%, ≤1MB blocks 8%      |
| Too slow / crash   | Timeout or error — attack fails                 |

Fast solves play a *rapid* strike animation, slow ones a *heavy* hit.

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
database/           (post-MVP — matches/users are in-memory for now)
docs/               MVP plan + architecture notes
```

## Testing

```bash
npm run test:duel   # boots the real server, two socket clients play a full
                    # 3-round duel with real Python execution, asserts the flow
```

## Roadmap (post-MVP)

- More languages (JS, C++) — the harness/runner interface already isolates this
- Persistence (PostgreSQL/Mongo) + Redis for match state, then ranked ladder
- Replay + per-round performance analysis
- Strategy mode: program your fighter's logic instead of solving problems
- Complexity-aware scoring (estimate O(n) vs O(n²) from behavior at scale)
