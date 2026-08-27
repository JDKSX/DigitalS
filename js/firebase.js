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
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Web app config (public identifiers — safe to commit).
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

// Firestore with the default in-memory cache. We deliberately do NOT enable
// IndexedDB persistence: on some iOS Safari devices it can hang Firestore
// operations (students got stuck on "connecting"). Login/resume still works
// because that relies on Firebase AUTH persistence, which is separate.
export const db = getFirestore(app);

// Shared constants
export const COLL = {
  sessions: 'sessions',
  users: 'users',
  answers: 'answers',
  leaderboards: 'leaderboards', // leaderboards/{sessionId}
  settings: 'settings',
};
