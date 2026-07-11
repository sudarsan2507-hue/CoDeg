import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { socket } from "../lib/socket.js";
import { duelStore, loadPendingDuel, clearPendingDuel } from "../lib/duelStore.js";
import { EVENTS } from "../../../shared/protocol.js";
import Arena from "../components/Arena.jsx";

const REJOIN_TIMEOUT_MS = 8000;

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function Duel() {
  const navigate = useNavigate();

  const [duel, setDuel] = useState(duelStore.duel);
  const [reconnecting, setReconnecting] = useState(false);
  const [round, setRound] = useState(duelStore.round);
  const [hp, setHp] = useState({});
  const [code, setCode] = useState(duelStore.round?.problem.starter ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [log, setLog] = useState([]);
  const [combatEvent, setCombatEvent] = useState(null);
  const [banner, setBanner] = useState(duel ? { kind: "vs", text: "GET READY" } : null);
  const [opponentStatus, setOpponentStatus] = useState(null); // null | "disconnected"
  const [over, setOver] = useState(false);
  const [now, setNow] = useState(Date.now());
  const seqRef = useRef(0);

  // Landed here with no live duel in memory — either a stray visit (send
  // home) or a page refresh mid-match (try to rejoin using the token we
  // stashed in sessionStorage before giving up).
  useEffect(() => {
    if (duel) return undefined;
    const pending = loadPendingDuel();
    if (!pending) {
      navigate("/", { replace: true });
      return undefined;
    }

    setReconnecting(true);
    const onStart = (payload) => {
      setDuel(payload);
      setReconnecting(false);
    };
    const onRejected = () => {
      setReconnecting(false);
      navigate("/", { replace: true });
    };
    socket.on(EVENTS.DUEL_START, onStart);
    socket.on(EVENTS.REJOIN_REJECTED, onRejected);
    if (socket.connected) socket.emit(EVENTS.DUEL_REJOIN, pending);

    const timeout = setTimeout(() => {
      setReconnecting(false);
      clearPendingDuel();
      navigate("/", { replace: true });
    }, REJOIN_TIMEOUT_MS);

    return () => {
      socket.off(EVENTS.DUEL_START, onStart);
      socket.off(EVENTS.REJOIN_REJECTED, onRejected);
      clearTimeout(timeout);
    };
  }, [duel, navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Main event wiring — re-bound whenever `duel` changes (initial mount and
  // any later reconnect snapshot, since a reconnect gives this fighter a new
  // socket id and every event below keys off `youId`).
  useEffect(() => {
    if (!duel) return undefined;
    const youId = duel.you.id;
    const oppName = duel.opponent.name;
    setHp({ [duel.you.id]: duel.you.hp, [duel.opponent.id]: duel.opponent.hp });
    setOpponentStatus(null);

    const addLog = (text, tone = "info") =>
      setLog((l) => [{ id: Date.now() + Math.random(), text, tone }, ...l].slice(0, 60));

    const onDuelStart = (payload) => {
      // A later duel:start for the SAME duel means our socket reconnected
      // mid-match; refresh ids/HP without resetting the rest of the UI.
      if (payload.duelId !== duel.duelId) return;
      setDuel(payload);
      setOpponentStatus(null);
      addLog("Reconnected", "good");
    };

    const onRoundStart = (payload) => {
      setRound(payload);
      setResult(null);
      setSubmitting(false);
      setCode(payload.problem.starter);
      const label = payload.suddenDeath ? "SUDDEN DEATH" : `ROUND ${payload.index + 1}`;
      setBanner({ kind: "round", text: `${label} — ${payload.problem.title}` });
      setTimeout(() => setBanner(null), 2200);
      addLog(
        `${payload.suddenDeath ? "Sudden death" : `Round ${payload.index + 1}`}: ${payload.problem.title} (${payload.problem.difficulty})`
      );
    };

    const onSubmitResult = (r) => {
      setSubmitting(false);
      setResult(r);
      if (r.late) addLog("Result arrived after the round ended — no effect", "warn");
      else if (r.verdict === "pass") addLog(`All ${r.total} tests passed in ${r.execTimeMs}ms — attack lands!`, "good");
      else if (r.verdict === "timeout") addLog("Your code timed out — attack failed", "bad");
      else if (r.verdict === "error") addLog(`Runtime error: ${r.error ?? "unknown"}`, "bad");
      else addLog(`${r.passed}/${r.total} tests passed — attack missed`, "bad");
    };

    const onRejected = ({ reason }) => {
      setSubmitting(false);
      addLog(reason, "warn");
    };

    const onCombat = (e) => {
      setHp(e.hp);
      seqRef.current += 1;
      setCombatEvent({ ...e, youId, seq: seqRef.current });
      const mine = e.attackerId === youId;
      if (e.style === "miss") {
        addLog(
          mine ? "Your attack missed" : `${oppName}'s attack failed (${e.passed}/${e.total} tests)`,
          mine ? "bad" : "good"
        );
      } else {
        const shield = e.defense ? `, ${Math.round(e.defense * 100)}% blocked` : "";
        addLog(
          `${mine ? "You land" : `${oppName} lands`} a ${e.style} strike: -${e.damage} HP ` +
            `(${e.execTimeMs}ms, x${e.multiplier}${shield})`,
          mine ? "good" : "bad"
        );
      }
    };

    const onOpponent = ({ kind, graceMs }) => {
      if (kind === "submitted") addLog(`${oppName} submitted code…`, "warn");
      else if (kind === "disconnected") {
        setOpponentStatus("disconnected");
        addLog(`${oppName} disconnected — forfeits in ${Math.round((graceMs ?? 0) / 1000)}s if they don't return`, "warn");
      } else if (kind === "reconnected") {
        setOpponentStatus(null);
        addLog(`${oppName} reconnected`, "good");
      }
    };

    const onRoundEnd = ({ winnerName, reason }) => {
      setBanner({
        kind: "round-end",
        text: reason === "timeout" ? "TIME'S UP — STALEMATE" : `${winnerName} TAKES THE ROUND`
      });
    };

    const onDuelEnd = (summary) => {
      setOver(true);
      const won = summary.winnerId === youId;
      const text =
        summary.winnerId == null
          ? "DRAW"
          : summary.reason === "forfeit"
            ? won
              ? "OPPONENT FLED — VICTORY"
              : "DEFEAT"
            : won
              ? summary.reason === "ko"
                ? "KO — VICTORY"
                : "VICTORY"
              : summary.reason === "ko"
                ? "KO — DEFEAT"
                : "DEFEAT";
      setBanner({ kind: "end", text });
      setTimeout(() => navigate("/result"), 2400);
    };

    socket.on(EVENTS.DUEL_START, onDuelStart);
    socket.on(EVENTS.ROUND_START, onRoundStart);
    socket.on(EVENTS.SUBMIT_RESULT, onSubmitResult);
    socket.on(EVENTS.SUBMIT_REJECTED, onRejected);
    socket.on(EVENTS.COMBAT_EVENT, onCombat);
    socket.on(EVENTS.OPPONENT_EVENT, onOpponent);
    socket.on(EVENTS.ROUND_END, onRoundEnd);
    socket.on(EVENTS.DUEL_END, onDuelEnd);
    return () => {
      socket.off(EVENTS.DUEL_START, onDuelStart);
      socket.off(EVENTS.ROUND_START, onRoundStart);
      socket.off(EVENTS.SUBMIT_RESULT, onSubmitResult);
      socket.off(EVENTS.SUBMIT_REJECTED, onRejected);
      socket.off(EVENTS.COMBAT_EVENT, onCombat);
      socket.off(EVENTS.OPPONENT_EVENT, onOpponent);
      socket.off(EVENTS.ROUND_END, onRoundEnd);
      socket.off(EVENTS.DUEL_END, onDuelEnd);
    };
  }, [duel, navigate]);

  if (!duel) {
    return reconnecting ? (
      <section className="card">
        <h1 className="title">Reconnecting…</h1>
        <p className="subtitle">Rejoining your match — hang tight.</p>
      </section>
    ) : null;
  }

  const youHp = hp[duel.you.id] ?? duel.maxHp;
  const oppHp = hp[duel.opponent.id] ?? duel.maxHp;
  const remaining = round ? round.endsAt - now : null;
  const problem = round?.problem;

  function submit() {
    if (submitting || over || !round) return;
    setSubmitting(true);
    socket.emit(EVENTS.DUEL_SUBMIT, { code });
  }

  return (
    <section className="duel">
      <div className="round-bar panel">
        <span className="pill">
          {round
            ? round.suddenDeath
              ? "Sudden Death"
              : `Round ${round.index + 1}/${round.total}`
            : "Get ready"}
        </span>
        <span className="round-title">{problem ? problem.title : "Waiting for the first round…"}</span>
        <span className={`timer ${remaining != null && remaining < 30000 ? "low" : ""}`}>
          {remaining != null ? formatClock(remaining) : "--:--"}
        </span>
      </div>

      {opponentStatus === "disconnected" && (
        <div className="panel reconnect-banner">{duel.opponent.name} disconnected — waiting for them to return…</div>
      )}

      <div className="panel hp-panel">
        <div className="hp">
          <span>
            {duel.you.name} — {youHp} HP
          </span>
          <div className="hp-bar">
            <div className="hp-fill player" style={{ width: `${(youHp / duel.maxHp) * 100}%` }} />
          </div>
        </div>
        <div className="hp">
          <span>
            {duel.opponent.name} — {oppHp} HP
          </span>
          <div className="hp-bar">
            <div className="hp-fill enemy" style={{ width: `${(oppHp / duel.maxHp) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="panel arena">
        <Arena youName={duel.you.name} oppName={duel.opponent.name} event={combatEvent} />
        {banner && <div className={`banner ${banner.kind}`}>{banner.text}</div>}
        {duel.runnerMode === "local" && <span className="badge">local sandbox</span>}
        {duel.runnerMode === "docker" && <span className="badge docker">docker sandbox</span>}
      </div>

      <div className="duel-grid">
        <div className="panel problem-panel">
          {problem ? (
            <>
              <div className="problem-head">
                <h2>{problem.title}</h2>
                <span className={`chip ${problem.difficulty}`}>{problem.difficulty}</span>
              </div>
              <p className="statement">{problem.statement}</p>
              <div className="examples">
                {problem.examples.map((ex, i) => (
                  <code key={i}>
                    {ex.call} → {ex.expected}
                  </code>
                ))}
              </div>
              <p className="meta-row">
                Base damage {problem.baseDamage} · faster code hits harder · lean memory blocks
                incoming damage
              </p>
            </>
          ) : (
            <p className="statement">The problem appears when the round starts.</p>
          )}
        </div>

        <div className="editor-column">
          <div className="panel editor-panel">
            <Editor
              height="380px"
              language="python"
              value={code}
              onChange={(value) => setCode(value ?? "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                scrollBeyondLastLine: false
              }}
            />
          </div>
          <div className="actions duel-actions">
            <span className="lang-label">python</span>
            <button
              className="button primary"
              type="button"
              onClick={submit}
              disabled={submitting || over || !round}
            >
              {submitting ? "Evaluating…" : "Submit Attack"}
            </button>
          </div>

          {result && (
            <div className="panel tests-panel">
              <div className="tests-head">
                <span className={`chip verdict-${result.verdict}`}>{result.verdict}</span>
                <span>
                  {result.passed}/{result.total} tests · {result.execTimeMs}ms
                  {result.memoryKb != null && ` · peak ${result.memoryKb} KB`}
                </span>
              </div>
              {result.error && <p className="test-error">{result.error}</p>}
              <div className="tests">
                {result.tests.map((t) => (
                  <div key={t.index} className={`test-row ${t.passed ? "pass" : "fail"}`}>
                    <span>{t.passed ? "✓" : "✗"} Test {t.index}</span>
                    <span>{t.timeMs != null ? `${t.timeMs}ms` : ""}</span>
                    <span className="test-note">{t.error ?? (t.got != null ? `got ${t.got}` : "")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel log-panel">
        {log.length === 0 ? (
          <p className="log-empty">Combat log — solve the problem to strike first.</p>
        ) : (
          log.map((entry) => (
            <p key={entry.id} className={`log-line ${entry.tone}`}>
              {entry.text}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
