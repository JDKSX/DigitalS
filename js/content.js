/* =================================================================
   Content loader — JDKS ARENA
   A game's content comes from ONE pack document (packs/{packId}), so a
   screen pays exactly one read and then serves everything from cache.
   Sessions created before packs existed (packId == null) fall back to the
   bundled JSON files, so old rooms keep working.
   ================================================================= */
import { db, COLL } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const _packs = Object.create(null);   // packId    -> { content, questions }
const _rooms = Object.create(null);   // sessionId -> { content, questions }
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

/** A room's frozen copy of its pack (cached for the life of the page). */
export async function loadSessionContent(sessionId) {
  if (_rooms[sessionId]) return _rooms[sessionId];
  const snap = await getDoc(doc(db, COLL.sessionContent, sessionId));
  if (!snap.exists()) throw new Error('ห้องนี้ยังไม่มีสำเนาชุดคำถาม');
  const bundle = bundleFromPack({ id: snap.data().packId || null, ...snap.data() });
  _rooms[sessionId] = bundle;
  return bundle;
}

/** Everything a screen needs for one game: { content, questions }.
 *
 *  The room's own copy comes first and is what every screen must use: a
 *  teacher's pack is private, so students cannot read packs/{packId} at
 *  all, and a host reading the pack while students read something else is
 *  how the two ends end up playing different games. Falling back to the
 *  pack keeps rooms opened before snapshots existed working, and the
 *  bundled content keeps the very first Digital Literacy rooms working.
 *
 *  Never rejects — a screen can always render something rather than hang.
 */
export async function loadGame(packId, sessionId = null) {
  if (sessionId) {
    try { return await loadSessionContent(sessionId); }
    catch (_e) { /* old room, or the snapshot never landed → try the pack */ }
  }
  if (packId) {
    try { return await loadPack(packId); }
    catch (_e) { /* pack unreadable (deleted / not ours) → fall back */ }
  }
  return loadLegacy();
}

/* Legacy helpers: bundled content only (no pack). Kept for sessions created
   before packs existed; game screens should call loadGame(packId) instead. */

/* ---------------- pure helpers (unchanged API) ---------------- */

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

export function badgeById(content, id) {
  return ((content && content.badges) || []).find((b) => b.id === id) || null;
}
