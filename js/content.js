/* =================================================================
   Content loader — DIGITAL SURVIVAL
   Loads static JSON once (0 Firestore reads for content) and caches it.
   ================================================================= */
let _cache = null;
let _questions = null;

export async function loadContent() {
  if (_cache) return _cache;
  const res = await fetch('data/missions.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('โหลดเนื้อหาไม่สำเร็จ');
  _cache = await res.json();
  return _cache;
}

/** Load the question bank (data/questions.json). Returns {} if missing. */
export async function loadQuestions() {
  if (_questions) return _questions;
  try {
    const res = await fetch('data/questions.json', { cache: 'no-cache' });
    _questions = res.ok ? (await res.json()).questions || {} : {};
  } catch (_e) { _questions = {}; }
  return _questions;
}

export function questionById(questions, id) {
  return (questions && questions[id]) || null;
}

/** How many questions a mission has (by <missionId>_q<n> ids). */
export function questionCount(questions, missionId) {
  if (!questions) return 0;
  let n = 0;
  while (questions[`${missionId}_q${n + 1}`]) n++;
  return n;
}

export function levelForXp(levels, xp) {
  let cur = levels[0];
  for (const l of levels) if (xp >= l.minXp) cur = l;
  return cur;
}

export function missionById(content, id) {
  return content.missions.find((m) => m.id === id) || null;
}
export function badgeById(content, id) {
  return content.badges.find((b) => b.id === id) || null;
}
