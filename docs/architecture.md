# CoDeg Architecture

## Concept (compressed theory)

A web-based competitive system where two players duel in real time by solving
coding problems. Submissions execute in isolated sandboxes; evaluation metrics
convert into combat actions in a visual arena:

- **Correctness** → enables the attack (wrong = miss)
- **Execution time** → damage multiplier (fast = rapid strikes, slow = heavy hits)
- **Memory usage** → defense (lean code blocks incoming damage)

## MVP implementation map

| Concept piece        | MVP implementation                                        |
| -------------------- | --------------------------------------------------------- |
| Matchmaking          | FIFO queue in `backend/src/matchmaking.js`                 |
| Duel state machine   | `backend/src/duel.js` — countdown → 3 rounds → KO/HP win   |
| Problems             | `backend/src/problems.js` (easy/medium/hard, hidden tests) |
| Code execution       | `execution-engine/` — Docker sandbox, host-python fallback |
| Metrics → combat     | `shared/combat.js` (pure functions, used by both sides)    |
| Live updates         | Socket.IO events in `shared/protocol.js`                   |
| Arena visualization  | CSS-animated fighters in `frontend/src/components/Arena.jsx` |
| Language             | Python only (per `docs/mvp_plan.md`)                       |

## Duel sequence

```
Player A ─┐                        ┌─ Player B
          ├─ queue:join ──► matchmaking ──► duel:start (both)
          │                        │
          │◄── round:start (identical problem) ──►│
          │                        │
          ├─ duel:submit ──► harness build ──► docker run ──► parse metrics
          │                        │
          │◄── submit:result (private)          │
          │◄── combat:event (both: damage/miss, HP snapshot)
          │                        │
          │◄── round:end ──► next round, sudden death, or duel:end (KO / rounds / forfeit)
```

Concurrency: each round has a sequence number; evaluations that finish after
the round ended are delivered to the submitter marked `late` and change nothing.
First passing submission ends the round — the loser keeps their HP loss only.

If both fighters are still tied after `TOTAL_ROUNDS`, `endRound` keeps
scheduling extra rounds (`problemForRound` cycles the problem set, shortened
to `SUDDEN_DEATH_SECONDS`) instead of ending in an unresolved draw — the only
way to end without a winner is a true `hp === hp` tie declared explicitly by
`finish()`, which in practice only happens if both fighters also forfeit.

### Reconnects

Each fighter gets a random `token` (`duel.js` constructor) sent only to them
in their own `duel:start` payload. On `disconnect`, `handleDisconnect` doesn't
end the match immediately — it starts a `RECONNECT_GRACE_MS` timer and tells
the opponent. A new socket presenting `{ duelId, token }` via `duel:rejoin`
is swapped into the same `Duel` instance (`duel.reconnect`) in place: same HP,
same round, same timers, new socket id. `matchmaking.js` keeps a `duelsById`
registry (independent of socket ids) so this lookup survives the old socket
id disappearing. The frontend persists `{ duelId, token }` to
`sessionStorage` and retries `duel:rejoin` on every socket `connect` event —
covering both a live network blip and a full page refresh.

## Deliberately excluded from MVP (docs/mvp_plan.md)

No AI opponents, no ranking/ladder, no tournaments, no replay system,
no advanced animation engine (CSS keyframes instead of Phaser), no real
database (live state is in-memory; completed matches are best-effort appended
to `database/matches.log.jsonl`, see `database/README.md`), single language,
no user accounts/auth (player names are self-reported, unenforced).

## Threat model / hardening notes

- **Code execution is fail-closed.** `execution-engine/index.js` refuses to
  run any code unless Docker is available, or `ALLOW_UNSANDBOXED_EXECUTION=true`
  is explicitly set (host-subprocess execution, no isolation — solo local
  play only, never for a server other people can reach).
- **CORS is an explicit allowlist** (`ALLOWED_ORIGIN`, defaults to the local
  Vite dev origin), not `origin: true`.
- **Connections and queue joins are rate-limited per IP**
  (`backend/src/rateLimit.js`) — a simple in-memory sliding window, good
  enough for a single process; swap for Redis if this scales out.
- **The Docker image is pinned** to a specific version+base tag
  (`CODEG_DOCKER_IMAGE`, `dockerRunner.js`) instead of a floating tag, and the
  container gets a `noexec` tmpfs `/tmp` rather than a writable rootfs.
- Still open, deliberately out of MVP scope: no auth (names are spoofable),
  single-process/in-memory duel state (no horizontal scaling), fresh
  container per submission (isolation over throughput).

## Scaling path

1. Extract execution into a worker pool (queue per submission, N containers warm)
2. Redis for matchmaking + duel state → multiple backend instances
3. PostgreSQL for users/matches/submissions → ratings (Elo/Glicko), leaderboards
4. Multi-language runners (image per language, same harness contract)
5. Spectator mode + replays from the recorded combat-event stream
