/* =================================================================
   Pack editor — JDKS ARENA
   Edit one pack end to end: its details, its missions, and every
   question inside them. Everything is edited in memory and written back
   as ONE document on save.
   ================================================================= */
import { onAuth, getTeacher, ensureTeacherProfile } from './auth.js';
import { loginUrl } from './topbar.js';
import { getPack, updatePack } from './packs.js';
import { createQuestionEditor } from './qforms.js';
import { hydrateIcons, icon } from './icons.js';
import { startIdleTimer } from './idle.js';
import { dxConfirm, toast } from './dialog.js';

const $ = (s) => document.querySelector(s);
const packId = new URLSearchParams(location.search).get('pack');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TYPES = [
  ['scenario', 'เลือกคำตอบ (สถานการณ์)'],
  ['investigation', 'สืบสวน (มีหลักฐาน)'],
  ['dragsort', 'จับคู่ลงกล่อง'],
  ['ordering', 'เรียงลำดับ'],
  ['assessment', 'ประเมินตนเอง (ไม่มีถูกผิด)'],
];
const ICONS = ['shield', 'search', 'users', 'lock', 'chat', 'balance', 'cpu', 'trophy', 'network', 'eye'];

const state = { user: null, pack: null, dirty: false, qEditors: {} };

/* Read-only look at this page on localhost (?preview=1) — no sign-in, and
   saving is disabled, so it is only ever a visual check. */
const PREVIEW = location.hostname === 'localhost' && new URLSearchParams(location.search).get('preview') === '1';

/* ---------------- boot ---------------- */
onAuth(async (user) => {
  if (PREVIEW && (!user || user.isAnonymous)) { bootPreview(); return; }
  if (!user || user.isAnonymous) { location.replace(loginUrl('login')); return; }
  state.user = user;
  await (getTeacher(user.uid).then((t) => t || ensureTeacherProfile(user)).catch(() => null));
  startIdleTimer({ key: 'ds-idle-staff', minutes: 60, onIdle: () => { location.href = 'index.html'; } });

  if (!packId) return fail('ไม่พบชุดคำถาม', 'เปิดหน้านี้จากปุ่ม “แก้ไข” ในแผงของคุณ');
  let pack;
  try { pack = await getPack(packId); }
  catch (e) { return fail('เปิดชุดนี้ไม่ได้', e.message || String(e)); }
  if (!pack) return fail('ไม่พบชุดคำถาม', 'อาจถูกลบไปแล้ว');
  if (!PREVIEW && pack.ownerUid !== user.uid) return fail('แก้ไขไม่ได้',
    'ชุดนี้เป็นของครูคนอื่น คุณนำไปเปิดห้องเล่นได้เลยจากคลังเกม แต่แก้ไขต้นฉบับของเขาไม่ได้');

  pack.missions = pack.missions || [];
  pack.questions = pack.questions || {};
  state.pack = pack;
  render();
});

function fail(title, sub) {
  $('#main').innerHTML = `<div class="jx-empty"><div class="jx-empty__ic">${icon('alert')}</div><h3>${esc(title)}</h3><p>${esc(sub)}</p>
    <a class="ds-btn ds-btn--primary" href="teacher.html">กลับแผงของฉัน</a></div>`;
}

/* ---------------- render ---------------- */
function render() {
  const p = state.pack;
  $('#main').innerHTML = `
    <p class="jx-eyebrow">Pack Editor</p>
    <h1 class="jx-h2" id="headTitle">${esc(p.title)}</h1>

    <section class="jx-card" style="margin-top:22px">
      <h3 style="margin:0 0 14px;font-family:var(--font-display)">ข้อมูลชุด</h3>
      <div class="jx-field"><label for="fTitle">ชื่อชุด</label>
        <input id="fTitle" class="ds-input" value="${esc(p.title)}"></div>
      <div class="jx-row2">
        <div class="jx-field"><label for="fSubject">วิชา / หัวข้อ</label>
          <input id="fSubject" class="ds-input" value="${esc(p.subject || '')}" placeholder="เช่น วิทยาศาสตร์ ม.2"></div>
        <div class="jx-field"><label for="fVis">การมองเห็น</label>
          <select id="fVis" class="ds-input">
            <option value="private" ${p.visibility !== 'public' ? 'selected' : ''}>ส่วนตัว — เฉพาะฉัน</option>
            <option value="public" ${p.visibility === 'public' ? 'selected' : ''}>เผยแพร่ — ครูคนอื่นคัดลอกได้</option>
          </select></div>
      </div>
      <div class="jx-field"><label for="fDesc">คำอธิบายสั้นๆ</label>
        <textarea id="fDesc" class="ds-input" rows="2">${esc(p.description || '')}</textarea></div>
    </section>

    <section class="jx-card" style="margin-top:18px;margin-bottom:96px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <h3 style="margin:0;font-family:var(--font-display)">ภารกิจและคำถาม</h3>
        <span class="ds-muted" style="font-size:.85rem">เพิ่มคำถามได้ในการ์ดของแต่ละภารกิจเลย</span>
      </div>
      <div id="missionList"></div>
      <button class="ds-btn ds-btn--ghost ds-btn--block" id="addMission" style="margin-top:12px">${icon('plus')} เพิ่มภารกิจ</button>
    </section>

`;

  ['fTitle', 'fSubject', 'fVis', 'fDesc'].forEach((id) => {
    $('#' + id).addEventListener('input', onMeta);
    $('#' + id).addEventListener('change', onMeta);
  });
  $('#addMission').addEventListener('click', addMission);
  renderMissions();
  $('#playBtn').href = `host.html?pack=${encodeURIComponent(packId)}`;
  $('#savebar').hidden = false;
  setDirty(false);
}

