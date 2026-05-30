/**
 * Do you have brains - Scoring Engine
 * ------------------------------------------------------------------
 * A single, transparent place where every point is earned. The model
 * is multiplicative so each axis (speed, difficulty, streak, chaos)
 * meaningfully compounds without any one of them dominating.
 *
 *   roundScore = (BASE + speedBonus) × difficulty × streak × chaos
 *
 *  BASE .............. flat reward for a correct deduction (100)
 *  speedBonus ........ up to +50% of BASE, linear in time left
 *  difficulty ........ 1.00 → 1.90, scales with premise count (2 → 8)
 *  streak ............ 1.00 → 2.00, +0.10 per consecutive hit (cap 10)
 *  chaos ............. 1.00 → 2.10, sum of active modifier weights
 *
 * A wrong answer or timeout scores 0 and resets the streak — the real
 * penalty is the lost multiplier, never a negative balance. The server
 * mirrors this ceiling (≈1197/round, padded to 1400) to reject forged
 * submissions, so the client and database always agree on what is
 * physically achievable.
 */
const Scoring = (() => {
  const BASE = 100;
  const MAX_SPEED_BONUS = 0.5;   // fraction of BASE awarded for an instant answer
  const PREMISE_BASE = 2;        // easiest puzzle size
  const PREMISE_STEP = 0.15;     // difficulty added per premise above PREMISE_BASE
  const STREAK_STEP = 0.10;      // multiplier added per consecutive correct
  const STREAK_CAP = 10;         // streak length where the bonus tops out

  // Each modifier makes a round genuinely harder, so each adds to the chaos
  // multiplier. Weights roughly track how much extra cognitive load they impose.
  const MOD_WEIGHTS = {
    gibberish: 0.25,  // strips familiar names → pure structural reasoning
    stroop:    0.15,  // colour interference
    negation:  0.30   // double-negative phrasing
    // panic is handled separately because it also shrinks the time window
  };
  const PANIC_WEIGHT = 0.40;

  /** Clamp helper. */
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /**
   * Score a single round.
   * @param {object} o
   * @param {boolean} o.correct        was the answer right?
   * @param {number}  o.timeRemaining  seconds left when answered
   * @param {number}  o.maxTime        round length in seconds
   * @param {number}  o.premises       number of premises in the puzzle
   * @param {number}  o.streakAfter    streak length INCLUDING this round
   * @param {object}  o.modifiers      { gibberish, stroop, negation, panic }
   * @returns {number} integer points (0 if wrong/timeout)
   */
  function roundScore(o) {
    if (!o || !o.correct) return 0;

    const speedFrac = clamp((o.timeRemaining || 0) / (o.maxTime || 1), 0, 1);
    const speedBonus = BASE * MAX_SPEED_BONUS * speedFrac;

    const premises = Math.max(PREMISE_BASE, o.premises || PREMISE_BASE);
    const difficultyMult = 1 + (premises - PREMISE_BASE) * PREMISE_STEP;

    const streakMult = 1 + clamp(o.streakAfter || 0, 0, STREAK_CAP) * STREAK_STEP;

    const mods = o.modifiers || {};
    let chaos = 0;
    for (const key in MOD_WEIGHTS) if (mods[key]) chaos += MOD_WEIGHTS[key];
    if (mods.panic) chaos += PANIC_WEIGHT;
    const chaosMult = 1 + chaos;

    return Math.round((BASE + speedBonus) * difficultyMult * streakMult * chaosMult);
  }

  /**
   * Build a tidy breakdown for UI feedback ("+340  ×2.0 streak ×1.6 chaos").
   */
  function breakdown(o) {
    const premises = Math.max(PREMISE_BASE, o.premises || PREMISE_BASE);
    const mods = o.modifiers || {};
    let chaos = 0;
    for (const key in MOD_WEIGHTS) if (mods[key]) chaos += MOD_WEIGHTS[key];
    if (mods.panic) chaos += PANIC_WEIGHT;
    return {
      total: roundScore(o),
      speedMult: 1 + MAX_SPEED_BONUS * clamp((o.timeRemaining || 0) / (o.maxTime || 1), 0, 1),
      difficultyMult: 1 + (premises - PREMISE_BASE) * PREMISE_STEP,
      streakMult: 1 + clamp(o.streakAfter || 0, 0, STREAK_CAP) * STREAK_STEP,
      chaosMult: 1 + chaos
    };
  }

  /** Session accuracy as a 0–100 percentage. */
  function accuracy(correct, wrong) {
    const total = (correct || 0) + (wrong || 0);
    return total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;
  }

  /** The per-round ceiling, exposed for tests / sanity checks. */
  function perRoundCeiling() {
    // (BASE + max speed) × max difficulty × max streak × max chaos
    const maxChaos = 1 + MOD_WEIGHTS.gibberish + MOD_WEIGHTS.stroop +
      MOD_WEIGHTS.negation + PANIC_WEIGHT;
    const maxDifficulty = 1 + (8 - PREMISE_BASE) * PREMISE_STEP;
    const maxStreak = 1 + STREAK_CAP * STREAK_STEP;
    return Math.round(BASE * (1 + MAX_SPEED_BONUS) * maxDifficulty * maxStreak * maxChaos);
  }

  return { roundScore, breakdown, accuracy, perRoundCeiling, BASE, MOD_WEIGHTS, PANIC_WEIGHT };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Scoring;
} else {
  window.Scoring = Scoring;
}
