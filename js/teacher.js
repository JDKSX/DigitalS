/* =================================================================
   Teacher dashboard — JDKS ARENA
   My packs · public library · open a room · edit · publish · delete.
   ================================================================= */
import { onAuth, getTeacher, ensureTeacherProfile, signOutUser } from './auth.js';
import { loginUrl } from './topbar.js';
import { hydrateIcons, icon } from './icons.js';
import {
  listMyPacks, listPublicPacks, createPack, deletePack,
  setVisibility, starterPackData,
} from './packs.js';
import { listMySessions, setSessionStatus, getPlayers } from './session.js';
import { loadGame } from './content.js';
import { exportCSV, exportXLSX } from './export.js';
import { startIdleTimer } from './idle.js';
import { dxConfirm, dxPrompt, dxChoose, toast } from './dialog.js';
import { applyBrand } from './branding.js';

const $ = (s) => document.querySelector(s);
const state = { user: null, teacher: null, tab: 'mine', mine: [], pub: [], rooms: [], busy: false };
const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- boot ---------------- */
onAuth(async (user) => {
  if (!user || user.isAnonymous) { location.replace(loginUrl('login')); return; }
  state.user = user;
  state.teacher = (await getTeacher(user.uid)) || (await ensureTeacherProfile(user));
  applyBrand(state.teacher.brand);
  try {
    startIdleTimer({ key: 'ds-idle-staff', minutes: 60, onIdle: async () => {
      try { localStorage.removeItem('ds-idle-staff'); } catch (_e) {}
      await signOutUser(); location.href = 'index.html';
    } });
  } catch (_e) {}
  await refresh();
});

/* ---------------- data ---------------- */
async function refresh() {
  try {
    if (state.tab === 'mine') state.mine = await listMyPacks(state.user.uid);
    else if (state.tab === 'rooms') state.rooms = await listMySessions(state.user.uid);
    else state.pub = await listPublicPacks();
  } catch (e) {
    $('#panel').innerHTML = errBox('โหลดข้อมูลไม่สำเร็จ: ' + (e.message || e));
    return;
  }
  render();
}

/* ---------------- render ---------------- */
function render() {
  const panel = $('#panel');
  const mine = state.tab === 'mine';
  $('#newPack').hidden = !mine;
  $('#starterPack').hidden = !mine;

  if (state.tab === 'rooms') return renderRooms(panel);

  const items = mine ? state.mine : state.pub;

  if (!items.length) {
    panel.innerHTML = mine
      ? emptyBox('target', 'ยังไม่มีชุดคำถาม',
          'สร้างชุดของคุณเองตั้งแต่ต้น หรือเริ่มจากชุดตัวอย่างที่พร้อมเล่นทันทีแล้วแก้ต่อได้')
      : emptyBox('book', 'ยังไม่มีชุดสาธารณะ',
          'เมื่อมีครูเผยแพร่ชุดคำถาม จะมาแสดงที่นี่ให้คุณหยิบไปเปิดห้องได้ทันที');
    hydrateIcons(panel);
    return;
  }

  panel.innerHTML = `<div class="jx-grid jx-grid--2">${items.map((p) => card(p, mine)).join('')}</div>`;
  hydrateIcons(panel);
  wire(panel);
}

function card(p, mine) {
  const pub = p.visibility === 'public';
  return `<article class="jx-card jx-pack">
    <div class="jx-pack__top">
      <div style="flex:1">
        <h3 class="jx-pack__title">${esc(p.title)}</h3>
        ${p.subject ? `<div class="jx-pack__subject">${esc(p.subject)}</div>` : ''}
      </div>
      <span class="jx-chip ${pub ? 'jx-chip--live' : 'jx-chip--draft'}">${icon(pub ? 'globe' : 'lock')} ${pub ? 'เผยแพร่' : 'ส่วนตัว'}</span>
    </div>
    ${p.description ? `<p class="jx-pack__desc">${esc(p.description)}</p>` : ''}
    <div class="jx-pack__meta">
      <span class="jx-chip">${p.missionCount || 0} ภารกิจ</span>
      <span class="jx-chip">${p.questionCount || 0} คำถาม</span>
      ${!mine && p.ownerName ? `<span class="jx-chip">โดย ${esc(p.ownerName)}</span>` : ''}
    </div>
    <div class="jx-pack__acts">
      ${mine ? `
        <a class="ds-btn ds-btn--primary" href="host.html?pack=${encodeURIComponent(p.id)}">เปิดห้อง</a>
        <a class="ds-btn ds-btn--ghost" href="editor.html?pack=${encodeURIComponent(p.id)}">แก้ไข</a>
        <button class="ds-btn ds-btn--ghost" data-vis="${p.id}" data-now="${p.visibility}">${pub ? 'ปิดเผยแพร่' : 'เผยแพร่'}</button>
        <button class="ds-btn ds-btn--ghost jx-danger" data-del="${p.id}" data-title="${esc(p.title)}">ลบ</button>
      ` : `
        <a class="ds-btn ds-btn--cyan" href="host.html?pack=${encodeURIComponent(p.id)}">เปิดห้องด้วยชุดนี้</a>
      `}
    </div>
  </article>`;
}

