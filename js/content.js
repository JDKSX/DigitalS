/* =================================================================
   Content loader — DIGITAL SURVIVAL
   Loads static JSON once (0 Firestore reads for content) and caches it.
   ================================================================= */
import { db } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let _cache = null;
let _questions = null;

export async function loadContent() {
  if (_cache) return _cache;
  const res = await fetch('data/missions.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('โหลดเนื้อหาไม่สำเร็จ');
  _cache = await res.json();
  return _cache;
}

/** Load the question bank. Prefers an in-app override saved to Firestore
    (settings/questions), falling back to the static data/questions.json.
    This lets Admin edit questions in-app and have them take effect live. */
export async function loadQuestions() {
  if (_questions) return _questions;
  try {
    const snap = await getDoc(doc(db, 'settings', 'questions'));
    if (snap.exists() && snap.data() && snap.data().data) { _questions = snap.data().data; return _questions; }
  } catch (_e) { /* not signed in yet / offline → fall back to file */ }
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
