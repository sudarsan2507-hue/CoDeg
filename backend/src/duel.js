import { randomUUID } from "node:crypto";
import { EVENTS } from "../../shared/protocol.js";
import {
  MAX_HP,
  TOTAL_ROUNDS,
  COUNTDOWN_MS,
  ROUND_BREAK_MS,
  SUBMIT_COOLDOWN_MS,
  MAX_CODE_LENGTH,
  computeAttack
} from "../../shared/combat.js";
import { PROBLEMS, publicProblem } from "./problems.js";
import { runPython, currentRunnerMode } from "../../execution-engine/index.js";

// One live match. Flow (docs/mvp_plan.md):
// join → match → problem → submit → execute → evaluate → damage → HP → winner.
// First correct solution wins the round; three rounds or a KO end the duel.
export class Duel {
  constructor(players, onEnd) {
    this.id = randomUUID();
    this.onEnd = onEnd;
    this.state = "countdown"; // countdown | active | break | ended
    this.roundIndex = -1;
    this.roundSeq = 0; // bumped on every transition; stale evaluations are dropped
    this.timer = null;
    this.rounds = [];
    this.fighters = new Map();
    for (const { socket, name } of players) {
      this.fighters.set(socket.id, {
        id: socket.id,
        socket,
        name,
        hp: MAX_HP,
        lastMemoryKb: null,
        cooldownUntil: 0,
        inflight: false,
        damageDealt: 0,
        bestTimeMs: null
      });
    }
  }

  start() {
    const [a, b] = [...this.fighters.values()];
    for (const [me, other] of [[a, b], [b, a]]) {
      me.socket.emit(EVENTS.DUEL_START, {
        duelId: this.id,
        you: { id: me.id, name: me.name, hp: me.hp },
        opponent: { id: other.id, name: other.name, hp: other.hp },
        maxHp: MAX_HP,
        totalRounds: TOTAL_ROUNDS,
        runnerMode: currentRunnerMode()
      });
    }
    this.timer = setTimeout(() => this.startRound(), COUNTDOWN_MS);
  }

  startRound() {
    this.roundIndex += 1;
    this.roundSeq += 1;
    this.state = "active";
    const problem = PROBLEMS[this.roundIndex];
    const endsAt = Date.now() + problem.roundSeconds * 1000;
    this.currentEndsAt = endsAt;
    this.timer = setTimeout(() => this.timeoutRound(), problem.roundSeconds * 1000);
    this.emitAll(EVENTS.ROUND_START, {
      index: this.roundIndex,
      total: TOTAL_ROUNDS,
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

    const problem = PROBLEMS[this.roundIndex];
    const seqAtSubmit = this.roundSeq;
    fighter.inflight = true;
    this.opponentOf(fighter).socket.emit(EVENTS.OPPONENT_EVENT, { kind: "submitted" });

    let result;
    try {
      result = await runPython({
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

    if (result.memoryKb != null) fighter.lastMemoryKb = result.memoryKb;
    if (result.verdict === "pass") {
      fighter.bestTimeMs =
        fighter.bestTimeMs == null ? result.execTimeMs : Math.min(fighter.bestTimeMs, result.execTimeMs);
    }
    fighter.socket.emit(EVENTS.SUBMIT_RESULT, { ...result, late: false });

    if (result.verdict === "pass") {
      this.resolveHit(fighter, result, problem);
    } else {
      this.emitAll(EVENTS.COMBAT_EVENT, {
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

    this.emitAll(EVENTS.COMBAT_EVENT, {
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
      title: PROBLEMS[this.roundIndex].title,
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

    const anyKo = [...this.fighters.values()].some((f) => f.hp <= 0);
    if (anyKo || this.roundIndex >= TOTAL_ROUNDS - 1) {
      this.finish(anyKo ? "ko" : "rounds");
    } else {
      this.timer = setTimeout(() => this.startRound(), ROUND_BREAK_MS);
    }
  }

  finish(reason) {
    this.state = "ended";
    clearTimeout(this.timer);
    const [a, b] = [...this.fighters.values()];
    let winner = null;
    if (a.hp !== b.hp) winner = a.hp > b.hp ? a : b;
    this.emitEnd(winner, winner ? reason : "draw");
  }

  handleDisconnect(socketId) {
    if (this.state === "ended") return;
    this.state = "ended";
    clearTimeout(this.timer);
    this.roundSeq += 1;
    const winner = [...this.fighters.values()].find((f) => f.id !== socketId) ?? null;
    this.emitEnd(winner, "forfeit");
  }

  emitEnd(winner, reason) {
    const stats = {};
    for (const f of this.fighters.values()) {
      stats[f.id] = {
        name: f.name,
        hp: f.hp,
        damageDealt: f.damageDealt,
        damageTaken: MAX_HP - f.hp,
        bestTimeMs: f.bestTimeMs,
        lastMemoryKb: f.lastMemoryKb
      };
    }
    this.emitAll(EVENTS.DUEL_END, {
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      reason,
      hp: this.hpSnapshot(),
      stats,
      rounds: this.rounds
    });
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
    for (const f of this.fighters.values()) f.socket.emit(event, payload);
  }
}
