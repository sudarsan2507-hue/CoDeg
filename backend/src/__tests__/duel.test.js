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

test("timeoutRound records a stalemate round with no winner", () => {
  const { duel } = makeDuel(PASS);
  duel.startRound();
  clearTimeout(duel.timer); // cancel the real 240s timer, drive it manually
  duel.timeoutRound();
  assert.equal(duel.rounds.length, 1);
  assert.equal(duel.rounds[0].winnerId, null);
  clearTimeout(duel.timer);
});
