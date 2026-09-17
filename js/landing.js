/* =================================================================
   Landing page — JDKS ARENA
   Two doors: students join with a room code, teachers sign in / sign up.
   ================================================================= */
import { openJoin } from './join.js';
import { loginUrl } from './topbar.js';
import { onAuth } from './auth.js';

const $ = (s) => document.querySelector(s);

/* ---- student: join by code ---- */
const code = $('#joinCode');
const go = $('#joinGo');
function join() {
  const v = (code.value || '').trim().toUpperCase();
  if (v.length < 4) { code.focus(); code.classList.add('is-err'); setTimeout(() => code.classList.remove('is-err'), 900); return; }
  openJoin(v);
}
if (go) go.addEventListener('click', join);
if (code) {
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  code.addEventListener('input', () => { code.value = code.value.toUpperCase(); });
}

/* ---- teacher: sign in / sign up (own page now, not a modal) ---- */
const door = (mode) => () => { location.href = loginUrl(mode, 'teacher.html'); };
const lg = $('#loginBtn'); if (lg) lg.addEventListener('click', door('login'));
const su = $('#signupBtn'); if (su) su.addEventListener('click', door('signup'));

/* Already signed in? The CTA turns into a shortcut to the console. */
onAuth((user) => {
  if (!user || user.isAnonymous) return;
  if (su) { su.textContent = 'ไปที่แผงของฉัน'; su.onclick = () => { location.href = 'teacher.html'; }; }
  if (lg) lg.hidden = true;
});
