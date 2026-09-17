/* =================================================================
   Question packs — JDKS ARENA
   A "pack" is one complete, self-contained game: its missions, levels,
   badges, XP rules and questions live in a single document so loading a
   game costs exactly ONE read. Packs are owned by a teacher and may be
   published so other teachers can copy them.
   ================================================================= */
import { db, COLL } from './firebase.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, limit, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/** Default scaffolding for a brand-new, empty pack. */
export function blankPack(ownerUid, ownerName = '', over = {}) {
  return {
    ownerUid,
    ownerName,
    title: 'ชุดคำถามใหม่',
    subject: '',
    description: '',
    visibility: 'private',
    missions: [],
    levels: [
      { level: 1, nameTh: 'มือใหม่', name: 'Rookie', minXp: 0 },
      { level: 2, nameTh: 'ผู้เรียนรู้', name: 'Learner', minXp: 3000 },
      { level: 3, nameTh: 'ผู้เชี่ยวชาญ', name: 'Expert', minXp: 7000 },
      { level: 4, nameTh: 'ผู้พิชิต', name: 'Champion', minXp: 12000 },
      { level: 5, nameTh: 'แชมป์สนาม', name: 'Arena Champion', minXp: 18000 },
    ],
    badges: [],
    xpRules: { base: 1000, minFactor: 0.4, participation: 300, missionComplete: 500 },
    questions: {},
    questionCount: 0,
    missionCount: 0,
    forkedFrom: null,
    ...over,
  };
}

function counts(pack) {
  return {
    questionCount: Object.keys(pack.questions || {}).length,
    missionCount: (pack.missions || []).length,
  };
}

/* ---------------- read ---------------- */

export async function getPack(packId) {
  const snap = await getDoc(doc(db, COLL.packs, packId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Packs owned by one teacher (newest first). */
export async function listMyPacks(ownerUid) {
  const snap = await getDocs(query(
    collection(db, COLL.packs),
    where('ownerUid', '==', ownerUid),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
}

/** Published packs anyone can copy. */
export async function listPublicPacks(max = 40) {
  const snap = await getDocs(query(
    collection(db, COLL.packs),
    where('visibility', '==', 'public'),
    limit(max),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
}
function ms(t) { return (t && t.toMillis) ? t.toMillis() : 0; }

/* ---------------- write ---------------- */

export async function createPack(ownerUid, ownerName, over = {}) {
  const ref = doc(collection(db, COLL.packs));
  const pack = blankPack(ownerUid, ownerName, over);
  const data = { ...pack, ...counts(pack), createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await setDoc(ref, data);
  return { id: ref.id, ...data };
}

/** Patch a pack. Counts are recomputed when content changes. */
export async function updatePack(packId, patch) {
  const body = { ...patch, updatedAt: serverTimestamp() };
  if (patch.questions || patch.missions) {
    const current = await getPack(packId);
    const merged = { ...current, ...patch };
    Object.assign(body, counts(merged));
  }
  await updateDoc(doc(db, COLL.packs, packId), body);
}

export function deletePack(packId) {
  return deleteDoc(doc(db, COLL.packs, packId));
}

export function setVisibility(packId, visibility) {
  return updateDoc(doc(db, COLL.packs, packId), { visibility, updatedAt: serverTimestamp() });
}

/** Copy someone else's (public) pack into my account so I can edit it. */
export async function forkPack(packId, ownerUid, ownerName) {
  const src = await getPack(packId);
  if (!src) throw new Error('ไม่พบชุดคำถามนี้');
  const { id, createdAt, updatedAt, ownerUid: _o, ownerName: _n, visibility: _v, ...rest } = src;
  return createPack(ownerUid, ownerName, {
    ...rest,
    title: `${src.title} (สำเนา)`,
    visibility: 'private',
    forkedFrom: packId,
  });
}

/* ---------------- starter content ---------------- */

/** Build a pack from the bundled JSON files (the original Digital Literacy
    game) so a new teacher has something complete to try and remix. */
export async function starterPackData() {
  const [m, q] = await Promise.all([
    fetch('data/missions.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('data/questions.json', { cache: 'no-cache' }).then((r) => r.json()),
  ]);
  return {
    title: 'เอาตัวรอดในโลกดิจิทัล',
    subject: 'Digital Literacy',
    description: '8 ภารกิจ + บอสสุดท้าย ฝึกคิด ตัดสินใจ และรับผิดชอบบนโลกออนไลน์ (ชุดตัวอย่างพร้อมใช้ แก้ต่อได้)',
    missions: m.missions || [],
    levels: m.levels || [],
    badges: m.badges || [],
    xpRules: m.xpRules || {},
    questions: q.questions || {},
  };
}
