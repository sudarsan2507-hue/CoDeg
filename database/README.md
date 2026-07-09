# Database

Deliberately empty for the MVP (`docs/mvp_plan.md` §4): matches, queues and
duel state live in backend memory and vanish on restart.

Planned schema when persistence lands (PostgreSQL):

- `users` — id, name, created_at, rating
- `matches` — id, player_a, player_b, winner, reason, started_at, ended_at
- `rounds` — match_id, index, problem_id, winner, damage, exec_time_ms
- `submissions` — match_id, user_id, round, verdict, exec_time_ms, memory_kb, code
