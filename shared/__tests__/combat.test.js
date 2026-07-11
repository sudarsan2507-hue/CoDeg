import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPEED,
  DEFENSE_TIERS,
  speedMultiplier,
  attackStyle,
  defenseReduction,
  computeAttack
} from "../combat.js";

test("speedMultiplier clamps to [MIN_MULT, MAX_MULT]", () => {
  assert.equal(speedMultiplier(1000, 10), SPEED.MIN_MULT); // execTimeMs way over refTimeMs -> slow -> floor
  assert.equal(speedMultiplier(1, 1000), SPEED.MAX_MULT); // execTimeMs way under refTimeMs -> fast -> ceiling
});

test("speedMultiplier is refTimeMs / execTimeMs within the clamp range", () => {
  assert.equal(speedMultiplier(10, 12), 1.2);
});

test("speedMultiplier treats zero/undefined execution time as neutral (1x)", () => {
  assert.equal(speedMultiplier(0, 10), 1);
  assert.equal(speedMultiplier(undefined, 10), 1);
  assert.equal(speedMultiplier(-5, 10), 1);
});

test("attackStyle buckets at the documented thresholds", () => {
  assert.equal(attackStyle(SPEED.RAPID_AT), "rapid");
  assert.equal(attackStyle(SPEED.RAPID_AT + 0.1), "rapid");
  assert.equal(attackStyle(SPEED.HEAVY_AT), "heavy");
  assert.equal(attackStyle(SPEED.HEAVY_AT - 0.1), "heavy");
  assert.equal(attackStyle((SPEED.RAPID_AT + SPEED.HEAVY_AT) / 2), "normal");
});

test("defenseReduction returns 0 for null/undefined memory (no reading yet)", () => {
  assert.equal(defenseReduction(null), 0);
  assert.equal(defenseReduction(undefined), 0);
});

test("defenseReduction picks the tightest matching tier", () => {
  const [tight, loose] = DEFENSE_TIERS;
  assert.equal(defenseReduction(tight.maxMemoryKb), tight.reduction);
  assert.equal(defenseReduction(tight.maxMemoryKb + 1), loose.reduction);
  assert.equal(defenseReduction(loose.maxMemoryKb + 1), 0);
});

test("computeAttack never deals less than 1 damage even against max defense", () => {
  const { damage } = computeAttack({
    baseDamage: 1,
    execTimeMs: 1000, // slow -> MIN_MULT
    refTimeMs: 1,
    defenderMemoryKb: 1 // max defense tier
  });
  assert.ok(damage >= 1);
});

test("computeAttack: faster than reference deals more damage than slower", () => {
  const fast = computeAttack({ baseDamage: 30, execTimeMs: 5, refTimeMs: 10, defenderMemoryKb: null });
  const slow = computeAttack({ baseDamage: 30, execTimeMs: 40, refTimeMs: 10, defenderMemoryKb: null });
  assert.ok(fast.damage > slow.damage);
  assert.equal(fast.style, "rapid");
  assert.equal(slow.style, "heavy");
});

test("computeAttack: leaner defender memory reduces damage taken", () => {
  const vsLean = computeAttack({ baseDamage: 40, execTimeMs: 10, refTimeMs: 10, defenderMemoryKb: 64 });
  const vsHeavy = computeAttack({ baseDamage: 40, execTimeMs: 10, refTimeMs: 10, defenderMemoryKb: 5000 });
  assert.ok(vsLean.damage < vsHeavy.damage);
});
