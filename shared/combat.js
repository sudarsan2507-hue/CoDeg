// Combat rules (docs/mvp_plan.md):
//   correct answer   → attack hits
//   wrong answer     → miss
//   faster execution → more damage
//   lower memory     → defense boost

export const MAX_HP = 100;
export const TOTAL_ROUNDS = 3;
export const COUNTDOWN_MS = 3000;
export const ROUND_BREAK_MS = 4000;
export const SUBMIT_COOLDOWN_MS = 2000;
export const MAX_CODE_LENGTH = 20000;

// If neither fighter has landed a hit after TOTAL_ROUNDS, extra rounds are
// played (cycling back through the problem set) until HP separates them.
export const SUDDEN_DEATH_SECONDS = 90;

// How long a disconnected fighter has to reconnect (same tab losing network,
// or a page refresh) before the match is forfeited to their opponent.
export const RECONNECT_GRACE_MS = 20000;

// Damage multiplier from execution speed: refTimeMs / execTimeMs, clamped.
export const SPEED = {
  MIN_MULT: 0.8,
  MAX_MULT: 1.5,
  RAPID_AT: 1.25, // at or above → "rapid" strike animation
  HEAVY_AT: 0.9 //   at or below → slow "heavy" hit animation
};

// Defense tiers keyed by the defender's peak memory (KB) on their most
// recent completed run. Leaner memory → bigger damage reduction.
export const DEFENSE_TIERS = [
  { maxMemoryKb: 128, reduction: 0.15 },
  { maxMemoryKb: 1024, reduction: 0.08 }
];

export function speedMultiplier(execTimeMs, refTimeMs) {
  if (!execTimeMs || execTimeMs <= 0) return 1;
  const raw = refTimeMs / execTimeMs;
  return Math.min(SPEED.MAX_MULT, Math.max(SPEED.MIN_MULT, raw));
}

export function attackStyle(multiplier) {
  if (multiplier >= SPEED.RAPID_AT) return "rapid";
  if (multiplier <= SPEED.HEAVY_AT) return "heavy";
  return "normal";
}

export function defenseReduction(memoryKb) {
  if (memoryKb == null) return 0;
  for (const tier of DEFENSE_TIERS) {
    if (memoryKb <= tier.maxMemoryKb) return tier.reduction;
  }
  return 0;
}

// A passing submission becomes an attack. Speed scales damage up,
// the defender's memory efficiency scales it back down.
export function computeAttack({ baseDamage, execTimeMs, refTimeMs, defenderMemoryKb }) {
  const multiplier = speedMultiplier(execTimeMs, refTimeMs);
  const defense = defenseReduction(defenderMemoryKb);
  const damage = Math.max(1, Math.round(baseDamage * multiplier * (1 - defense)));
  return { damage, multiplier, defense, style: attackStyle(multiplier) };
}
