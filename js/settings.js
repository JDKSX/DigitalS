/* =================================================================
   Brand settings — JDKS ARENA
   The teacher picks a name, an accent and a mark; the preview beside
   the form shows what a student will actually see. Saving writes only
   the brand block of teachers/{uid}; rooms already open keep the brand
   they were created with.
   ================================================================= */
import { onAuth, getTeacher, ensureTeacherProfile, updateTeacherBrand } from './auth.js';
import { loginUrl } from './topbar.js';
import { ACCENTS, MARKS, blankBrand, cleanBrand, markHtml, applyBrand } from './branding.js';
import { mascot } from './mascot.js';
import { dxConfirm, toast } from './dialog.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { uid: null, brand: blankBrand(), saved: blankBrand() };

/* Look at this page on localhost without signing in (?preview=1).
   Saving is disabled, so it is only ever a visual check. */
const PREVIEW = location.hostname === 'localhost' && new URLSearchParams(location.search).get('preview') === '1';

/* ---------------- boot ---------------- */
onAuth(async (user) => {
  if (PREVIEW && (!user || user.isAnonymous)) { bootPreview(); return; }
  if (!user || user.isAnonymous) { location.replace(loginUrl('login', 'settings.html')); return; }
  state.uid = user.uid;
  const teacher = (await getTeacher(user.uid)) || (await ensureTeacherProfile(user).catch(() => null));
  state.brand = cleanBrand((teacher && teacher.brand) || {});
  state.saved = { ...state.brand };

  $('#loading').hidden = true;
  $('#form').hidden = false;
  buildSwatches();
  buildMarks();
  $('#bName').value = state.brand.appName;
  $('#bLogo').value = state.brand.logoUrl;
  if (state.brand.logoUrl) $('.st-adv').open = true;
  paint();
});

/* ---------------- controls ---------------- */
function buildSwatches() {
  $('#bAccent').innerHTML = ACCENTS.map((a) => `
    <button type="button" class="st-sw" data-accent="${a.id}" title="${esc(a.nameTh)}"
      aria-label="${esc(a.nameTh)}" style="--sw:${a.c};--sw-d:${a.d}"><i></i></button>`).join('');
  $('#bAccent').querySelectorAll('[data-accent]').forEach((b) => b.addEventListener('click', () => {
    // clicking the active colour clears it, so "no choice" stays reachable
    state.brand.accent = state.brand.accent === b.dataset.accent ? '' : b.dataset.accent;
    paint();
  }));
}

function buildMarks() {
  $('#bMark').innerHTML = MARKS.map((m) => `
    <button type="button" class="st-mark" data-mark="${m}" aria-label="${m}">${mascot(m, { size: 46 })}</button>`).join('');
  $('#bMark').querySelectorAll('[data-mark]').forEach((b) => b.addEventListener('click', () => {
    state.brand.mark = state.brand.mark === b.dataset.mark ? '' : b.dataset.mark;
    paint();
  }));
}

$('#bName').addEventListener('input', (e) => { state.brand.appName = e.target.value; paint(); });
$('#bLogo').addEventListener('input', (e) => { state.brand.logoUrl = e.target.value; paint(); });

/* ---------------- preview ---------------- */
function paint() {
  const b = cleanBrand(state.brand);
  const accent = ACCENTS.find((a) => a.id === b.accent);

  $('#bAccent').querySelectorAll('[data-accent]')
    .forEach((el) => el.classList.toggle('is-on', el.dataset.accent === b.accent));
  $('#bMark').querySelectorAll('[data-mark]')
    .forEach((el) => el.classList.toggle('is-on', el.dataset.mark === b.mark));

  const name = b.appName || 'JDKS <b>Arena</b>';
  $('#pvName').innerHTML = b.appName ? esc(b.appName) : name;

  const mark = markHtml(b, 40);
  $('#pvMark').innerHTML = mark || 'JA';
  $('#pvMark').classList.toggle('is-plain', !!mark);

  const c = accent ? accent.c : '';
  const d = accent ? accent.d : '';
  ['#pvMark', '#pvChip', '#pvBtn'].forEach((sel) => {
    const el = $(sel);
    el.style.removeProperty('background');
    el.style.removeProperty('box-shadow');
    if (!c) return;
    if (sel === '#pvMark' && mark) return;      // a logo keeps its own colours
    el.style.background = c;
    el.style.boxShadow = `0 3px 0 ${d}`;
  });
  $('#save').disabled = JSON.stringify(b) === JSON.stringify(cleanBrand(state.saved));
}

/* ---------------- save ---------------- */
$('#save').addEventListener('click', async () => {
  const btn = $('#save');
  const b = cleanBrand(state.brand);
  if (state.brand.logoUrl && !b.logoUrl) {
    toast('ลิงก์โลโก้ต้องขึ้นต้นด้วย https:// เท่านั้น', 'error');
    return;
  }
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    await updateTeacherBrand(state.uid, b);
    state.saved = { ...b };
    applyBrand(b);                       // show it on this page immediately
    toast('บันทึกแบรนด์แล้ว — ห้องที่เปิดหลังจากนี้จะใช้ชุดนี้', 'success');
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + ((e && e.message) || e), 'error');
  } finally {
    btn.textContent = 'บันทึกแบรนด์';
    paint();
  }
});

$('#reset').addEventListener('click', async () => {
  const ok = await dxConfirm({
    title: 'ล้างแบรนด์ทั้งหมด?',
    message: 'จอของนักเรียนจะกลับไปใช้ชื่อและสีของ JDKS Arena ตามเดิม',
    ok: 'ล้างแบรนด์', cancel: 'ยกเลิก', danger: true,
  });
  if (!ok) return;
  state.brand = blankBrand();
  $('#bName').value = ''; $('#bLogo').value = '';
  paint();
  $('#save').disabled = false;
});

function bootPreview() {
  state.uid = null;
  state.brand = blankBrand();
  state.saved = { ...state.brand };
  $('#loading').hidden = true;
  $('#form').hidden = false;
  buildSwatches(); buildMarks(); paint();
  $('#save').disabled = true;
  $('#save').textContent = 'บันทึกไม่ได้ในโหมดพรีวิว';
}
