/* =================================================================
   Session + player join — DIGITAL SURVIVAL
   Read-cheap design: a student listens to ONE session doc + their OWN
   player doc. Content (missions/questions) is loaded from static JSON.
   ================================================================= */
import { db, COLL } from './firebase.js';
import { ensureStudentAuth } from './auth.js';
import { auth } from './firebase.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp,
  query, where, limit, orderBy, onSnapshot, deleteField,
  writeBatch, increment, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PLAYER_KEY = 'ds-player';

/* ---------- codes / ids ---------- */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
export function generateSessionCode(len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}
function randomPlayerId() {
  return 'P' + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

/* ---------- HOST: create a session ---------- */
export async function createSession(hostUid, { title = 'DIGITAL SURVIVAL', demo = false } = {}) {
  // find an unused code
  let code;
  for (let i = 0; i < 6; i++) {
    code = generateSessionCode();
    const found = await findSessionByCode(code);
    if (!found) break;
  }
  const ref = doc(collection(db, COLL.sessions));
  const data = {
    code, title, demo,
    status: 'open',                 // open | closed
    phase: 'lobby',                 // lobby | mission_intro | question_open | locked | revealed | paused
    currentMission: null,
    currentQuestion: null,
    questionStartAt: null,
    questionDuration: 30,
    playersJoined: 0,
    hostUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  return { id: ref.id, ...data };
}

/** Find an OPEN session by its code, or null. */
export async function findSessionByCode(code) {
  const q = query(
    collection(db, COLL.sessions),
    where('code', '==', code.toUpperCase()),
    where('status', '==', 'open'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/* ---------- STUDENT: join ---------- */
export async function joinSession(code, nickname, room = '') {
  nickname = (nickname || '').trim();
  code = (code || '').trim().toUpperCase();
  if (nickname.length < 2) throw new Error('กรุณากรอกชื่อเล่นอย่างน้อย 2 ตัวอักษร');

  await ensureStudentAuth();
  const uid = auth.currentUser.uid;

  const session = await findSessionByCode(code);
  if (!session) throw new Error('ไม่พบรหัสห้อง หรือห้องปิดแล้ว');

  // Allocate a unique Player ID WITHOUT reading other players' docs (privacy
  // rules forbid students reading docs they don't own). Strategy: try to
  // CREATE at a random docId; a collision with someone else's doc becomes an
  // UPDATE and is rejected by the rules → we catch it and retry a new id.
  const player = {
    sessionId: session.id,
    nickname,
    room: room.trim(),
    authUid: uid,
    xp: 0,
    level: 1,
    progress: 0,
    missionScores: {},
    badges: [],
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  };

  let playerId = null;
  for (let i = 0; i < 15; i++) {
    const pid = randomPlayerId();
    const ref = doc(db, COLL.users, `${session.id}_${pid}`);
    try {
      await setDoc(ref, { ...player, playerId: pid }, { merge: false });
      playerId = pid;
      break;
    } catch (_e) {
      // permission-denied → id taken by someone else, or transient → retry
    }
  }
  if (!playerId) throw new Error('เข้าร่วมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');

  const stored = { sessionId: session.id, playerId, docId: `${session.id}_${playerId}`, code };
  try { localStorage.setItem(PLAYER_KEY, JSON.stringify(stored)); } catch (_e) {}
  return { ...stored, nickname, room };
}

/* ---------- STUDENT: resume / presence ---------- */
export function getStoredPlayer() {
  try { return JSON.parse(localStorage.getItem(PLAYER_KEY) || 'null'); } catch (_e) { return null; }
}
export function clearStoredPlayer() {
  try { localStorage.removeItem(PLAYER_KEY); } catch (_e) {}
}
export async function touchPresence(docId) {
  try { await updateDoc(doc(db, COLL.users, docId), { lastSeen: serverTimestamp() }); } catch (_e) {}
}

/* ---------- STUDENT: submit an answer (write-once) ---------- */
/** Writes answers/{sessionId_playerId_questionId}. Deterministic id +
    immutable rule prevent duplicates. Works offline (queued by persistence). */
export async function submitAnswer(stored, { questionId, missionId, choice, isCorrect, responseMs }) {
  const uid = auth.currentUser && auth.currentUser.uid;
  const ref = doc(db, COLL.answers, `${stored.sessionId}_${stored.playerId}_${questionId}`);
  const data = {
    sessionId: stored.sessionId,
    playerId: stored.playerId,
    questionId, missionId,
    choice,
    isCorrect: !!isCorrect,
    responseMs: responseMs || 0,
    authUid: uid,
    submittedAt: serverTimestamp(),
  };
  await setDoc(ref, data); // create; rule forbids overwrite
  return data;
}

/* ---------- Listeners (real-time, one doc each) ---------- */
export function listenSession(sessionId, cb, onErr) {
  return onSnapshot(doc(db, COLL.sessions, sessionId),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onErr || (() => {}));
}
export function listenPlayer(docId, cb, onErr) {
  return onSnapshot(doc(db, COLL.users, docId),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onErr || (() => {}));
}

/** HOST: live list of all players in a session (reads scale with players — host only). */
export function listenPlayers(sessionId, cb, onErr) {
  return onSnapshot(
    query(collection(db, COLL.users), where('sessionId', '==', sessionId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onErr || (() => {}));
}

/** HOST: patch the session state machine (phase, currentMission, …). */
export function updateSession(sessionId, patch) {
  return updateDoc(doc(db, COLL.sessions, sessionId), { ...patch, updatedAt: serverTimestamp() });
}

/** HOST: live answers for one question (staff-only read). */
export function listenQuestionAnswers(sessionId, questionId, cb, onErr) {
  return onSnapshot(
    query(collection(db, COLL.answers),
      where('sessionId', '==', sessionId),
      where('questionId', '==', questionId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onErr || (() => {}));
}

/* ---------- HOST: scoring writes (staff-only) ---------- */

/** One-time read of all answers for a question. */
export async function getQuestionAnswersOnce(sessionId, questionId) {
  const snap = await getDocs(query(collection(db, COLL.answers),
    where('sessionId', '==', sessionId), where('questionId', '==', questionId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Unique playerIds who answered any question in a mission. */
export async function getMissionPlayers(sessionId, missionId) {
  const snap = await getDocs(query(collection(db, COLL.answers),
    where('sessionId', '==', sessionId), where('missionId', '==', missionId)));
  return [...new Set(snap.docs.map((d) => d.data().playerId))];
}

/** Apply a batch of per-player updates. updates: [{playerId, xpDelta?, missionId?, badge?, progressDelta?}] */
export async function applyScores(sessionId, updates) {
  if (!updates.length) return;
  const batch = writeBatch(db);
  updates.forEach((u) => {
    const ref = doc(db, COLL.users, `${sessionId}_${u.playerId}`);
    const patch = {};
    if (u.xpDelta) { patch.xp = increment(u.xpDelta); if (u.missionId) patch[`missionScores.${u.missionId}`] = increment(u.xpDelta); }
    if (u.badge) patch.badges = arrayUnion(u.badge);
    if (u.progressDelta) patch.progress = increment(u.progressDelta);
    batch.update(ref, patch);
  });
  await batch.commit();
}

/** Idempotency flags on the session. */
export function markScored(sessionId, questionId) {
  return updateDoc(doc(db, COLL.sessions, sessionId), { scoredQuestions: arrayUnion(questionId) });
}
export function markMissionComplete(sessionId, missionId) {
  return updateDoc(doc(db, COLL.sessions, sessionId), { completedMissions: arrayUnion(missionId) });
}

/** Leaderboard doc — top-N with NO private data (nickname/playerId/xp only). */
export function writeLeaderboard(sessionId, top) {
  return setDoc(doc(db, COLL.leaderboards, sessionId), { top, updatedAt: serverTimestamp() });
}
export function listenLeaderboard(sessionId, cb, onErr) {
  return onSnapshot(doc(db, COLL.leaderboards, sessionId),
    (snap) => cb(snap.exists() ? (snap.data().top || []) : []), onErr || (() => {}));
}

/* ---------- DEMO MODE (host simulates players — §40) ---------- */
/** Create N bot players owned by the host (authUid = host uid). */
export async function createDemoPlayers(sessionId, n = 10) {
  const uid = auth.currentUser && auth.currentUser.uid;
  const batch = writeBatch(db);
  const bots = [];
  for (let i = 1; i <= n; i++) {
    const pid = 'P' + String(i).padStart(3, '0');
    const ref = doc(db, COLL.users, `${sessionId}_${pid}`);
    batch.set(ref, {
      sessionId, playerId: pid, nickname: 'Bot-' + i, room: 'DEMO', authUid: uid,
      xp: 0, level: 1, progress: 0, missionScores: {}, badges: [],
      joinedAt: serverTimestamp(), lastSeen: serverTimestamp(),
    });
    bots.push({ sessionId, playerId: pid });
  }
  await batch.commit();
  return bots;
}

/* ---------- ADMIN: read & manage (staff-only) ---------- */
export async function getSessions() {
  const snap = await getDocs(query(collection(db, COLL.sessions), orderBy('createdAt', 'desc'), limit(60)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function getSessionUsers(sessionId) {
  const snap = await getDocs(query(collection(db, COLL.users), where('sessionId', '==', sessionId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function getSessionAnswers(sessionId) {
  const snap = await getDocs(query(collection(db, COLL.answers), where('sessionId', '==', sessionId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
/** ADMIN: save editable content to Firestore (settings/{name}) so edits go
    live instantly without re-uploading files. Read by content.js. */
export function saveSettings(name, data) {
  return setDoc(doc(db, COLL.settings, name), { data, updatedAt: serverTimestamp() });
}
export async function getSettings(name) {
  const snap = await getDoc(doc(db, COLL.settings, name));
  return snap.exists() ? snap.data().data : null;
}

export function setSessionStatus(sessionId, status) {
  return updateDoc(doc(db, COLL.sessions, sessionId), { status, updatedAt: serverTimestamp() });
}
export function archiveSession(sessionId, archived = true) {
  return updateDoc(doc(db, COLL.sessions, sessionId), { archived, status: archived ? 'closed' : 'open', updatedAt: serverTimestamp() });
}

export { deleteField };
