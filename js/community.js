/* =================================================================
   Community library — JDKS ARENA
   Every pack a teacher has published, open to everyone. A visitor can
   play any of them solo without creating an account (anonymous auth is
   enough to read a public pack); an account is only needed to make or
   host your own.
   ================================================================= */
import { ensureStudentAuth, onAuth, getTeacher } from './auth.js';
import { listPublicPacks } from './packs.js';
import { mascot, hydrateMascots } from './mascot.js';
import { loginUrl } from './topbar.js';
import { icon } from './icons.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ART = ['owl', 'rocket', 'brain', 'book', 'star', 'shield', 'medal', 'clock', 'trophy', 'bolt'];
const TONE = ['violet', 'teal', 'pink', 'gold', 'sky', 'lime'];
/** Stable per-pack artwork, so a teacher's pack always looks like itself. */
function artFor(id) {
  let h = 0;
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) >>> 0;
  return { kind: ART[h % ART.length], tone: TONE[(h >> 3) % TONE.length] };
}

const state = { packs: [], loaded: false, filter: '', teacher: null, uid: null, busy: false, error: '' };

/* Always-available sample game: the bundled Digital Literacy pack. It needs no
   database at all, so the library is never an empty room. */
const DEMO = {
  id: 'demo', demo: true,
  title: 'เอาตัวรอดในโลกดิจิทัล (ชุดตัวอย่าง)',
  subject: 'Digital Literacy',
  description: '8 ภารกิจ + บอสสุดท้าย ฝึกคิด ตัดสินใจ และรับผิดชอบบนโลกออนไลน์ — ชุดพร้อมเล่นจากทีม JDKS',
  ownerName: 'JDKS Arena', missionCount: 9, questionCount: 23,
};

/* ---------------- boot ---------------- */
(async function main() {
  try { await ensureStudentAuth(); }      // anonymous — enough to read public packs
  catch (_e) { return fail('เชื่อมต่อไม่ได้', 'ลองรีเฟรชหน้านี้อีกครั้ง หรือตรวจสอบอินเทอร์เน็ต'); }

  try { state.packs = await listPublicPacks(60); }
  catch (e) {
    state.packs = [];
    state.error = (e && e.code === 'permission-denied')
      ? 'ยังเปิดคลังสาธารณะไม่ได้ในตอนนี้ — ระหว่างนี้ลองเล่นชุดตัวอย่างด้านล่างได้เลย'
      : ('โหลดคลังไม่สำเร็จ: ' + ((e && e.message) || e));
    try { console.error('[JDKS Arena library]', e); } catch (_e) {}
  }

  state.loaded = true;
  render();
})();

/* Teachers get an extra "คัดลอกไปแก้" action once their profile is known. */
onAuth(async (user) => {
  if (!user || user.isAnonymous) { state.teacher = null; state.uid = null; render(); return; }
  state.uid = user.uid;
  state.teacher = await getTeacher(user.uid);
  render();
});

/* ---------------- render ---------------- */
function visible() {
  const all = [DEMO, ...state.packs];
  const f = state.filter.trim().toLowerCase();
  if (!f) return all;
  return all.filter((p) => [p.title, p.subject, p.description, p.ownerName]
    .some((v) => String(v || '').toLowerCase().includes(f)));
}

function render() {
  if (!state.loaded) return;            // keep the loading card until packs arrive
  const list = $('#list');
  const items = visible();
  $('#count').textContent = `${items.length} เกม`;

  if (!items.length) {
    list.innerHTML = `<div class="jx-empty">${mascot('brain', { size: 110 })}
      <h2>ไม่พบเกมที่ค้นหา</h2><p>ลองคำอื่น หรือล้างช่องค้นหาเพื่อดูทั้งหมด</p></div>`;
    return;
  }

  list.innerHTML = `${state.error ? `<div class="ds-alert ds-alert--warn" style="margin-bottom:18px"><span>ℹ︎</span><div>${esc(state.error)}</div></div>` : ''}
    <div class="jx-grid jx-grid--3">${items.map(card).join('')}</div>`;
  hydrateMascots(list);
  wire();
}

function card(p) {
  const a = p.demo ? { kind: 'shield', tone: 'violet' } : artFor(p.id);
  const mine = state.uid && p.ownerUid === state.uid;
  return `<article class="jx-card jx-game">
    <div class="jx-game__art" data-tone="${a.tone}">
      <span data-mascot="${a.kind}" data-size="96" data-tone="${a.tone}"></span>
    </div>
    <h2 class="jx-pack__title">${esc(p.title)}</h2>
    ${p.subject ? `<div class="jx-pack__subject">${esc(p.subject)}</div>` : ''}
    ${p.description ? `<p class="jx-pack__desc">${esc(p.description)}</p>` : ''}
    <div class="jx-pack__meta">
      ${p.demo ? `<span class="jx-chip jx-chip--live">${icon('star')} ชุดตัวอย่าง</span>` : ''}
      <span class="jx-chip">${icon('book')} ${p.missionCount || 0} ภารกิจ</span>
      <span class="jx-chip">${icon('question')} ${p.questionCount || 0} คำถาม</span>
      ${p.ownerName ? `<span class="jx-chip">${icon('teacher')} ${esc(p.ownerName)}</span>` : ''}
    </div>
    <div class="jx-pack__acts">
      <a class="ds-btn ds-btn--primary" href="play.html?pack=${encodeURIComponent(p.id)}">เล่นคนเดียว</a>
      ${p.demo
        ? `<a class="ds-btn ds-btn--cyan" href="${hostHref(p.id)}">เปิดห้องให้ทั้งชั้น</a>`
        : mine
          ? `<a class="ds-btn ds-btn--ghost" href="editor.html?pack=${encodeURIComponent(p.id)}">แก้ไขชุดของฉัน</a>`
          : `<a class="ds-btn ds-btn--cyan" href="${hostHref(p.id)}">เปิดห้องให้ทั้งชั้น</a>`}
    </div>
  </article>`;
}

/** Where "เปิดห้องให้ทั้งชั้น" goes: straight to the host console for teachers,
    through the login page for anyone else. The pack stays the author's — it is
    played as published, never copied. */
function hostHref(packId) {
  const target = `host.html?pack=${encodeURIComponent(packId)}`;
  return state.teacher ? target : loginUrl('login', target);
}

function wire() { /* cards are plain links now */ }

function fail(title, sub) {
  $('#list').innerHTML = `<div class="jx-empty">${mascot('clock', { size: 110 })}
    <h2>${esc(title)}</h2><p>${esc(sub)}</p></div>`;
}

/* ---------------- search ---------------- */
$('#q').addEventListener('input', (e) => { state.filter = e.target.value; render(); });
