import { randomUUID } from "node:crypto";
import { EVENTS } from "../../shared/protocol.js";
import {
  MAX_HP,
  TOTAL_ROUNDS,
  COUNTDOWN_MS,
  ROUND_BREAK_MS,
  SUBMIT_COOLDOWN_MS,
  MAX_CODE_LENGTH,
  SUDDEN_DEATH_SECONDS,
  RECONNECT_GRACE_MS,
  computeAttack
} from "../../shared/combat.js";
import { PROBLEMS, publicProblem } from "./problems.js";
import { runPython as defaultRunPython, currentRunnerMode } from "../../execution-engine/index.js";
import { appendMatch } from "./matchLog.js";

// One live match. Flow (docs/mvp_plan.md):
// join → match → problem → submit → execute → evaluate → damage → HP → winner.
// First correct solution wins the round. After TOTAL_ROUNDS, a KO or an HP
// lead ends it; a tie keeps playing sudden-death rounds until one does.
export class Duel {
  constructor(players, onEnd, options = {}) {
    this.id = randomUUID();
    this.onEnd = onEnd;
    // Injectable so the state machine can be unit-tested without Docker/Python.
    this.runPython = options.runPython ?? defaultRunPython;
    this.state = "countdown"; // countdown | active | break | ended
    this.roundIndex = -1;
    this.roundSeq = 0; // bumped on every transition; stale evaluations are dropped
    this.timer = null;
    this.rounds = [];
    // Combat events for the current round, replayed to a fighter on reconnect
    // so a brief drop doesn't leave a hole in their combat log. Reset each round.
    this.eventBuffer = [];
    this.fighters = new Map();
    for (const { socket, name } of players) {
      this.fighters.set(socket.id, {
        id: socket.id,
        socket,
        name,
        token: randomUUID(), // lets this player's next socket reconnect into this duel
        hp: MAX_HP,
        lastMemoryKb: null,
        cooldownUntil: 0,
        inflight: false,
        damageDealt: 0,
        bestTimeMs: null,
        connected: true,
        disconnectTimer: null
      });
    }
  }

  start() {
    for (const fighter of this.fighters.values()) this.sendSnapshot(fighter);
    this.timer = setTimeout(() => this.startRound(), COUNTDOWN_MS);
  }

  // Sends a full duel:start snapshot to one fighter — used on match start and
  // again on reconnect, since the fighter's socket id (and therefore "you.id")
  // changes across a reconnect.
  sendSnapshot(fighter) {
    const other = this.opponentOf(fighter);
    fighter.socket.emit(EVENTS.DUEL_START, {
      duelId: this.id,
      you: { id: fighter.id, name: fighter.name, hp: fighter.hp, token: fighter.token },
      opponent: { id: other.id, name: other.name, hp: other.hp },
      maxHp: MAX_HP,
      totalRounds: TOTAL_ROUNDS,
      runnerMode: currentRunnerMode()
    });
    if (this.state === "active") {
      const problem = this.problemForRound(this.roundIndex);
      fighter.socket.emit(EVENTS.ROUND_START, {
        index: this.roundIndex,
        total: TOTAL_ROUNDS,
        suddenDeath: this.roundIndex >= TOTAL_ROUNDS,
        problem: publicProblem(problem, this.roundIndex),
        endsAt: this.currentEndsAt
      });
      // Catch the returning fighter up on combat they missed while away.
      for (const buffered of this.eventBuffer) fighter.socket.emit(EVENTS.COMBAT_EVENT, buffered);
    }
  }

  // Round index >= TOTAL_ROUNDS is sudden death: cycle back through the
  // problem set with a shorter timer so a tie resolves quickly.
  problemForRound(index) {
    return PROBLEMS[index % PROBLEMS.length];
  }

  roundSecondsFor(index, problem) {
    return index >= TOTAL_ROUNDS ? SUDDEN_DEATH_SECONDS : problem.roundSeconds;
  }

