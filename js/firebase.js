/* =================================================================
   Firebase init — DIGITAL SURVIVAL
   Uses Firebase JS SDK v10 (modular) via CDN.
   NOTE: This "apiKey" is a PUBLIC client identifier, not a secret.
   It is safe to commit. Real protection comes from Firestore Security
   Rules (firestore.rules) + Firebase Auth — NEVER put the Admin SDK
   service-account key here.
   ================================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// TODO(Phase 3): replace with the real project config from
// Firebase Console → Project settings → Your apps → Web app.
export const firebaseConfig = {
  apiKey: 'AIzaSyBZfvVTRb4g8KRmxDNWNDO_U5Swi4oUbGk',
  authDomain: 'digital-survival-f335f.firebaseapp.com',
  projectId: 'digital-survival-f335f',
  storageBucket: 'digital-survival-f335f.firebasestorage.app',
  messagingSenderId: '999339084319',
  appId: '1:999339084319:web:eff33a805bd07708e9632a',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline persistence (IndexedDB) — supports graceful network failure (§28).
// Single-tab manager keeps writes queued locally and re-syncs on reconnect.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
  });
} catch (_e) {
  db = getFirestore(app); // fallback if persistence unavailable
}
export { db };

// Shared constants
export const COLL = {
  sessions: 'sessions',
  users: 'users',
  answers: 'answers',
  leaderboards: 'leaderboards', // leaderboards/{sessionId}
  settings: 'settings',
};
