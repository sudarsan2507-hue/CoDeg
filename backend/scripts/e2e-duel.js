// End-to-end duel test: boots the real server, connects two socket clients,
// plays a full 3-round match with real Python execution, and asserts the flow.
// Run: npm run test:duel   (from backend/)
import { io as connect } from "socket.io-client";
import { createServer } from "../src/server.js";
import { detectRunner } from "../../execution-engine/index.js";
import { PROBLEMS } from "../src/problems.js";
import { EVENTS } from "../../shared/protocol.js";
import { MAX_HP } from "../../shared/combat.js";

const WRONG_CODE = "def charge(orbs):\n    return -1\n";

function fail(msg) {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
  console.log(`  ok - ${msg}`);
}

const watchdog = setTimeout(() => fail("test did not finish within 120s"), 120000);

const mode = await detectRunner();
console.log(`runner mode: ${mode}`);
if (mode === "none") fail("no python runtime available");

const { httpServer } = createServer();
await new Promise((resolve) => httpServer.listen(0, resolve));
const port = httpServer.address().port;
console.log(`server on :${port}`);

const alice = connect(`http://localhost:${port}`, { transports: ["websocket"] });
const bob = connect(`http://localhost:${port}`, { transports: ["websocket"] });

const seen = { combat: [], roundEnds: [], aliceResults: [], bobResults: [] };
let aliceId = null;
let bobWhiffed = false;

const duelEnd = new Promise((resolve) => alice.on(EVENTS.DUEL_END, resolve));
const bobEnd = new Promise((resolve) => bob.on(EVENTS.DUEL_END, resolve));

alice.on(EVENTS.DUEL_START, (d) => {
  aliceId = d.you.id;
  console.log(`duel started: ${d.you.name} vs ${d.opponent.name} (runner: ${d.runnerMode})`);
});
alice.on(EVENTS.SUBMIT_RESULT, (r) => seen.aliceResults.push(r));
bob.on(EVENTS.SUBMIT_RESULT, (r) => seen.bobResults.push(r));
alice.on(EVENTS.COMBAT_EVENT, (e) => seen.combat.push(e));
alice.on(EVENTS.ROUND_END, (e) => seen.roundEnds.push(e));

alice.on(EVENTS.ROUND_START, ({ index, problem }) => {
  console.log(`round ${index + 1}: ${problem.title}`);
  const full = PROBLEMS[index];
  if (index === 0 && !bobWhiffed) {
    // Bob fires a wrong answer first to exercise the miss path.
    bobWhiffed = true;
    bob.emit(EVENTS.DUEL_SUBMIT, { code: WRONG_CODE });
    setTimeout(() => alice.emit(EVENTS.DUEL_SUBMIT, { code: full.reference }), 2500);
  } else {
    setTimeout(() => alice.emit(EVENTS.DUEL_SUBMIT, { code: full.reference }), 300);
  }
});

await new Promise((resolve) => {
  let ready = 0;
  const onConnect = () => { if (++ready === 2) resolve(); };
  alice.on("connect", onConnect);
  bob.on("connect", onConnect);
});

alice.emit(EVENTS.QUEUE_JOIN, { name: "Alice" });
bob.emit(EVENTS.QUEUE_JOIN, { name: "Bob" });

const summary = await duelEnd;
await bobEnd;

console.log("\nassertions:");
assert(summary.winnerId === aliceId, "Alice wins the duel");
assert(summary.rounds.length === 3, "three rounds were played");
assert(summary.rounds.every((r) => r.winnerId === aliceId), "Alice won every round");

const hits = seen.combat.filter((e) => e.style !== "miss");
const misses = seen.combat.filter((e) => e.style === "miss");
assert(hits.length === 3, `three landed attacks (got ${hits.length})`);
assert(hits.every((e) => e.damage > 0), "every hit dealt damage");
assert(misses.length >= 1, "Bob's wrong answer registered as a miss");
assert(misses.every((e) => e.damage === 0), "misses deal no damage");

const bobFinalHp = summary.hp[Object.keys(summary.hp).find((id) => id !== aliceId)];
const totalDamage = hits.reduce((s, e) => s + e.damage, 0);
assert(bobFinalHp === Math.max(0, MAX_HP - totalDamage), "HP math adds up");
assert(summary.hp[aliceId] === MAX_HP, "Alice took no damage");

assert(
  seen.aliceResults.filter((r) => r.verdict === "pass" && !r.late).length === 3,
  "Alice got three passing evaluations"
);
const bobResult = seen.bobResults[0];
assert(bobResult && bobResult.verdict === "fail", `Bob's submission failed tests (${bobResult?.verdict})`);
assert(bobResult.tests.length === PROBLEMS[0].tests.length, "Bob saw per-test feedback");

const timings = hits.map((e) => `${e.style} ${e.damage}dmg ${e.execTimeMs}ms x${e.multiplier}`);
console.log(`\ncombat log: ${timings.join(" | ")}`);
console.log(`final HP — Alice: ${summary.hp[aliceId]}, Bob: ${bobFinalHp}`);
console.log("\nPASS: full duel flow works end-to-end");

clearTimeout(watchdog);
alice.close();
bob.close();
httpServer.close();
process.exit(0);
