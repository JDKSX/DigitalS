/* =================================================================
   Scoring logic — DIGITAL SURVIVAL (pure functions)
   Official XP is computed here and written by the HOST at reveal
   (students cannot write XP — §27/§38). Speed is weighted low on
   purpose so quality of decision drives the score (§10).
   ================================================================= */

const DEFAULT_RULES = {
  correct: 100, fastBonus: 20, fastBonusWithinMs: 8000,
  missionComplete: 100, criticalThinking: 200, finalBoss: 500,
};

/** XP awarded to one player for one answer. */
export function xpForAnswer(question, answer, rules = DEFAULT_RULES) {
  if (!question || !answer) return 0;
  const base = question.xp || rules.correct || 100;
  // Self-assessment: no right/wrong → participation XP.
  if (question.type === 'assessment') return base;
  if (!answer.isCorrect) return 0;
  let xp = base;
  if ((answer.responseMs || Infinity) <= (rules.fastBonusWithinMs || 8000)) xp += (rules.fastBonus || 20);
  return xp;
}

/** Build per-player XP updates for a question from its answers. */
export function scoreQuestionAnswers(question, answers, rules = DEFAULT_RULES) {
  return answers
    .map((a) => ({ playerId: a.playerId, xpDelta: xpForAnswer(question, a, rules), missionId: question.missionId }))
    .filter((u) => u.xpDelta > 0);
}

export { DEFAULT_RULES };
