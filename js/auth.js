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
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// NOTE: Firebase Web Auth already persists the session locally (IndexedDB)
// across refreshes by default. We deliberately do NOT call setPersistence()
// here — doing so at module load switched the store to localStorage and lost
// the existing IndexedDB session, forcing a re-login on every refresh.

/** Ensure the student is signed in anonymously; returns the user. */
export async function ensureStudentAuth() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

/** Staff (host/admin) login with email + password. */
export async function signInStaff(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const role = await getRole(cred.user.uid);
  if (!role) {
    await signOut(auth);
    throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์ (ไม่พบข้อมูลใน staff)');
  }
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