  startRound() {
    this.roundIndex += 1;
    this.roundSeq += 1;
    this.state = "active";
    this.eventBuffer = [];
    // NOTE: memory-based defense (fighter.lastMemoryKb) deliberately CARRIES
    // across rounds. The first passing submission ends the round instantly, so
    // the defender almost never has a reading from the current round — resetting
    // it each round made the whole defense mechanic dead in real matches. Instead
    // it's standing "armor" earned from your most recent passing solution's
    // memory efficiency (only passing runs set it, so it can't be gamed with a
    // deliberately-wrong low-memory submission). No reading yet → no defense.

    const problem = this.problemForRound(this.roundIndex);
    const seconds = this.roundSecondsFor(this.roundIndex, problem);
    const endsAt = Date.now() + seconds * 1000;
    this.currentEndsAt = endsAt;
    this.timer = setTimeout(() => this.timeoutRound(), seconds * 1000);
    this.emitAll(EVENTS.ROUND_START, {
      index: this.roundIndex,
      total: TOTAL_ROUNDS,
      suddenDeath: this.roundIndex >= TOTAL_ROUNDS,
      problem: publicProblem(problem, this.roundIndex),
      endsAt
    });
  }

  async handleSubmit(socketId, code) {
    const fighter = this.fighters.get(socketId);
    if (!fighter) return;
    if (this.state !== "active") {
      return fighter.socket.emit(EVENTS.SUBMIT_REJECTED, { reason: "Round is not active" });
    }
    if (typeof code !== "string" || !code.trim()) {
      return fighter.socket.emit(EVENTS.SUBMIT_REJECTED, { reason: "Empty submission" });
    }
    if (code.length > MAX_CODE_LENGTH) {
      return fighter.socket.emit(EVENTS.SUBMIT_REJECTED, { reason: "Code too long" });
    }
    if (fighter.inflight) {
      return fighter.socket.emit(EVENTS.SUBMIT_REJECTED, { reason: "Already evaluating" });
    }
    if (Date.now() < fighter.cooldownUntil) {
      return fighter.socket.emit(EVENTS.SUBMIT_REJECTED, { reason: "Cooldown — wait a moment" });
    }

    const problem = this.problemForRound(this.roundIndex);
    const seqAtSubmit = this.roundSeq;
    fighter.inflight = true;
    this.opponentOf(fighter).socket.emit(EVENTS.OPPONENT_EVENT, { kind: "submitted" });

    let result;
    try {
      result = await this.runPython({
        code,
        functionName: problem.functionName,
        tests: problem.tests,
        timeoutMs: problem.timeLimitMs
      });
    } finally {
      fighter.inflight = false;
      fighter.cooldownUntil = Date.now() + SUBMIT_COOLDOWN_MS;
    }

    // Round changed (or duel ended) while we were evaluating.
    if (this.state !== "active" || seqAtSubmit !== this.roundSeq) {
      return fighter.socket.emit(EVENTS.SUBMIT_RESULT, { ...result, late: true });
    }

    // Only a PASSING run sets the defense reading. Letting failing runs set
    // it would let a player game defense with a cheap, deliberately-wrong,
    // low-memory submission before their opponent's attack resolves.
    if (result.verdict === "pass") {
      fighter.lastMemoryKb = result.memoryKb;
      fighter.bestTimeMs =
        fighter.bestTimeMs == null ? result.execTimeMs : Math.min(fighter.bestTimeMs, result.execTimeMs);
    }
    fighter.socket.emit(EVENTS.SUBMIT_RESULT, { ...result, late: false });

    if (result.verdict === "pass") {
      this.resolveHit(fighter, result, problem);
    } else {
      this.broadcastCombat({
        attackerId: fighter.id,
        targetId: this.opponentOf(fighter).id,
        style: "miss",
        damage: 0,
        verdict: result.verdict,
        passed: result.passed,
        total: result.total,
        hp: this.hpSnapshot()
      });
    }
  }

  // Emits a combat event to both fighters AND records it for the current round
  // so a fighter who reconnects mid-round is replayed the hits they missed.
  broadcastCombat(payload) {
    this.eventBuffer.push(payload);
    if (this.eventBuffer.length > 40) this.eventBuffer.shift();
    this.emitAll(EVENTS.COMBAT_EVENT, payload);
  }

  resolveHit(fighter, result, problem) {
    const target = this.opponentOf(fighter);
    const attack = computeAttack({
      baseDamage: problem.baseDamage,
      execTimeMs: result.execTimeMs,
      refTimeMs: problem.refTimeMs,
      defenderMemoryKb: target.lastMemoryKb
    });
    target.hp = Math.max(0, target.hp - attack.damage);
    fighter.damageDealt += attack.damage;

    this.broadcastCombat({
      attackerId: fighter.id,
      targetId: target.id,
      style: attack.style,
      damage: attack.damage,
      multiplier: Math.round(attack.multiplier * 100) / 100,
      defense: attack.defense,
      execTimeMs: result.execTimeMs,
      verdict: "pass",
      passed: result.passed,
      total: result.total,
      hp: this.hpSnapshot()
    });

    this.rounds.push({
      index: this.roundIndex,
      title: problem.title,
      winnerId: fighter.id,
      winnerName: fighter.name,
      damage: attack.damage,
      execTimeMs: result.execTimeMs
    });
    this.endRound(fighter, "solved");
  }