function onMeta() {
  const p = state.pack;
  p.title = $('#fTitle').value;
  p.subject = $('#fSubject').value;
  p.description = $('#fDesc').value;
  p.visibility = $('#fVis').value;
  $('#headTitle').textContent = p.title;
  setDirty(true);
}

function renderMissions() {
  const p = state.pack;
  const box = $('#missionList');
  box.innerHTML = p.missions.length ? p.missions.map((m, i) => `
    <div class="jx-mission" data-mi="${i}">
      <div class="jx-mission__head">
        <span class="jx-mission__no">${m.id === 'boss' ? icon('crown') : i + 1}</span>
        <strong style="flex:1">${esc(m.titleTh || 'ภารกิจใหม่')}</strong>
        <span class="jx-mission__qn">${countQ(m.id)} คำถาม</span>
        <button class="qf-x" data-delm="${i}" type="button" title="ลบภารกิจ">${icon('trash')}</button>
      </div>
      <div class="jx-row2">
        <div class="jx-field"><label>ชื่อภารกิจ</label>
          <input class="ds-input" data-mi="${i}" data-mf="titleTh" value="${esc(m.titleTh || '')}"></div>
        <div class="jx-field"><label>หัวข้อย่อย</label>
          <input class="ds-input" data-mi="${i}" data-mf="topicTh" value="${esc(m.topicTh || '')}"></div>
      </div>
      <div class="jx-row2">
        <div class="jx-field"><label>รูปแบบคำถาม</label>
          <select class="ds-input" data-mi="${i}" data-mf="type">
            ${TYPES.map(([v, t]) => `<option value="${v}" ${m.type === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select></div>
        <div class="jx-field"><label>ไอคอน</label>
          <select class="ds-input" data-mi="${i}" data-mf="icon">
            ${ICONS.map((v) => `<option value="${v}" ${m.icon === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select></div>
      </div>
      <div class="jx-field"><label>เกริ่นนำสำหรับนักเรียน (ขึ้นจอฉาย)</label>
        <textarea class="ds-input" rows="2" data-mi="${i}" data-mf="intro">${esc(m.intro || '')}</textarea></div>
      <div class="jx-field"><label>บทพูดสำหรับครู (เห็นเฉพาะบนแผงครู)</label>
        <textarea class="ds-input" rows="2" data-mi="${i}" data-mf="script">${esc(m.script || '')}</textarea></div>

      <details class="jx-qbox" data-mid="${esc(m.id)}" ${countQ(m.id) ? '' : 'open'}>
        <summary class="jx-qbox__sum">
          <span>คำถามในภารกิจนี้</span>
          <b class="jx-qbox__n">${countQ(m.id)} ข้อ</b>
        </summary>
        <div class="jx-qbox__body" data-qmount="${esc(m.id)}"></div>
      </details>
    </div>`).join('')
    : '<p class="ds-muted ds-center" style="padding:14px 0">ยังไม่มีภารกิจ — กด “เพิ่มภารกิจ” ด้านล่าง</p>';

  box.querySelectorAll('[data-mf]').forEach((el) => {
    const h = () => {
      const m = state.pack.missions[+el.dataset.mi];
      m[el.dataset.mf] = el.value;
      if (el.dataset.mf === 'titleTh') {
        const strong = el.closest('.jx-mission').querySelector('strong');
        if (strong) strong.textContent = el.value || 'ภารกิจใหม่';
      }
      if (el.dataset.mf === 'type') remountQuestions(m.id);
      setDirty(true);
    };
    el.addEventListener('input', h); el.addEventListener('change', h);
  });
  mountMissionQuestions(box);
  box.querySelectorAll('[data-delm]').forEach((b) => b.addEventListener('click', async () => {
    const i = +b.dataset.delm; const m = state.pack.missions[i];
    const n = countQ(m.id);
    if (!await dxConfirm({
      title: `ลบภารกิจ “${m.titleTh || m.id}”?`,
      message: n ? `คำถาม ${n} ข้อในภารกิจนี้จะถูกลบไปด้วย` : 'ภารกิจนี้ยังไม่มีคำถาม',
      ok: 'ลบภารกิจ', cancel: 'ยกเลิก', danger: true,
    })) return;
    Object.keys(state.pack.questions).forEach((qid) => {
      if (state.pack.questions[qid].missionId === m.id) delete state.pack.questions[qid];
    });
    state.pack.missions.splice(i, 1);
    renumberMissions();
    setDirty(true); renderMissions();
  }));
  hydrateIcons(box);
}

function countQ(mid) { let n = 0; while (state.pack.questions[`${mid}_q${n + 1}`]) n++; return n; }

function addMission() {
  const p = state.pack;
  const used = new Set(p.missions.map((m) => m.id));
  let n = 1; while (used.has('m' + n)) n++;
  const id = 'm' + n;
  p.missions.push({
    id, no: p.missions.length + 1,
    titleTh: 'ภารกิจใหม่', title: '', topicTh: '',
    type: 'scenario', icon: 'shield', badge: '', intro: '', script: '',
  });
  setDirty(true); renderMissions();
  // A brand-new mission opens with its question box ready to fill in.
  const box = document.querySelector(`.jx-qbox[data-mid="${id}"]`);
  if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Keep `no` in display order (ids stay stable so question ids keep matching). */
function renumberMissions() {
  state.pack.missions.forEach((m, i) => { if (m.id !== 'boss') m.no = i + 1; });
}

/** One question editor per mission card, pinned to that mission. */
function mountMissionQuestions(box) {
  state.qEditors = {};
  box.querySelectorAll('[data-qmount]').forEach((mountEl) => {
    const mid = mountEl.dataset.qmount;
    state.qEditors[mid] = createQuestionEditor({
      mount: mountEl,
      missions: state.pack.missions,
      questions: state.pack.questions,
      only: mid,
      onDirty: () => { setDirty(true); refreshCounts(); },
    });
  });
}

/** A mission's type changed → rebuild just that mission's questions. */
function remountQuestions(mid) {
  const eds = state.qEditors || {};
  if (mid && eds[mid]) { eds[mid].setData(state.pack.missions, state.pack.questions); refreshCounts(); return; }
  Object.values(eds).forEach((ed) => ed.setData(state.pack.missions, state.pack.questions));
  refreshCounts();
}
function refreshCounts() {
  document.querySelectorAll('.jx-mission').forEach((el) => {
    const m = state.pack.missions[+el.dataset.mi]; if (!m) return;
    const n = countQ(m.id);
    const span = el.querySelector('.jx-mission__qn');
    if (span) span.textContent = `${n} คำถาม`;
    const badge = el.querySelector('.jx-qbox__n');
    if (badge) badge.textContent = `${n} ข้อ`;
  });
}

/* ---------------- save ---------------- */
function setDirty(v) {
  state.dirty = v;
  const bar = $('#savebar');
  bar.classList.toggle('is-dirty', v);
  $('#saveMsg').textContent = v ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกล่าสุดแล้ว';
  $('#saveState').innerHTML = v ? `${icon('edit')} ยังไม่บันทึก` : `${icon('check')} บันทึกแล้ว`;
}

$('#saveBtn').addEventListener('click', async () => {
  const btn = $('#saveBtn'); const p = state.pack;
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    renumberMissions();
    await updatePack(packId, {
      title: p.title, subject: p.subject, description: p.description,
      visibility: p.visibility, missions: p.missions, questions: p.questions,
    });
    setDirty(false);
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + (e.message || e), 'error');
  } finally { btn.disabled = false; btn.textContent = 'บันทึก'; }
});

/* Localhost-only: preview the editor UI with a fake pack (no Firestore). */
if (location.hostname === 'localhost') {
  window.__editPreview = async (over = {}) => {
    document.querySelector('.ds-modal-backdrop')?.remove();
    const [m, q] = await Promise.all([
      fetch('data/missions.json').then((r) => r.json()).catch(() => ({})),
      fetch('data/questions.json').then((r) => r.json()).catch(() => ({})),
    ]);
    state.user = { uid: 'preview' };
    state.pack = {
      id: 'preview', ownerUid: 'preview', title: 'ชุดพรีวิว', subject: 'ทดสอบ',
      description: 'ตัวอย่างสำหรับดูหน้าตา', visibility: 'private',
      missions: m.missions || [], questions: q.questions || {}, ...over,
    };
    render();
  };
}

window.addEventListener('beforeunload', (e) => {
  if (!state.dirty) return;
  e.preventDefault(); e.returnValue = '';
});

/** Preview boot: load the pack with anonymous auth and render the editor. */
async function bootPreview() {
  const { ensureStudentAuth } = await import('./auth.js');
  try { await ensureStudentAuth(); } catch (_e) {}
  if (!packId) return fail('ไม่พบชุดคำถาม', 'ใส่ ?pack=<id>&preview=1 เพื่อดูหน้าตา');
  let pack;
  try { pack = await getPack(packId); } catch (e) { return fail('เปิดชุดนี้ไม่ได้', e.message || String(e)); }
  if (!pack) return fail('ไม่พบชุดคำถาม', 'ชุดนี้อาจเป็นส่วนตัวหรือถูกลบไปแล้ว');
  state.user = { uid: pack.ownerUid };
  state.pack = pack;
  render();
  const bar = document.getElementById('savebar');
  if (bar) bar.hidden = true;
}
