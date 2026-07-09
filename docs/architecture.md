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
          │◄── round:end ──► next round or duel:end (KO / rounds / forfeit)
```

Concurrency: each round has a sequence number; evaluations that finish after
the round ended are delivered to the submitter marked `late` and change nothing.
First passing submission ends the round — the loser keeps their HP loss only.

## Deliberately excluded from MVP (docs/mvp_plan.md)

No AI opponents, no ranking/ladder, no tournaments, no replay system,
no advanced animation engine (CSS keyframes instead of Phaser), no database
(in-memory state), single language.

## Scaling path

1. Extract execution into a worker pool (queue per submission, N containers warm)
2. Redis for matchmaking + duel state → multiple backend instances
3. PostgreSQL for users/matches/submissions → ratings (Elo/Glicko), leaderboards
4. Multi-language runners (image per language, same harness contract)
5. Spectator mode + replays from the recorded combat-event stream
