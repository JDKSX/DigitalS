/* =================================================================
   Content loader — JDKS ARENA
   A game's content comes from ONE pack document (packs/{packId}), so a
   screen pays exactly one read and then serves everything from cache.
   Sessions created before packs existed (packId == null) fall back to the
   bundled JSON files, so old rooms keep working.
   ================================================================= */
import { db, COLL } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const _packs = Object.create(null);   // packId -> { content, questions }
let _legacy = null;                   // bundled-JSON fallback

function bundleFromPack(p) {
  return {
    content: {
      missions: p.missions || [],
      levels: p.levels || [],
      badges: p.badges || [],
      xpRules: p.xpRules || {},
      title: p.title || '',
      packId: p.id || null,
    },
    questions: p.questions || {},
  };
}

/** Read one pack (cached for the life of the page). */
export async function loadPack(packId) {
  if (_packs[packId]) return _packs[packId];
  const snap = await getDoc(doc(db, COLL.packs, packId));
  if (!snap.exists()) throw new Error('ไม่พบชุดคำถามของห้องนี้');
  const bundle = bundleFromPack({ id: snap.id, ...snap.data() });
  _packs[packId] = bundle;
  return bundle;
}

/** Bundled Digital Literacy content — used when a session has no packId. */
async function loadLegacy() {
  if (_legacy) return _legacy;
  const [m, q] = await Promise.all([
    fetch('data/missions.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({})),
    fetch('data/questions.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({})),
  ]);
  _legacy = {
    content: {
      missions: m.missions || [], levels: m.levels || [],
      badges: m.badges || [], xpRules: m.xpRules || {},
      title: 'เอาตัวรอดในโลกดิจิทัล', packId: null,
    },
    questions: q.questions || {},
  };
  return _legacy;
}

/** Everything a screen needs for one game: { content, questions }.
    Never rejects — falls back to the bundled content so a screen can
    always render something rather than hanging. */
export async function loadGame(packId) {
  if (packId) {
    try { return await loadPack(packId); }
    catch (_e) { /* pack unreadable (deleted / no access) → fall back */ }
  }
  return loadLegacy();
}

/* Legacy helpers: bundled content only (no pack). The old admin page still
   uses these; game screens should call loadGame(packId) instead. */
export async function loadContent() { return (await loadLegacy()).content; }
export async function loadQuestions() { return (await loadLegacy()).questions; }

/* ---------------- pure helpers (unchanged API) ---------------- */
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
  let cur = (levels && levels[0]) || null;
  (levels || []).forEach((l) => { if (xp >= l.minXp) cur = l; });
  return cur;
}

export function missionById(content, id) {
  return ((content && content.missions) || []).find((m) => m.id === id) || null;
}
export function badgeById(content, id) {
  return ((content && content.badges) || []).find((b) => b.id === id) || null;
}
