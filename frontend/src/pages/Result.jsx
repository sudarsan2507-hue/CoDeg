import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { duelStore } from "../lib/duelStore.js";

function prettyMemory(kb) {
  if (kb == null) return "—";
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

const REASON_TEXT = {
  ko: "by knockout",
  rounds: "on HP after 3 rounds",
  forfeit: "by forfeit",
  draw: "even HP — nobody wins"
};

export default function Result() {
  const navigate = useNavigate();
  const summary = duelStore.summary;
  const duel = duelStore.duel;

  useEffect(() => {
    if (!summary || !duel) navigate("/", { replace: true });
  }, [summary, duel, navigate]);

  if (!summary || !duel) return null;

  const youId = duel.you.id;
  const mine = summary.stats[youId];
  const won = summary.winnerId === youId;
  const headline =
    summary.winnerId == null ? "Draw" : won ? "Victory" : "Defeat";

  return (
    <section className="card">
      <h1 className="title">
        {headline}
        {summary.winnerName && ` — ${summary.winnerName} wins ${REASON_TEXT[summary.reason] ?? ""}`}
      </h1>
      <p className="subtitle">
        {duel.you.name} {summary.hp[duel.you.id]} HP · {duel.opponent.name}{" "}
        {summary.hp[duel.opponent.id]} HP
      </p>

      <div className="stats-grid">
        <div className="stat">
          <span>Damage Dealt</span>
          <strong>{mine.damageDealt}</strong>
        </div>
        <div className="stat">
          <span>Damage Taken</span>
          <strong>{mine.damageTaken}</strong>
        </div>
        <div className="stat">
          <span>Best Runtime</span>
          <strong>{mine.bestTimeMs != null ? `${mine.bestTimeMs}ms` : "—"}</strong>
        </div>
        <div className="stat">
          <span>Peak Memory</span>
          <strong>{prettyMemory(mine.lastMemoryKb)}</strong>
        </div>
      </div>

      <div className="rounds-table">
        {summary.rounds.map((r) => (
          <div key={r.index} className="round-row">
            <span className="pill">R{r.index + 1}</span>
            <span className="round-row-title">{r.title}</span>
            <span>
              {r.winnerName
                ? `${r.winnerName} · -${r.damage} HP · ${r.execTimeMs}ms`
                : "stalemate"}
            </span>
          </div>
        ))}
      </div>

      <div className="actions">
        <Link className="button primary" to="/">
          Play Again
        </Link>
        <Link className="button ghost" to="/">
          Home
        </Link>
      </div>
    </section>
  );
}