function wire(root) {
  root.querySelectorAll('[data-vis]').forEach((b) => b.addEventListener('click', async () => {
    const next = b.dataset.now === 'public' ? 'private' : 'public';
    if (next === 'public' && !await dxConfirm({
      title: 'เผยแพร่ชุดนี้?',
      message: 'ครูคนอื่นจะเห็นชุดนี้ในคลังสาธารณะ และคัดลอกไปแก้เป็นของตัวเองได้\nคุณปิดเผยแพร่ภายหลังได้ตลอด',
      ok: 'เผยแพร่เลย', cancel: 'ยังก่อน',
    })) return;
    await guard(b, () => setVisibility(b.dataset.vis, next));
  }));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!await dxConfirm({
      title: `ลบชุด “${b.dataset.title}” ถาวร?`,
      message: 'คำถามทั้งหมดในชุดนี้จะหายไปด้วย และกู้คืนไม่ได้',
      ok: 'ลบถาวร', cancel: 'ยกเลิก', danger: true,
    })) return;
    await guard(b, () => deletePack(b.dataset.del));
  }));
}

async function guard(btn, fn, okMsg) {
  if (state.busy) return;
  state.busy = true;
  const label = btn.textContent; btn.disabled = true; btn.textContent = 'กำลังทำ…';
  try { await fn(); if (okMsg) toast(okMsg, 'success'); await refresh(); }
  catch (e) { toast('ทำรายการไม่สำเร็จ: ' + (e.message || e), 'error'); btn.disabled = false; btn.textContent = label; }
  finally { state.busy = false; }
}

function teacherName() {
  const t = state.teacher || {};
  return t.displayName || (state.user.email || '').split('@')[0];
}

/* ---------------- actions ---------------- */
$('#newPack').addEventListener('click', async () => {
  const title = await dxPrompt({
    title: 'ตั้งชื่อชุดคำถามใหม่', label: 'ชื่อชุด', value: 'ชุดคำถามใหม่',
    placeholder: 'เช่น คำศัพท์บทที่ 3', ok: 'ถัดไป', required: true,
  });
  if (title === null) return;
  const subject = await dxPrompt({
    title: 'ชุดนี้เป็นวิชาอะไร?', message: 'ไม่ใส่ก็ได้ — ใช้ช่วยให้ครูคนอื่นค้นเจอในคลัง',
    label: 'วิชา / หัวข้อ', placeholder: 'เช่น ภาษาอังกฤษ', ok: 'สร้างชุด',
  });
  if (subject === null) return;
  try {
    const p = await createPack(state.user.uid, teacherName(), { title: title || 'ชุดคำถามใหม่', subject });
    location.href = `editor.html?pack=${encodeURIComponent(p.id)}`;
  } catch (e) { toast('สร้างไม่สำเร็จ: ' + (e.message || e), 'error'); }
});

$('#starterPack').addEventListener('click', async () => {
  const btn = $('#starterPack');
  btn.disabled = true; btn.textContent = 'กำลังสร้าง…';
  try {
    const data = await starterPackData();
    await createPack(state.user.uid, teacherName(), data);
    await refresh();
  } catch (e) { toast('สร้างไม่สำเร็จ: ' + (e.message || e), 'error'); }
  finally { btn.disabled = false; btn.textContent = 'เริ่มจากชุดตัวอย่าง'; }
});

document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
  state.tab = b.dataset.tab;
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('is-on', x === b));
  $('#panel').innerHTML = emptyBox('clock', 'กำลังโหลด…', '');
  refresh();
}));

