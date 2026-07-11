# Database

Deliberately empty for the MVP (`docs/mvp_plan.md` §4): matches, queues and
*live* duel state live in backend memory and vanish on restart.

As a durability stopgap (not a real persistence layer), completed matches are
best-effort appended to `matches.log.jsonl` in this directory by
`backend/src/matchLog.js` — one JSON object per line, written when a duel
ends (`Duel.emitEnd`). It's gitignored and purely additive; delete it anytime,
nothing reads it back. It exists so a server restart doesn't erase the record
of who played and won, even though it can't reconstruct an in-progress match.

Planned schema when real persistence lands (PostgreSQL):

- `users` — id, name, created_at, rating
- `matches` — id, player_a, player_b, winner, reason, started_at, ended_at
- `rounds` — match_id, index, problem_id, winner, damage, exec_time_ms
- `submissions` — match_id, user_id, round, verdict, exec_time_ms, memory_kb, code
