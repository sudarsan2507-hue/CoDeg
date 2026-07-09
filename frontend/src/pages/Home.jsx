import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../lib/socket.js";
import { EVENTS } from "../../../shared/protocol.js";

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem("codeg-name") || "");
  const [searching, setSearching] = useState(false);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      setSearching(false);
    };
    const onQueue = ({ waiting }) => setSearching(!!waiting);
    const onDuelStart = () => navigate("/duel");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(EVENTS.QUEUE_STATUS, onQueue);
    socket.on(EVENTS.DUEL_START, onDuelStart);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(EVENTS.QUEUE_STATUS, onQueue);
      socket.off(EVENTS.DUEL_START, onDuelStart);
    };
  }, [navigate]);

  function findMatch() {
    const finalName = name.trim() || `coder_${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem("codeg-name", finalName);
    setName(finalName);
    socket.emit(EVENTS.QUEUE_JOIN, { name: finalName });
    setSearching(true);
  }

  function cancel() {
    socket.emit(EVENTS.QUEUE_LEAVE);
    setSearching(false);
  }

  return (
    <section className="card">
      <h1 className="title">Welcome to CoDeg</h1>
      <p className="subtitle">
        Solve the problem before your opponent. Correct code lands the hit — faster
        code hits harder, leaner memory blocks damage.
      </p>

      <div className="status-row">
        <span className={`dot ${connected ? "online" : "offline"}`} />
        {connected ? "Server online" : "Server offline — run the backend (npm run dev)"}
      </div>

      <div className="form-row">
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="input"
          type="text"
          placeholder="shadow_coder"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !searching && connected && findMatch()}
        />
      </div>

      <div className="actions">
        {searching ? (
          <>
            <button className="button primary" type="button" disabled>
              Searching for an opponent…
            </button>
            <button className="button ghost" type="button" onClick={cancel}>
              Cancel
            </button>
          </>
        ) : (
          <button className="button primary" type="button" onClick={findMatch} disabled={!connected}>
            Find Match
          </button>
        )}
      </div>

      <p className="hint">
        3 rounds: easy → medium → hard. First correct solution each round attacks.
        Testing solo? Open this page in a second browser tab and queue from both.
      </p>
    </section>
  );
}
