/* =================================================================
   Login / sign-up page — JDKS ARENA
   A real page (not a modal) so teachers can bookmark it, so the browser
   password manager behaves, and so every "เข้าสู่ระบบ" button anywhere
   in the platform has one destination.

   URL params:  ?mode=signup   open on the sign-up tab
                ?next=host.html?pack=abc   where to go after success
   ================================================================= */
import { signInStaff, signUpTeacher, resetPassword, authErrorTh, onAuth } from './auth.js';
import { icon } from './icons.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

/* Only ever bounce to a page inside this app. */
function safeNext() {
  const raw = params.get('next') || '';
  if (!raw || /^(https?:)?\/\//i.test(raw) || raw.startsWith('/')) return 'teacher.html';
  return raw;
}
const NEXT = safeNext();

const el = {
  form: $('#lgForm'), name: $('#lgName'), org: $('#lgOrg'), email: $('#lgEmail'), pass: $('#lgPass'),
  err: $('#lgErr'), ok: $('#lgOk'), go: $('#lgGo'), title: $('#lgTitle'), sub: $('#lgSub'),
};
let mode = params.get('mode') === 'signup' ? 'signup' : 'login';

/* ---------------- mode switch ---------------- */
function setMode(next, { keepMsg = false } = {}) {
  mode = next;
  document.querySelectorAll('#lgTabs .jx-auth__tab')
    .forEach((t) => t.classList.toggle('is-on', t.dataset.tab === next));
  document.querySelectorAll('[data-only]').forEach((n) => { n.hidden = n.dataset.only !== next; });

  const signup = next === 'signup';
  el.title.textContent = signup ? 'สร้างบัญชีผู้สอน' : 'ยินดีต้อนรับกลับ';
  el.sub.textContent = signup
    ? 'ฟรี ไม่มีค่าใช้จ่าย — สร้างชุดคำถามของคุณเองแล้วเปิดห้องได้ทันที'
    : 'เข้าสู่ระบบเพื่อจัดการชุดคำถามและเปิดห้องเรียน';
  el.go.textContent = signup ? 'สมัครใช้งานฟรี' : 'เข้าสู่ระบบ';
  el.pass.autocomplete = signup ? 'new-password' : 'current-password';
  el.pass.placeholder = signup ? 'ตั้งรหัสผ่าน อย่างน้อย 6 ตัวอักษร' : 'รหัสผ่านของคุณ';
  if (!keepMsg) { el.err.hidden = true; el.ok.hidden = true; }

  const url = new URL(location.href);
  if (signup) url.searchParams.set('mode', 'signup'); else url.searchParams.delete('mode');
  history.replaceState(null, '', url);
}

/* ---------------- messages ---------------- */
function fail(e) {
  el.ok.hidden = true;
  el.go.disabled = false;
  el.go.textContent = mode === 'signup' ? 'สมัครใช้งานฟรี' : 'เข้าสู่ระบบ';
  el.err.hidden = false;
  el.err.textContent = authErrorTh(e);
  el.err.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  try { console.error('[JDKS Arena auth]', (e && e.code) || '(no code)', (e && e.message) || e); } catch (_e) {}
}
function say(msg) { el.err.hidden = true; el.ok.hidden = false; el.ok.textContent = msg; }

/* ---------------- submit ---------------- */
async function submit(ev) {
  if (ev) ev.preventDefault();
  el.err.hidden = true; el.ok.hidden = true;
  el.go.disabled = true;
  el.go.textContent = mode === 'signup' ? 'กำลังสมัคร…' : 'กำลังเข้าสู่ระบบ…';
  try {
    if (mode === 'signup') await signUpTeacher(el.email.value, el.pass.value, el.name.value, el.org.value);
    else await signInStaff(el.email.value, el.pass.value);
    el.go.textContent = 'สำเร็จ! กำลังพาไป…';
    location.replace(NEXT);
  } catch (e) { fail(e); }
}

el.form.addEventListener('submit', submit);
document.querySelectorAll('#lgTabs .jx-auth__tab')
  .forEach((t) => t.addEventListener('click', () => { setMode(t.dataset.tab); (t.dataset.tab === 'signup' ? el.name : el.email).focus(); }));

$('#lgForgot').addEventListener('click', async () => {
  const btn = $('#lgForgot');
  btn.disabled = true;
  try {
    await resetPassword(el.email.value);
    say('ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว — ตรวจกล่องจดหมาย (และ Junk)');
  } catch (e) { fail(e); }
  finally { btn.disabled = false; }
});

$('#lgEye').addEventListener('click', () => {
  const show = el.pass.type === 'password';
  el.pass.type = show ? 'text' : 'password';
  $('#lgEye').innerHTML = icon(show ? 'eyeOff' : 'eye');
  el.pass.focus();
});

/* Already signed in? Don't make them type again. */
onAuth((user) => {
  if (!user || user.isAnonymous) return;
  say('คุณเข้าสู่ระบบอยู่แล้ว — กำลังพาไปหน้าถัดไป…');
  setTimeout(() => location.replace(NEXT), 700);
});

setMode(mode, { keepMsg: true });
(mode === 'signup' ? el.name : el.email).focus();
