/* =================================================================
   Auth — JDKS ARENA (platform)
   Students : Anonymous auth (no personal data).
   Teachers : Email + Password, self-serve sign-up. A profile doc
              teachers/{uid} is created on sign-up (and self-healed on
              login) — that doc is what marks an account as a teacher.
   Platform admin : optional staff/{uid} = { role: 'admin' } created by
              the platform owner in the Firebase console.
   ================================================================= */
import { auth, db } from './firebase.js';
import {
  signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, updateProfile, signOut,
  onAuthStateChanged, setPersistence,
  browserLocalPersistence, browserSessionPersistence, inMemoryPersistence,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// iOS Safari FIX: the anonymous student session must survive the index → student
// page navigation (and refresh). Firebase Auth's DEFAULT store is IndexedDB, which
// iOS Safari (ITP / Private mode) frequently blocks — the session is then lost on
// the next page and Firestore reads are denied, leaving students stuck on
// "กำลังเชื่อมต่อ" with an empty passport. localStorage is far more reliable on iOS,
// so we pin persistence to it (with graceful fallbacks). Called BEFORE any
// sign-in / auth restore so the same store is read and written.
let _persistenceReady = null;
export function ensureLocalPersistence() {
  if (_persistenceReady) return _persistenceReady;
  _persistenceReady = (async () => {
    for (const p of [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]) {
      try { await setPersistence(auth, p); return; } catch (_e) { /* try next */ }
    }
  })();
  return _persistenceReady;
}
// Backwards-compatible alias used by the student page.
export const ensureStudentPersistence = ensureLocalPersistence;

/** Ensure the student is signed in anonymously; returns the user. */
export async function ensureStudentAuth() {
  await ensureLocalPersistence();
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

/* ---------------- teacher accounts ---------------- */

/** Read the teacher profile for a uid, or null. */
export async function getTeacher(uid) {
  try {
    const snap = await getDoc(doc(db, 'teachers', uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
  } catch (_e) { return null; }
}

/** Create the teachers/{uid} profile if it is missing (self-healing). */
export async function ensureTeacherProfile(user, extra = {}) {
  const existing = await getTeacher(user.uid);
  if (existing) return existing;
  const profile = {
    email: user.email || '',
    displayName: extra.displayName || user.displayName || (user.email || '').split('@')[0],
    org: extra.org || '',
    brand: { appName: '', accent: '', logoUrl: '' },
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'teachers', user.uid), profile);
  return { uid: user.uid, ...profile };
}

/** Self-serve sign-up for a teacher. Creates the account + profile. */
export async function signUpTeacher(email, password, displayName = '', org = '') {
  email = (email || '').trim();
  displayName = (displayName || '').trim();
  if (!email) throw new Error('กรุณากรอกอีเมล');
  if (!password || password.length < 6) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
  if (displayName.length < 2) throw new Error('กรุณากรอกชื่อผู้สอนอย่างน้อย 2 ตัวอักษร');
  await ensureLocalPersistence();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  try { if (displayName) await updateProfile(cred.user, { displayName }); } catch (_e) {}
  let teacher;
  try {
    teacher = await ensureTeacherProfile(cred.user, { displayName, org });
  } catch (e) {
    // The account now exists but its profile could not be written. Almost always
    // this means the Firestore rules are missing the teachers/{uid} block.
    const err = new Error('สร้างบัญชีแล้ว แต่บันทึกโปรไฟล์ผู้สอนไม่ได้ (สิทธิ์ไม่พอ) — ผู้ดูแลระบบต้องอัปเดต Firestore Rules ให้รองรับ teachers/{uid} · จากนั้นกด “เข้าสู่ระบบ” ด้วยอีเมลเดิมได้เลย');
    err.code = 'jx/profile-write-failed';
    throw err;
  }
  try { localStorage.setItem('ds-idle-staff', String(Date.now())); } catch (_e) {}
  return { user: cred.user, teacher, role: 'teacher' };
}

/** Send a password-reset email. */
export async function resetPassword(email) {
  email = (email || '').trim();
  if (!email) throw new Error('กรุณากรอกอีเมลก่อน');
  await sendPasswordResetEmail(auth, email);
}

/** Teacher / admin login with email + password.
    Any email account may sign in; the teacher profile is created on first
    login if missing, so a partially-completed sign-up self-heals. */
export async function signInStaff(email, password) {
  await ensureLocalPersistence();
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const role = await getRole(cred.user.uid);           // platform admin (optional)
  let teacher = await getTeacher(cred.user.uid);
  if (!teacher) {
    try { teacher = await ensureTeacherProfile(cred.user); }
    catch (_e) {
      await signOut(auth);
      throw new Error('เข้าสู่ระบบไม่สำเร็จ: สร้างโปรไฟล์ผู้สอนไม่ได้ กรุณาลองใหม่');
    }
  }
  try { localStorage.setItem('ds-idle-staff', String(Date.now())); } catch (_e) {} // fresh idle clock
  return { user: cred.user, teacher, role: role || 'teacher' };
}

export function signOutUser() { return signOut(auth); }

/** Platform-admin role from staff/{uid}, or null. Teachers are NOT staff. */
export async function getRole(uid) {
  try {
    const snap = await getDoc(doc(db, 'staff', uid));
    return snap.exists() ? (snap.data().role || null) : null;
  } catch (_e) { return null; }
}

/** Subscribe to auth state. cb receives (user | null). */
export function onAuth(cb) { return onAuthStateChanged(auth, cb); }

/** Friendly Thai messages for common Firebase auth errors. */
export function authErrorTh(err) {
  const c = err && err.code ? err.code : '';
  const map = {
    'auth/invalid-email': 'อีเมลไม่ถูกต้อง',
    'auth/user-not-found': 'ไม่พบบัญชีนี้',
    'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
    'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/too-many-requests': 'พยายามหลายครั้งเกินไป กรุณารอสักครู่',
    'auth/network-request-failed': 'เชื่อมต่อเครือข่ายไม่ได้',
    'auth/email-already-in-use': 'อีเมลนี้มีบัญชีอยู่แล้ว — กดเข้าสู่ระบบแทน',
    'auth/weak-password': 'รหัสผ่านสั้นเกินไป (อย่างน้อย 6 ตัวอักษร)',
    'auth/operation-not-allowed': 'ยังไม่ได้เปิดการสมัครด้วยอีเมลใน Firebase Console',
    'auth/missing-password': 'กรุณากรอกรหัสผ่าน',
  };
  return map[c] || (err && err.message) || 'เกิดข้อผิดพลาด';
}
