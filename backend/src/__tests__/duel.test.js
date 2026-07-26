import { test } from "node:test";
import assert from "node:assert/strict";
import { Duel } from "../duel.js";
import { EVENTS } from "../../../shared/protocol.js";
import { MAX_HP } from "../../../shared/combat.js";

// A minimal stand-in for a Socket.IO socket that records what it was sent.
function fakeSocket(id) {
  return {
    id,
    log: [],
    emit(event, payload) {
      this.log.push({ event, payload });
    },
    last(event) {
      for (let i = this.log.length - 1; i >= 0; i--) {
        if (this.log[i].event === event) return this.log[i].payload;
      }
      return undefined;
    }
  };
}

// Builds a duel with an injectable runner. `runner` may be a fixed result
// object or a function returning one (sync or a promise).
function makeDuel(runner) {
  const a = fakeSocket("A");
  const b = fakeSocket("B");
  const runPython = async () => (typeof runner === "function" ? runner() : runner);
  const duel = new Duel(
    [
      { socket: a, name: "Alice" },
      { socket: b, name: "Bob" }
    ],
    null,
    { runPython }
  );
  return { duel, a, b };
}

const PASS = { verdict: "pass", passed: 7, total: 7, execTimeMs: 5, memoryKb: 500, tests: [] };

test("startRound activates the round and sends the problem to both fighters", () => {
  const { duel, a, b } = makeDuel(PASS);
  duel.startRound();
  assert.equal(duel.state, "active");
  assert.equal(duel.roundIndex, 0);
  assert.ok(a.last(EVENTS.ROUND_START)?.problem?.statement, "Alice got a problem statement");
  assert.equal(b.last(EVENTS.ROUND_START).index, 0);
  clearTimeout(duel.timer);
});

test("a passing submission lands an attack, deals damage, and ends the round", async () => {
  const { duel, a } = makeDuel(PASS);
  duel.startRound();
  await duel.handleSubmit("A", "def charge(orbs):\n    return sum(orbs)\n");

  const combat = a.last(EVENTS.COMBAT_EVENT);
  assert.equal(combat.attackerId, "A");
  assert.ok(combat.damage > 0, "attack dealt damage");
  assert.ok(combat.hp.B < MAX_HP, "Bob lost HP");
  assert.equal(duel.state, "break");
  assert.equal(duel.rounds.length, 1);
  assert.equal(duel.rounds[0].winnerId, "A");
  clearTimeout(duel.timer);
});

test("a failing submission registers a miss and keeps the round active", async () => {
  const { duel, a } = makeDuel({ verdict: "fail", passed: 2, total: 7, execTimeMs: 5, memoryKb: 100, tests: [] });
  duel.startRound();
  await duel.handleSubmit("A", "def charge(orbs):\n    return -1\n");

  const combat = a.last(EVENTS.COMBAT_EVENT);
  assert.equal(combat.style, "miss");
  assert.equal(combat.damage, 0);
  assert.equal(duel.state, "active", "a miss does not end the round");
  clearTimeout(duel.timer);
});

// Regression guard for the "dead defense mechanic" bug: memory-based defense
// must carry across rounds, because the first solve ends the round instantly
// and the defender rarely has a same-round reading.
test("memory defense carries across rounds", async () => {
  const a = fakeSocket("A");
  const b = fakeSocket("B");
  let next = null;
  const duel = new Duel(
    [
      { socket: a, name: "Alice" },
      { socket: b, name: "Bob" }
    ],
    null,
    { runPython: async () => next }
  );

  // Round 0: Alice solves with lean memory — earns standing armor.
  duel.startRound();
  next = { verdict: "pass", passed: 7, total: 7, execTimeMs: 5, memoryKb: 64, tests: [] };
  await duel.handleSubmit("A", "solve");
  clearTimeout(duel.timer);
  assert.equal(duel.fighters.get("A").lastMemoryKb, 64);

  // Round 1: Bob attacks Alice — her carried 64KB reading must reduce the hit.
  duel.startRound();
  next = { verdict: "pass", passed: 7, total: 7, execTimeMs: 25, memoryKb: 5000, tests: [] };
  await duel.handleSubmit("B", "solve");
  const combat = b.last(EVENTS.COMBAT_EVENT);
  assert.equal(combat.attackerId, "B");
  assert.ok(combat.defense > 0, "Alice's carried lean memory grants defense");
  clearTimeout(duel.timer);
});

test("an evaluation that finishes after the round advanced is marked late and deals no damage", async () => {
  const a = fakeSocket("A");
  const b = fakeSocket("B");
  let resolveRun;
  const duel = new Duel(
    [
      { socket: a, name: "Alice" },
      { socket: b, name: "Bob" }
    ],
    null,
    { runPython: () => new Promise((r) => (resolveRun = r)) }
  );

  duel.startRound();
  const pending = duel.handleSubmit("A", "solve");
  duel.roundSeq += 1; // the round advances while the evaluation is in flight
  resolveRun(PASS);
  await pending;

  assert.equal(a.last(EVENTS.SUBMIT_RESULT).late, true);
  assert.equal(a.last(EVENTS.COMBAT_EVENT), undefined, "a late result deals no damage");
  clearTimeout(duel.timer);
});

test("timeoutRound records a stalemate round with no winner", () => {
  const { duel } = makeDuel(PASS);
  duel.startRound();
  clearTimeout(duel.timer); // cancel the real 240s timer, drive it manually
  duel.timeoutRound();
  assert.equal(duel.rounds.length, 1);
  assert.equal(duel.rounds[0].winnerId, null);
  clearTimeout(duel.timer);
});

test("reconnect swaps a fighter's socket in place without ending the duel", () => {
  const { duel, b } = makeDuel(PASS);
  duel.startRound();
  const token = duel.fighters.get("A").token;

  duel.handleDisconnect("A");
  assert.equal(duel.fighters.get("A").connected, false);
  assert.equal(b.last(EVENTS.OPPONENT_EVENT).kind, "disconnected");

  const a2 = fakeSocket("A2");
  const swap = duel.reconnect(token, a2);
  assert.deepEqual(swap, { oldId: "A", newId: "A2" });
  assert.ok(duel.fighters.get("A2")?.connected, "the new socket is attached and live");
  assert.equal(duel.fighters.has("A"), false, "the old socket id is gone");
  assert.equal(b.last(EVENTS.OPPONENT_EVENT).kind, "reconnected");
  clearTimeout(duel.timer);
});
