/* =================================================================
   Auth — DIGITAL SURVIVAL
   Students : Anonymous auth (no personal data).
   Host/Admin : Email + Password auth. Role comes from a Firestore
                doc  staff/{uid} = { role: "host" | "admin" }  which
                an admin creates by hand in the console (see README).
   ================================================================= */
import { auth, db } from './firebase.js';
import {
  signInAnonymously, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, setPersistence,
  browserLocalPersistence, browserSessionPersistence, inMemoryPersistence,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// iOS Safari FIX: the anonymous student session must survive the index → student
// page navigation (and refresh). Firebase Auth's DEFAULT store is IndexedDB, which
// iOS Safari (ITP / Private mode) frequently blocks — the session is then lost on
// the next page and Firestore reads are denied, leaving students stuck on
// "กำลังเชื่อมต่อ" with an empty passport. localStorage is far more reliable on iOS,
// so we pin persistence to it (with graceful fallbacks). Called on EVERY student
// page BEFORE any sign-in / auth restore so the same store is read and written.
// Staff pages never call this, so their IndexedDB session is unaffected.
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

/** Staff (host/admin) login with email + password. */
export async function signInStaff(email, password) {
  // Persist the staff session in localStorage so a Hard Refresh does not force
  // a re-login (default IndexedDB can be cleared/blocked on some browsers).
  await ensureLocalPersistence();
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const role = await getRole(cred.user.uid);
  if (!role) {
    await signOut(auth);
    throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์ (ไม่พบข้อมูลใน staff)');
  }
  try { localStorage.setItem('ds-idle-staff', String(Date.now())); } catch (_e) {} // fresh idle clock on login
  return { user: cred.user, role };
}

export function signOutUser() { return signOut(auth); }

/** Read the staff role for a uid, or null if not staff. */
export async function getRole(uid) {
  try {
    const snap = await getDoc(doc(db, 'staff', uid));
    return snap.exists() ? (snap.data().role || null) : null;
  } catch (_e) { return null; }
}

/** Subscribe to auth state. cb receives (user | null). */
export function onAuth(cb) { return onAuthStateChanged(auth, cb); }

/** Friendly Thai messages for common Firebase auth errors (§37). */
export function authErrorTh(err) {
  const c = err && err.code ? err.code : '';
  const map = {
    'auth/invalid-email': 'อีเมลไม่ถูกต้อง',
    'auth/user-not-found': 'ไม่พบบัญชีนี้',
    'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
    'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/too-many-requests': 'พยายามหลายครั้งเกินไป กรุณารอสักครู่',
    'auth/network-request-failed': 'เชื่อมต่อเครือข่ายไม่ได้',
  };
  return map[c] || (err && err.message) || 'เกิดข้อผิดพลาด';
}
