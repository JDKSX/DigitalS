/* =================================================================
   Session + player join — JDKS ARENA
   Read-cheap design: a student listens to ONE session doc + their OWN
   player doc. Content (missions/questions) is loaded from static JSON.
   ================================================================= */
import { db, COLL } from './firebase.js';
import { ensureStudentAuth } from './auth.js';
import { loadPack } from './content.js';
import { auth } from './firebase.js';
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp,
  query, where, limit, onSnapshot,
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
/* 4 digits = 10,000 slots. With 120 players in a room the chance that a fresh
   id collides is ~1%, so a student who rejoins almost never has to retry. */
function randomPlayerId() {
  return 'P' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

/** Has this code EVER been used (open or closed)? Room codes are one-time. */
async function codeEverUsed(code) {
  const snap = await getDocs(query(
    collection(db, COLL.sessions), where('code', '==', code.toUpperCase()), limit(1),
  ));
  return !snap.empty;
}

/* ---------- HOST: create a session ---------- */
export async function createSession(hostUid, { title = 'JDKS Arena', demo = false, packId = null, brand = null } = {}) {
  // A room code is single-use: once a code has existed it is never handed out
  // again, so an old code in a student's history can never reach a live room.
  let code = generateSessionCode();
  for (let i = 0; i < 8; i++) {
    if (!(await codeEverUsed(code))) break;
    code = generateSessionCode();
  }
  const ref = doc(collection(db, COLL.sessions));
  const data = {
    code, title, demo,
    packId,                         // which question pack this room plays
    // A snapshot, not a reference: students cannot read teachers/{uid}, and a
    // teacher who rebrands later should not retroactively change old rooms.
    brand: brand || null,
    status: 'open',                 // open | closed
    phase: 'lobby',                 // lobby | mission_intro | question_open | locked | revealed | paused
    currentMission: null,
    currentQuestion: null,
    questionStartAt: null,
    questionDuration: 45,
    showAnswer: false,    // เฉลยคำตอบขึ้นทุกจอ (อิสระจากผลคะแนน)
    showResults: false,   // ผลคะแนน/อันดับขึ้นทุกจอ (อิสระจากเฉลย)
    playersJoined: 0,
    hostUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data);

  // Freeze the pack onto the room. Students cannot read a private pack, so
  // without this they silently fall back to the bundled content and end up
  // answering different questions from the ones the teacher is reading out.
  // If the copy cannot be made the room is useless, so take it back down
  // rather than open a room that plays the wrong game.
  if (packId) {
    try {
      const bundle = await loadPack(packId);
      await setDoc(doc(db, COLL.sessionContent, ref.id), {
        packId,
        hostUid,
        title:    bundle.content.title || '',
        missions: bundle.content.missions || [],
        levels:   bundle.content.levels || [],
        badges:   bundle.content.badges || [],
        xpRules:  bundle.content.xpRules || {},
        questions: bundle.questions || {},
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      await deleteDoc(ref).catch(() => {});
      throw new Error('เปิดห้องไม่สำเร็จ — คัดลอกชุดคำถามมาที่ห้องไม่ได้: ' + ((e && e.message) || e));
    }
  }
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
  if (!session) {
    // Distinguish "never existed" from "already finished" — a student staring
    // at a code the teacher just closed deserves the real reason.
    const used = await codeEverUsed(code).catch(() => false);
    throw new Error(used
      ? 'ห้องนี้จบไปแล้ว — รหัสห้องใช้ได้ครั้งเดียว ขอรหัสใหม่จากครูได้เลย'
      : 'ไม่พบรหัสห้องนี้ ลองตรวจตัวอักษรอีกครั้ง');
  }

  // Allocate a unique Player ID WITHOUT reading other players' docs (privacy
  // rules forbid students reading docs they don't own). Strategy: try to
  // CREATE at a random docId; a collision with someone else's doc becomes an
  // UPDATE and is rejected by the rules → we catch it and retry a new id.
  const player = {
    sessionId: session.id,
    hostUid: session.hostUid || null,   // denormalised so rules stay cheap (see PLATFORM.md)
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

  const stored = { sessionId: session.id, playerId, docId: `${session.id}_${playerId}`, code, hostUid: session.hostUid || null };
  try {
    localStorage.setItem(PLAYER_KEY, JSON.stringify(stored));
    localStorage.setItem('ds-idle-student', String(Date.now())); // fresh idle clock per join
    localStorage.removeItem('ds-answers'); // fresh start — never inherit a previous player's answers
  } catch (_e) {}
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
/** Writes answers/{sessionId_playerId_questionId}. The deterministic id plus
    the immutable rule prevent duplicates. Firestore's disk persistence is off
    (see js/firebase.js), so an offline write is held in memory only while the
    tab stays open — the caller must handle a rejection rather than assume the
    SDK will retry it later. */
export async function submitAnswer(stored, { questionId, missionId, choice, isCorrect, responseMs }) {
  const uid = auth.currentUser && auth.currentUser.uid;
  const ref = doc(db, COLL.answers, `${stored.sessionId}_${stored.playerId}_${questionId}`);
  const data = {
    sessionId: stored.sessionId,
    playerId: stored.playerId,
    hostUid: stored.hostUid || null,
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

/* Host-side list queries MUST filter on hostUid.
   Firestore evaluates a LIST rule against the query's own constraints, not
   against the documents it would return: any field the rule reads but the
   query does not filter simply is not there, and the whole query is denied.
   `users` and `answers` are authorised by hostUid, so every host query below
   carries that filter. (All-equality filters still use the automatic
   single-field indexes — no composite index needed.) */
function hostUid() {
  const u = auth.currentUser;
  if (!u) throw new Error('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบอีกครั้ง');
  return u.uid;
}

/** Every player in a room, read once. Used when exporting scores — the
    host's own rules let them read the player documents of their sessions. */
export async function getPlayers(sessionId) {
  const snap = await getDocs(query(collection(db, COLL.users),
    where('hostUid', '==', hostUid()), where('sessionId', '==', sessionId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** HOST: live list of all players in a session (reads scale with players — host only). */
export function listenPlayers(sessionId, cb, onErr) {
  return onSnapshot(
    query(collection(db, COLL.users),
      where('hostUid', '==', hostUid()), where('sessionId', '==', sessionId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onErr || (() => {}));
}

/** HOST: patch the session state machine (phase, currentMission, …). */
export function updateSession(sessionId, patch) {
  return updateDoc(doc(db, COLL.sessions, sessionId), { ...patch, updatedAt: serverTimestamp() });
}

/** HOST: volatile counts (answeredCount / playersJoined / playersOnline) written
    to a SEPARATE doc so the 120-200 students listening to the session doc are NOT
    charged a read on every count tick. Only the presenter listens to this. */
export function updateStats(sessionId, patch) {
  return setDoc(doc(db, COLL.stats, sessionId), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}
export function listenStats(sessionId, cb, onErr) {
  return onSnapshot(doc(db, COLL.stats, sessionId),
    (snap) => cb(snap.exists() ? snap.data() : {}), onErr || (() => {}));
}

/** HOST: live answers for one question (staff-only read). */
export function listenQuestionAnswers(sessionId, questionId, cb, onErr) {
  return onSnapshot(
    query(collection(db, COLL.answers),
      where('hostUid', '==', hostUid()),
      where('sessionId', '==', sessionId),
      where('questionId', '==', questionId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onErr || (() => {}));
}

/* ---------- HOST: scoring writes (staff-only) ---------- */

/** One-time read of all answers for a question. */
export async function getQuestionAnswersOnce(sessionId, questionId) {
  const snap = await getDocs(query(collection(db, COLL.answers),
    where('hostUid', '==', hostUid()),
    where('sessionId', '==', sessionId), where('questionId', '==', questionId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Unique playerIds who answered any question in a mission. */
export async function getMissionPlayers(sessionId, missionId) {
  const snap = await getDocs(query(collection(db, COLL.answers),
    where('hostUid', '==', hostUid()),
    where('sessionId', '==', sessionId), where('missionId', '==', missionId)));
  return [...new Set(snap.docs.map((d) => d.data().playerId))];
}

/** Apply a batch of per-player updates. updates: [{playerId, xpDelta?, missionId?, badge?, progressDelta?}] */
/**
 * Award XP and mark the question scored in ONE batch.
 *
 * These used to be two separate writes. If the first landed and the second
 * did not, the next snapshot saw an unscored question and awarded the XP
 * again — one network hiccup was enough to double everyone's score.
 * Committing them together makes a retry always safe.
 *
 * @param mark { scoredQuestion, completedMission } — plain ids, so callers
 *             never need to know about Firestore field values.
 */
export async function applyScores(sessionId, updates, mark = null) {
  const marks = {};
  if (mark && mark.scoredQuestion) marks.scoredQuestions = arrayUnion(mark.scoredQuestion);
  if (mark && mark.completedMission) marks.completedMissions = arrayUnion(mark.completedMission);
  const hasMarks = Object.keys(marks).length > 0;
  if (!updates.length && !hasMarks) return;
  const batch = writeBatch(db);
  updates.forEach((u) => {
    const ref = doc(db, COLL.users, `${sessionId}_${u.playerId}`);
    const patch = {};
    if (u.xpDelta) { patch.xp = increment(u.xpDelta); if (u.missionId) patch[`missionScores.${u.missionId}`] = increment(u.xpDelta); }
    if (u.badge) patch.badges = arrayUnion(u.badge);
    if (u.progressDelta) patch.progress = increment(u.progressDelta);
    batch.update(ref, patch);
  });
  if (hasMarks) batch.update(doc(db, COLL.sessions, sessionId), marks);
  await batch.commit();
}

/** Idempotency flags on the session. */

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
  // the host creates these, so the room's hostUid is this user
  const batch = writeBatch(db);
  const bots = [];
  for (let i = 1; i <= n; i++) {
    const pid = 'P' + String(i).padStart(3, '0');
    const ref = doc(db, COLL.users, `${sessionId}_${pid}`);
    batch.set(ref, {
      sessionId, hostUid: uid, playerId: pid, nickname: 'Bot-' + i, room: 'DEMO', authUid: uid,
      xp: 0, level: 1, progress: 0, missionScores: {}, badges: [],
      joinedAt: serverTimestamp(), lastSeen: serverTimestamp(),
    });
    bots.push({ sessionId, playerId: pid, hostUid: uid });
  }
  await batch.commit();
  return bots;
}

/** TEACHER: the rooms I have hosted (newest first). */
export async function listMySessions(hostUid, max = 30) {
  const snap = await getDocs(query(
    collection(db, COLL.sessions),
    where('hostUid', '==', hostUid),
    limit(max),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
}
function ms(t) { return (t && t.toMillis) ? t.toMillis() : 0; }

/* ---------- ADMIN: read & manage (staff-only) ---------- */

export function setSessionStatus(sessionId, status) {
  return updateDoc(doc(db, COLL.sessions, sessionId), { status, updatedAt: serverTimestamp() });
}


