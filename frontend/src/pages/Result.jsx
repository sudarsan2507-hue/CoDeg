import { Link } from "react-router-dom";

export default function Result() {
  return (
    <section className="card">
      <h1 className="title">Match Result</h1>
      <p className="subtitle">Winner: Player One</p>

      <div className="stats-grid">
        <div className="stat">
          <span>Damage Dealt</span>
          <strong>85</strong>
        </div>
        <div className="stat">
          <span>Damage Taken</span>
          <strong>40</strong>
        </div>
        <div className="stat">
          <span>Runtime</span>
          <strong>0.42s</strong>
        </div>
        <div className="stat">
          <span>Memory</span>
          <strong>28MB</strong>
        </div>
      </div>

      <div className="actions">
        <Link className="button" to="/duel">
          Back to Duel
        </Link>
        <Link className="button ghost" to="/">
          Home
        </Link>
      </div>
    </section>
  );
}
