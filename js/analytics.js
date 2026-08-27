/* =================================================================
   Analytics — DIGITAL SURVIVAL (pure computation, §32)
   Computes post-activity stats from users + answers + content.
   ================================================================= */
import { levelForXp } from './content.js';

export function computeAnalytics(users, answers, content, questions) {
  const missions = (content.missions || []).filter((m) => m.id !== 'boss');
  const total = users.length;
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  const avgXp = total ? Math.round(sum(users.map((u) => u.xp || 0)) / total) : 0;
  const missionScoreTotal = (u) => sum(Object.values(u.missionScores || {}));
  const avgScore = total ? Math.round(sum(users.map(missionScoreTotal)) / total) : 0;
  const completed = users.filter((u) => (u.progress || 0) >= missions.length).length;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  // per-question
  const byQ = {};
  answers.forEach((a) => {
    const s = byQ[a.questionId] = byQ[a.questionId] || { count: 0, correct: 0, ms: 0, opts: {} };
    s.count++; if (a.isCorrect) s.correct++; s.ms += a.responseMs || 0;
    if (typeof a.choice === 'string') s.opts[a.choice] = (s.opts[a.choice] || 0) + 1;
  });
  const questionStats = Object.keys(byQ).map((qid) => {
    const s = byQ[qid]; const q = questions[qid];
    return { qid, missionId: q ? q.missionId : '', type: q ? q.type : '', count: s.count,
      correctPct: s.count ? Math.round((s.correct / s.count) * 100) : 0,
      avgMs: s.count ? Math.round(s.ms / s.count) : 0, opts: s.opts, correct: q ? q.correct : null };
  }).sort((a, b) => a.qid.localeCompare(b.qid));

  const missionStats = missions.map((m) => {
    const qs = questionStats.filter((x) => x.missionId === m.id);
    const gradable = qs.filter((x) => x.type !== 'assessment');
    const correctPct = gradable.length ? Math.round(sum(gradable.map((x) => x.correctPct)) / gradable.length) : null;
    const avgScore2 = total ? Math.round(sum(users.map((u) => (u.missionScores && u.missionScores[m.id]) || 0)) / total) : 0;
    return { id: m.id, titleTh: m.titleTh, correctPct, avgScore: avgScore2, answered: qs.reduce((a, x) => a + x.count, 0) };
  });

  const scored = missionStats.filter((x) => x.correctPct != null);
  const lowestMission = scored.length ? scored.reduce((a, b) => (b.correctPct < a.correctPct ? b : a)) : null;
  const gradableQ = questionStats.filter((x) => x.type !== 'assessment');
  const hardestQ = gradableQ.length ? gradableQ.reduce((a, b) => (b.correctPct < a.correctPct ? b : a)) : null;

  return { total, avgXp, avgScore, completionRate, completed, missionStats, questionStats, lowestMission, hardestQ };
}

export function levelName(content, xp) {
  const lv = levelForXp(content.levels || [{ level: 1, nameTh: 'มือใหม่ดิจิทัล', minXp: 0 }], xp || 0);
  return lv ? `${lv.level} · ${lv.nameTh || lv.name}` : '1';
}
