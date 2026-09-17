/* =================================================================
   Scoring — JDKS ARENA (pure functions)
   Correct answers earn a lot, and answering sooner earns more: the
   score slides from the full base down to `minFactor` of it as the
   clock runs out. Wrong answers earn nothing; self-assessment
   questions (no right answer) earn a flat participation score.

   Official XP is computed here and written by the HOST at reveal —
   students can never write their own score.
   ================================================================= */

const DEFAULT_RULES = {
  base: 1000,            // a correct answer, answered instantly
  minFactor: 0.4,        // the slowest correct answer still keeps 40%
  participation: 300,    // self-assessment / opinion questions
  missionComplete: 500,  // bonus for finishing a mission
  assumedLimitMs: 60000, // used when the question has no time limit
};

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const round10 = (n) => Math.round(n / 10) * 10;

/** How much of the base score survives, given how fast the answer came in.
    1.0 at t=0 → minFactor at (and past) the time limit. */
export function speedFactor(responseMs, limitMs, rules = DEFAULT_RULES) {
  const min = rules.minFactor != null ? rules.minFactor : DEFAULT_RULES.minFactor;
  const limit = limitMs && limitMs > 0 ? limitMs : (rules.assumedLimitMs || DEFAULT_RULES.assumedLimitMs);
  const used = clamp01((responseMs || 0) / limit);
  return min + (1 - min) * (1 - used);
}

/** XP awarded to one player for one answer. */
export function xpForAnswer(question, answer, rules = DEFAULT_RULES, limitMs = 0) {
  if (!question || !answer) return 0;
  const r = { ...DEFAULT_RULES, ...(rules || {}) };
  const base = question.xp || r.base;

  // Self-assessment: no right or wrong → everyone who took part scores.
  if (question.type === 'assessment') return round10(r.participation);
  if (!answer.isCorrect) return 0;

  return round10(base * speedFactor(answer.responseMs, limitMs, r));
}

/** Build per-player XP updates for one question from its answers. */
export function scoreQuestionAnswers(question, answers, rules = DEFAULT_RULES, limitMs = 0) {
  return (answers || [])
    .map((a) => ({
      playerId: a.playerId,
      xpDelta: xpForAnswer(question, a, rules, limitMs),
      missionId: question.missionId,
    }))
    .filter((u) => u.xpDelta > 0);
}


export { DEFAULT_RULES };