  timeoutRound() {
    if (this.state !== "active") return;
    this.rounds.push({
      index: this.roundIndex,
      title: this.problemForRound(this.roundIndex).title,
      winnerId: null,
      winnerName: null,
      damage: 0,
      execTimeMs: null
    });
    this.endRound(null, "timeout");
  }

  endRound(winner, reason) {
    clearTimeout(this.timer);
    this.roundSeq += 1;
    this.state = "break";
    this.emitAll(EVENTS.ROUND_END, {
      index: this.roundIndex,
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      reason
    });

    const [a, b] = [...this.fighters.values()];
    const anyKo = a.hp <= 0 || b.hp <= 0;
    const decided = a.hp !== b.hp;
    if (anyKo) {
      this.finish("ko");
    } else if (this.roundIndex >= TOTAL_ROUNDS - 1 && decided) {
      this.finish("rounds");
    } else {
      // Either still in the base rounds, or tied after them — sudden death
      // keeps going (problemForRound cycles the set) until HP separates them.
      this.timer = setTimeout(() => this.startRound(), ROUND_BREAK_MS);
    }
  }

  finish(reason) {
    this.state = "ended";
    clearTimeout(this.timer);
    const [a, b] = [...this.fighters.values()];
    const winner = a.hp === b.hp ? null : a.hp > b.hp ? a : b;
    this.emitEnd(winner, winner ? reason : "draw");
  }

  handleDisconnect(socketId) {
    if (this.state === "ended") return;
    const fighter = this.fighters.get(socketId);
    if (!fighter || !fighter.connected) return;

    fighter.connected = false;
    this.opponentOf(fighter).socket.emit(EVENTS.OPPONENT_EVENT, {
      kind: "disconnected",
      graceMs: RECONNECT_GRACE_MS
    });
    fighter.disconnectTimer = setTimeout(() => {
      if (this.state === "ended") return;
      this.state = "ended";
      clearTimeout(this.timer);
      this.roundSeq += 1;
      const winner = [...this.fighters.values()].find((f) => f.id !== fighter.id) ?? null;
      this.emitEnd(winner, "forfeit");
    }, RECONNECT_GRACE_MS);
  }

  // Called by matchmaking when a fresh socket presents a valid reconnect
  // token for this duel. Swaps the fighter's socket/id in place so the match
  // (HP, round, timers) continues uninterrupted.
  reconnect(token, newSocket) {
    const oldId = [...this.fighters.entries()].find(([, f]) => f.token === token)?.[0];
    if (!oldId || this.state === "ended") return null;

    const fighter = this.fighters.get(oldId);
    clearTimeout(fighter.disconnectTimer);
    fighter.disconnectTimer = null;
    fighter.connected = true;
    fighter.socket = newSocket;
    fighter.id = newSocket.id;
    this.fighters.delete(oldId);
    this.fighters.set(newSocket.id, fighter);

    this.sendSnapshot(fighter);
    this.opponentOf(fighter).socket.emit(EVENTS.OPPONENT_EVENT, { kind: "reconnected" });
    return { oldId, newId: newSocket.id };
  }

  emitEnd(winner, reason) {
    const stats = {};
    for (const f of this.fighters.values()) {
      clearTimeout(f.disconnectTimer);
      stats[f.id] = {
        name: f.name,
        hp: f.hp,
        damageDealt: f.damageDealt,
        damageTaken: MAX_HP - f.hp,
        bestTimeMs: f.bestTimeMs,
        lastMemoryKb: f.lastMemoryKb
      };
    }
    const summary = {
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      reason,
      hp: this.hpSnapshot(),
      stats,
      rounds: this.rounds
    };
    this.emitAll(EVENTS.DUEL_END, summary);
    appendMatch({ duelId: this.id, endedAt: new Date().toISOString(), ...summary });
    this.onEnd?.(this);
  }

  opponentOf(fighter) {
    return [...this.fighters.values()].find((f) => f.id !== fighter.id);
  }

  hpSnapshot() {
    const hp = {};
    for (const f of this.fighters.values()) hp[f.id] = f.hp;
    return hp;
  }

  emitAll(event, payload) {
    for (const f of this.fighters.values()) {
      if (f.connected) f.socket.emit(event, payload);
    }
  }
}
