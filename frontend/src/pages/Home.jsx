import { Link } from "react-router-dom";

export default function Home() {
  return (
    <section className="card">
      <h1 className="title">Welcome to CoDeg</h1>
      <p className="subtitle">Enter a username and jump into a duel.</p>

      <div className="form-row">
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="input"
          type="text"
          placeholder="shadow_coder"
        />
      </div>

      <div className="actions">
        <Link className="button primary" to="/duel">
          Join Match
        </Link>
      </div>
    </section>
  );
}
