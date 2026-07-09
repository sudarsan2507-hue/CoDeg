// MVP problem set: one duel = three rounds, easy → medium → hard.
// Tests stay server-side; only statement/examples/starter go to the client.

function bigOrbs() {
  return Array.from({ length: 50000 }, (_, i) => i);
}

function bigPrices() {
  // Deterministic pseudo-random walk, exact in JS and Python alike.
  return Array.from({ length: 60000 }, (_, i) => (i * 7919) % 10007);
}

function maxProfit(prices) {
  let min = Infinity;
  let best = 0;
  for (const p of prices) {
    if (p < min) min = p;
    else if (p - min > best) best = p - min;
  }
  return best;
}

function minCrystals(crystals, target) {
  const dp = new Array(target + 1).fill(Infinity);
  dp[0] = 0;
  for (let t = 1; t <= target; t++) {
    for (const c of crystals) {
      if (c <= t && dp[t - c] + 1 < dp[t]) dp[t] = dp[t - c] + 1;
    }
  }
  return dp[target] === Infinity ? -1 : dp[target];
}

export const PROBLEMS = [
  {
    id: "charge-up",
    title: "Charge Up",
    difficulty: "easy",
    functionName: "charge",
    baseDamage: 25,
    refTimeMs: 6,
    timeLimitMs: 6000,
    roundSeconds: 240,
    statement:
      "Your fighter absorbs a row of energy orbs before striking.\n\n" +
      "Given a list of integers `orbs` (each orb's energy, possibly negative),\n" +
      "return the total energy absorbed.\n\n" +
      "Constraints: 0 <= len(orbs) <= 50_000, -10^6 <= orbs[i] <= 10^6.\n" +
      "Return the value — don't print it.",
    starter: "def charge(orbs):\n    # return the total energy\n    pass\n",
    exampleCount: 2,
    tests: [
      { input: [[5, 10, 15]], expected: 30 },
      { input: [[42]], expected: 42 },
      { input: [[]], expected: 0 },
      { input: [[-5, 20, -15]], expected: 0 },
      { input: [[7, -7, 7, -7, 7]], expected: 7 },
      { input: [[1000000, 2000000, 3000000]], expected: 6000000 },
      { input: [bigOrbs()], expected: (49999 * 50000) / 2 }
    ],
    reference: "def charge(orbs):\n    return sum(orbs)\n"
  },
  {
    id: "perfect-strike",
    title: "Perfect Strike",
    difficulty: "medium",
    functionName: "perfect_strike",
    baseDamage: 35,
    refTimeMs: 25,
    timeLimitMs: 10000,
    roundSeconds: 360,
    statement:
      "Your enemy's guard fluctuates. You may charge once and strike once after.\n\n" +
      "Given a list of integers `guard` (guard level at each moment), pick one\n" +
      "moment to lock on and a LATER moment to strike. Your damage is\n" +
      "strike_level - lockon_level. Return the maximum damage possible, or 0 if\n" +
      "no positive damage exists.\n\n" +
      "Constraints: 0 <= len(guard) <= 60_000. An O(n^2) scan will be too slow\n" +
      "and your attack will time out.\n" +
      "Return the value — don't print it.",
    starter: "def perfect_strike(guard):\n    # max(strike - lockon) with strike after lockon, else 0\n    pass\n",
    exampleCount: 2,
    tests: [
      { input: [[7, 1, 5, 3, 6, 4]], expected: 5 },
      { input: [[7, 6, 4, 3, 1]], expected: 0 },
      { input: [[2, 10]], expected: 8 },
      { input: [[]], expected: 0 },
      { input: [[5]], expected: 0 },
      { input: [[3, 3, 3, 3]], expected: 0 },
      { input: [[2, 4, 1, 7]], expected: 6 },
      { input: [bigPrices()], expected: maxProfit(bigPrices()) }
    ],
    reference:
      "def perfect_strike(guard):\n" +
      "    best = 0\n" +
      "    low = None\n" +
      "    for g in guard:\n" +
      "        if low is None or g < low:\n" +
      "            low = g\n" +
      "        elif g - low > best:\n" +
      "            best = g - low\n" +
      "    return best\n"
  },
  {
    id: "mana-forge",
    title: "Mana Forge",
    difficulty: "hard",
    functionName: "mana_forge",
    baseDamage: 50,
    refTimeMs: 60,
    timeLimitMs: 10000,
    roundSeconds: 480,
    statement:
      "The forge builds your finishing move from mana crystals.\n\n" +
      "Given a list of distinct crystal sizes `crystals` (unlimited supply of\n" +
      "each) and an integer `target`, return the MINIMUM number of crystals\n" +
      "whose sizes sum exactly to `target`. Return -1 if it's impossible.\n" +
      "target == 0 needs 0 crystals.\n\n" +
      "Constraints: 1 <= len(crystals) <= 12, 1 <= crystals[i] <= 10^4,\n" +
      "0 <= target <= 10_000. Greedy picking fails some cases — think DP.\n" +
      "Return the value — don't print it.",
    starter: "def mana_forge(crystals, target):\n    # minimum crystals summing to target, or -1\n    pass\n",
    exampleCount: 2,
    tests: [
      { input: [[1, 3, 4], 6], expected: 2 },
      { input: [[2], 3], expected: -1 },
      { input: [[1], 0], expected: 0 },
      { input: [[5, 10, 25], 30], expected: 2 },
      { input: [[7, 11], 13], expected: -1 },
      { input: [[3, 7], 12], expected: 4 },
      { input: [[1, 2, 5], 11], expected: 3 },
      { input: [[1, 5, 12, 19, 37], 8000], expected: minCrystals([1, 5, 12, 19, 37], 8000) }
    ],
    reference:
      "def mana_forge(crystals, target):\n" +
      "    INF = float('inf')\n" +
      "    dp = [0] + [INF] * target\n" +
      "    for t in range(1, target + 1):\n" +
      "        for c in crystals:\n" +
      "            if c <= t and dp[t - c] + 1 < dp[t]:\n" +
      "                dp[t] = dp[t - c] + 1\n" +
      "    return -1 if dp[target] == INF else dp[target]\n"
  }
];

// Client-safe view: statement, starter and the first `exampleCount` tests only.
export function publicProblem(problem, index) {
  return {
    id: problem.id,
    index,
    title: problem.title,
    difficulty: problem.difficulty,
    functionName: problem.functionName,
    statement: problem.statement,
    starter: problem.starter,
    baseDamage: problem.baseDamage,
    roundSeconds: problem.roundSeconds,
    examples: problem.tests.slice(0, problem.exampleCount).map((t) => ({
      call: `${problem.functionName}(${t.input.map((arg) => JSON.stringify(arg)).join(", ")})`,
      expected: JSON.stringify(t.expected)
    }))
  };
}