/* ---------------- my rooms ---------------- */
function renderRooms(panel) {
  if (!state.rooms.length) {
    panel.innerHTML = emptyBox('room', 'ยังไม่เคยเปิดห้อง',
      'กดเปิดห้องจากชุดคำถามของคุณ แล้วห้องที่เคยเล่นจะมาแสดงที่นี่');
    return;
  }
  panel.innerHTML = `<div class="jx-grid jx-grid--2">${state.rooms.map(roomCard).join('')}</div>`;
  panel.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => exportRoom(b)));
  panel.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', async () => {
    if (!await dxConfirm({
      title: 'ปิดห้องนี้?',
      message: 'นักเรียนที่อยู่ในห้องจะเห็นหน้าสรุปผล และรหัสห้องนี้จะใช้ไม่ได้อีก (รหัสห้องใช้ได้ครั้งเดียว)',
      ok: 'ปิดห้อง', cancel: 'ยกเลิก', danger: true,
    })) return;
    await guard(b, () => setSessionStatus(b.dataset.close, 'closed'));
  }));
}

function roomCard(s) {
  const open = s.status === 'open';
  const when = s.createdAt && s.createdAt.toDate
    ? s.createdAt.toDate().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';
  return `<article class="jx-card jx-pack">
    <div class="jx-pack__top">
      <div style="flex:1">
        <h3 class="jx-pack__title" style="font-family:var(--font-mono);letter-spacing:.14em">${esc(s.code)}</h3>
        <div class="jx-pack__subject">${esc(s.title || 'ห้องเรียน')}</div>
      </div>
      <span class="jx-chip ${open ? 'jx-chip--live' : ''}">${icon(open ? 'play' : 'flag')} ${open ? 'เปิดอยู่' : 'ปิดแล้ว'}</span>
    </div>
    <div class="jx-pack__meta"><span class="jx-chip">${esc(when)}</span></div>
    <div class="jx-pack__acts">
      ${open ? `<a class="ds-btn ds-btn--primary" href="host.html">กลับเข้าห้อง</a>
                <a class="ds-btn ds-btn--ghost" href="presenter.html?s=${encodeURIComponent(s.code)}" target="_blank" rel="noopener">จอฉาย</a>` : ''}
      <button class="ds-btn ds-btn--ghost" data-export="${s.id}" data-code="${esc(s.code)}" data-pack="${esc(s.packId || '')}">ส่งออกคะแนน</button>
      ${open ? `<button class="ds-btn ds-btn--ghost jx-danger" data-close="${s.id}">ปิดห้อง</button>` : ''}
    </div>
  </article>`;
}

/* ---------------- export one room's scores ---------------- */
/** Read that room's players and its pack, then hand the teacher a file.
    Nothing is exported for a room nobody joined — saying so is more use
    than downloading an empty sheet. */
async function exportRoom(btn) {
  const sid = btn.dataset.export;
  const code = btn.dataset.code || 'room';
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'กำลังรวบรวม…';
  try {
    const [players, game] = await Promise.all([
      getPlayers(sid),
      loadGame(btn.dataset.pack || null),
    ]);
    if (!players.length) {
      toast(`ห้อง ${code} ไม่มีใครเข้าร่วม จึงไม่มีคะแนนให้ส่งออก`, 'error');
      return;
    }
    const pick = await dxChoose({
      title: `ส่งออกคะแนนห้อง ${code}`,
      message: `มีผู้เล่น ${players.length} คนในห้องนี้ — เลือกรูปแบบไฟล์`,
      options: [
        { id: 'xlsx', label: 'Excel (.xlsx)', hint: 'เปิดใน Excel หรือ Numbers ได้เลย', icon: 'chart' },
        { id: 'csv', label: 'CSV (.csv)', hint: 'ไฟล์ข้อความ นำเข้าโปรแกรมอื่นได้', icon: 'book' },
      ],
    });
    if (!pick) return;
    const name = `jdks-arena-${code}`;
    if (pick === 'xlsx') await exportXLSX(players, game.content, name);
    else exportCSV(players, game.content, name);
    toast(`ส่งออกคะแนนห้อง ${code} แล้ว (${players.length} คน)`, 'success');
  } catch (e) {
    toast('ส่งออกไม่สำเร็จ: ' + ((e && e.message) || e), 'error');
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

/* ---------------- bits ---------------- */
function emptyBox(ic, title, sub) {
  return `<div class="jx-empty"><div class="jx-empty__ic">${icon(ic)}</div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div>`;
}
function errBox(msg) {
  return `<div class="jx-empty"><div class="jx-empty__ic">${icon('alert')}</div><h3>เกิดข้อผิดพลาด</h3><p>${esc(msg)}</p></div>`;
}
