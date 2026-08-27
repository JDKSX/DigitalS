/* =================================================================
   Admin controller (admin.html) — DIGITAL SURVIVAL (§6, §31, §32)
   Sessions list · analytics · CSV/XLSX export · close/archive.
   Read-only content overview (content is edited in data/*.json).
   ================================================================= */
import { onAuth, signInStaff, getRole, authErrorTh, signOutUser } from './auth.js';
import { startIdleTimer } from './idle.js';
import { getSessions, getSessionUsers, getSessionAnswers, setSessionStatus, archiveSession, deleteSessionFully, saveSettings } from './session.js';
import { loadContent, loadQuestions } from './content.js';
import { computeAnalytics } from './analytics.js';
import { exportCSV, exportXLSX, download } from './export.js';
import { icon, hydrateIcons } from './icons.js';

const $ = (s) => document.querySelector(s);
const state = { content: null, questions: {}, sessions: [], active: null, users: [], answers: [], analytics: null };

/* ---------------- login ---------------- */
let idleStarted = false;
function startStaffIdle() {
  if (idleStarted) return; idleStarted = true;
  startIdleTimer({ key: 'ds-idle-staff', minutes: 60, onIdle: async () => {
    try { await signOutUser(); } catch (_e) {}
    try { localStorage.removeItem('ds-idle-staff'); } catch (_e) {}
    location.reload();
  } });
}

function showLogin() {
  if ($('.ds-modal-backdrop')) return;
  const back = document.createElement('div');
  back.className = 'ds-modal-backdrop';
  back.innerHTML = `<div class="ds-modal" role="dialog" aria-modal="true">
    <p class="ds-en" style="color:var(--cyan)">Admin Login</p><h2>เข้าสู่ระบบผู้ดูแล</h2>
    <div class="ds-form-row"><label class="ds-label" for="aEmail">อีเมล</label><input id="aEmail" class="ds-input" type="email" autocomplete="username"></div>
    <div class="ds-form-row"><label class="ds-label" for="aPass">รหัสผ่าน</label><input id="aPass" class="ds-input" type="password" autocomplete="current-password"></div>
    <div class="ds-form-err" id="aErr" hidden></div>
    <button class="ds-btn ds-btn--primary ds-btn--block" id="aGo" style="margin-top:22px">เข้าสู่ระบบ</button></div>`;
  document.body.appendChild(back);
  const go = $('#aGo');
  async function submit() {
    $('#aErr').hidden = true; go.disabled = true; go.textContent = 'กำลังเข้าสู่ระบบ…';
    try { await signInStaff($('#aEmail').value, $('#aPass').value); back.remove(); }
    catch (e) { $('#aErr').hidden = false; $('#aErr').textContent = authErrorTh(e); go.disabled = false; go.textContent = 'เข้าสู่ระบบ'; }
  }
  go.addEventListener('click', submit);
  ['aEmail', 'aPass'].forEach((id) => $('#' + id).addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
  $('#aEmail').focus();
}

/* ---------------- boot ---------------- */
onAuth(async (user) => {
  if (!user) return showLogin();
  if (!(await getRole(user.uid))) return showLogin();
  document.querySelector('.ds-modal-backdrop')?.remove(); // clear any stale login modal
  startStaffIdle(); // auto sign-out after 1h idle
  state.content = await loadContent().catch(() => ({ missions: [] }));
  state.questions = await loadQuestions().catch(() => ({}));
  renderContent();
  renderAnalytics(); renderExport();
  await refreshSessions();
});

/* ---------------- sessions ---------------- */
async function refreshSessions() {
  const box = $('#tab-sessions');
  box.innerHTML = `<div class="ds-card ds-empty"><span class="ds-feat">${icon('users')}</span><h3>กำลังโหลดเซสชัน…</h3></div>`;
  try { state.sessions = await getSessions(); } catch (e) { box.innerHTML = errCard('โหลดเซสชันไม่สำเร็จ: ' + (e.message || e)); return; }
  if (!state.sessions.length) { box.innerHTML = `<div class="ds-card ds-empty"><span class="ds-feat">${icon('users')}</span><h3>ยังไม่มีเซสชัน</h3><p>สร้างเซสชันได้ที่แผงวิทยากร</p></div>`; return; }
  box.innerHTML = `<div class="ds-card"><div class="ds-heading"><span class="ds-en">${state.sessions.length} sessions</span><h2>เซสชันทั้งหมด</h2></div>
    <div class="sess-list">${state.sessions.map(sessRow).join('')}</div></div>`;
  hydrateIcons(box);
  box.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => selectSession(b.dataset.pick)));
  box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', async () => { await setSessionStatus(b.dataset.close, 'closed').catch(() => {}); refreshSessions(); }));
  box.querySelectorAll('[data-arch]').forEach((b) => b.addEventListener('click', async () => { if (confirm('เก็บถาวรเซสชันนี้?')) { await archiveSession(b.dataset.arch).catch(() => {}); refreshSessions(); } }));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const s = state.sessions.find((x) => x.id === b.dataset.del);
    if (s && s.status === 'open') { alert('ปิดเซสชันก่อนจึงจะลบได้ (กันลบห้องที่กำลังใช้งาน)'); return; }
    if (!confirm(`ลบเซสชัน ${s ? s.code : ''} ถาวร?\nจะลบข้อมูลผู้เล่น คำตอบ และคะแนนทั้งหมดของเซสชันนี้ กู้คืนไม่ได้`)) return;
    b.disabled = true; b.textContent = 'กำลังลบ…';
    try {
      await deleteSessionFully(b.dataset.del);
      if (state.active && state.active.id === b.dataset.del) { state.active = null; state.users = []; state.answers = []; }
      refreshSessions();
    } catch (e) { alert('ลบไม่สำเร็จ: ' + (e.message || e) + '\n(ผู้ดูแลต้องอัปเดต Firestore Rules ให้ลบ answers ได้)'); b.disabled = false; b.textContent = 'ลบ'; }
  }));
}
function sessRow(s) {
  const date = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const active = state.active && state.active.id === s.id;
  return `<div class="sess-row ${active ? 'is-active' : ''}">
    <div><div class="sess-code">${s.code}</div><div class="ds-muted" style="font-size:.8rem">${date}${s.archived ? ' · เก็บถาวร' : ''}</div></div>
    <span class="ds-chip ${s.status === 'open' ? 'ds-chip--live' : ''}">${s.status === 'open' ? 'เปิด' : 'ปิด'}</span>
    <div class="sess-actions">
      <button class="ds-btn ds-btn--ghost sess-btn" data-pick="${s.id}">เลือก</button>
      ${s.status === 'open' ? `<button class="ds-btn ds-btn--ghost sess-btn" data-close="${s.id}">ปิด</button>` : ''}
      <button class="ds-btn ds-btn--ghost sess-btn" data-arch="${s.id}">เก็บถาวร</button>
      <button class="ds-btn ds-btn--ghost sess-btn sess-btn--danger" data-del="${s.id}">ลบ</button>
    </div></div>`;
}

async function selectSession(id) {
  state.active = state.sessions.find((s) => s.id === id);
  const goAnalytics = $('.admin-tab[data-tab="analytics"]');
  try {
    [state.users, state.answers] = await Promise.all([getSessionUsers(id), getSessionAnswers(id)]);
    state.analytics = computeAnalytics(state.users, state.answers, state.content, state.questions);
  } catch (e) { alert('โหลดข้อมูลไม่สำเร็จ: ' + (e.message || e)); return; }
  renderAnalytics(); renderExport(); refreshSessions();
  if (goAnalytics) goAnalytics.click();
}

/* ---------------- analytics ---------------- */
function renderAnalytics() {
  const box = $('#tab-analytics');
  if (!state.active) { box.innerHTML = pickFirst(); return; }
  const a = state.analytics;
  box.innerHTML = `
    ${activeBanner()}
    <div class="stat-cards">
      ${statCard('users', a.total, 'ผู้เข้าร่วม')}
      ${statCard('chart', a.completionRate + '%', 'อัตราจบครบ')}
      ${statCard('sparkles', a.avgXp.toLocaleString('en-US'), 'XP เฉลี่ย')}
      ${statCard('reveal', a.avgScore.toLocaleString('en-US'), 'คะแนนเฉลี่ย')}
    </div>
    <div class="ds-card" style="margin-top:16px"><div class="ds-heading"><span class="ds-en">By mission</span><h2>คะแนน/ความถูกต้อง รายภารกิจ</h2></div>
      <div class="an-missions">${a.missionStats.map((m) => `<div class="an-mrow">
        <span class="an-mtitle">${m.titleTh}</span>
        <span class="an-bar"><i style="width:${m.correctPct == null ? 0 : m.correctPct}%"></i></span>
        <span class="an-pct">${m.correctPct == null ? '—' : m.correctPct + '%'}</span></div>`).join('')}</div>
      ${a.lowestMission ? `<p class="ds-muted" style="margin-top:12px">ภารกิจที่ตอบถูกน้อยสุด: <b>${a.lowestMission.titleTh}</b> (${a.lowestMission.correctPct}%)</p>` : ''}
    </div>
    <div class="ds-card" style="margin-top:16px"><div class="ds-heading"><span class="ds-en">By question</span><h2>รายข้อ · % ถูก · เวลาเฉลี่ย</h2></div>
      <div class="an-qlist">${a.questionStats.map((q) => `<div class="an-qrow">
        <span class="ds-mono">${q.qid}</span>
        <span class="ds-muted">ตอบ ${q.count}</span>
        <span>${q.type === 'assessment' ? '—' : q.correctPct + '% ถูก'}</span>
        <span class="ds-muted">${(q.avgMs / 1000).toFixed(1)}s</span></div>`).join('')}</div>
      ${a.hardestQ ? `<p class="ds-muted" style="margin-top:12px">ข้อที่ยากสุด: <b>${a.hardestQ.qid}</b> (${a.hardestQ.correctPct}% ถูก)</p>` : ''}
    </div>`;
  hydrateIcons(box);
}
function statCard(ic, num, label) {
  return `<div class="ds-card ds-card--flat stat"><span data-icon="${ic}" class="ds-ico"></span><div class="ds-stat__num">${num}</div><div class="ds-stat__label">${label}</div></div>`;
}

/* ---------------- export ---------------- */
function renderExport() {
  const box = $('#tab-export');
  if (!state.active) { box.innerHTML = pickFirst(); return; }
  box.innerHTML = `${activeBanner()}
    <div class="ds-card"><div class="ds-heading"><span class="ds-en">Export</span><h2>ส่งออกผลคะแนน</h2></div>
      <p class="ds-muted">ผู้เล่น ${state.users.length} คน · Player ID · ชื่อเล่น · ห้อง · คะแนนรายภารกิจ · Final · XP · Level · Badge · สถานะจบ</p>
      <div class="ds-row" style="margin-top:16px;gap:12px;flex-wrap:wrap">
        <button class="ds-btn ds-btn--primary" id="expCsv">${icon('reveal')} ดาวน์โหลด CSV</button>
        <button class="ds-btn ds-btn--cyan" id="expXlsx">${icon('chart')} ดาวน์โหลด XLSX</button>
      </div>
      <p class="ds-note" style="display:block;margin-top:16px">CSV มี BOM รองรับภาษาไทยใน Excel · XLSX โหลด SheetJS จาก CDN เฉพาะตอนกด</p>
    </div>`;
  const name = `digital-survival-${state.active.code}`;
  $('#expCsv').addEventListener('click', () => { try { exportCSV(state.users, state.content, name); } catch (e) { alert('ส่งออก CSV ไม่สำเร็จ: ' + e.message); } });
  $('#expXlsx').addEventListener('click', async () => { const b = $('#expXlsx'); b.disabled = true; b.textContent = 'กำลังสร้าง…'; try { await exportXLSX(state.users, state.content, name); } catch (e) { alert('ส่งออก XLSX ไม่สำเร็จ: ' + (e.message || e)); } b.disabled = false; b.innerHTML = icon('chart') + ' ดาวน์โหลด XLSX'; });
}

/* ---------------- content overview ---------------- */
function renderContent() {
  const box = $('#tab-content');
  const ms = state.content.missions || [];
  box.innerHTML = `<div class="ds-card"><div class="ds-heading"><span class="ds-en">Content · data/*.json</span><h2>เนื้อหา 8 ภารกิจ + บอส</h2></div>
    <p class="ds-muted" style="margin-bottom:14px">แก้ไขเนื้อหาที่ไฟล์ <span class="ds-mono">data/missions.json</span> และ <span class="ds-mono">data/questions.json</span> แล้ว push ขึ้น GitHub (เนื้อหาเป็น static ไม่เปลืองโควตา Firestore)</p>
    <div class="content-list">${ms.map((m) => { const n = countQ(m.id); return `<div class="content-row">
      <span class="ds-feat" style="width:40px;height:40px">${icon(m.icon || 'shield')}</span>
      <div><div style="font-family:var(--font-display);font-weight:700">${m.titleTh}</div><div class="ds-muted" style="font-size:.8rem">${m.title} · ${m.topicTh}</div></div>
      <span class="ds-chip">${n} ข้อ · ${m.type}</span></div>`; }).join('')}</div></div>
    <div id="qEditor"></div>`;
  hydrateIcons(box);
  buildQEditor();
}
function countQ(mid) { let n = 0; while (state.questions[`${mid}_q${n + 1}`]) n++; return n; }

/* ---------------- visual question editor (forms — no JSON) ---------------- */
let qFull = null;   // full parsed questions.json (keeps meta)
let qmodel = null;  // qFull.questions — the editable map
let qMission = 'm1';
const escA = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escT = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function setPath(o, path, val) { const ks = path.split('.'); let c = o; for (let i = 0; i < ks.length - 1; i++) c = c[ks[i]]; c[ks[ks.length - 1]] = val; }
function missionType(mid) { const m = (state.content.missions || []).find((x) => x.id === mid); return m ? m.type : 'scenario'; }
function qidsFor(mid) { const ids = []; let n = 1; while (qmodel[`${mid}_q${n}`]) { ids.push(`${mid}_q${n}`); n++; } return ids; }

async function buildQEditor() {
  const box = $('#qEditor'); if (!box) return;
  if (!qFull) {
    try { qFull = JSON.parse(await (await fetch(`data/questions.json?ts=${Date.now()}`)).text()); }
    catch (_e) { qFull = { meta: {}, questions: JSON.parse(JSON.stringify(state.questions || {})) }; }
    qmodel = qFull.questions;
  }
  const missions = state.content.missions || [];
  box.innerHTML = `<div class="ds-card">
    <div class="ds-heading"><span class="ds-en">Editor · ฟอร์ม</span><h2>แก้ไขคำถาม (กรอกช่องได้เลย)</h2></div>
    <label class="qf-label">เลือกภารกิจที่จะแก้</label>
    <select id="qMissionSel" class="ds-input">${missions.map((m) => `<option value="${m.id}" ${m.id === qMission ? 'selected' : ''}>${m.id === 'boss' ? 'บอส' : 'ภารกิจ ' + m.no} · ${escA(m.titleTh)} (${m.type})</option>`).join('')}</select>
    <div id="qList" style="margin-top:16px"></div>
    <button class="ds-btn ds-btn--ghost ds-btn--block" id="qAdd" style="margin-top:12px">+ เพิ่มคำถามในภารกิจนี้</button>
    <div class="ds-row" style="gap:10px;margin-top:20px;flex-wrap:wrap">
      <button class="ds-btn ds-btn--primary" id="qSave">${icon('reveal')} บันทึก (ใช้ได้ทันที)</button>
      <button class="ds-btn ds-btn--ghost" id="qBackup">ดาวน์โหลดสำรอง</button>
    </div>
    <div id="qMsg" class="ed-msg" style="margin-top:10px"></div>
    <p class="ds-muted" style="font-size:.85rem;margin-top:6px">แก้ในฟอร์ม → กด <b>บันทึก</b> → เนื้อหาอัปเดต<b>ทันที</b> นักเรียน/วิทยากรเห็นเมื่อเข้าหรือโหลดหน้าใหม่ (ไม่ต้องอัปโหลด GitHub) · “ดาวน์โหลดสำรอง” ไว้เก็บไฟล์ต้นฉบับเฉยๆ</p>
  </div>`;
  hydrateIcons(box);
  $('#qMissionSel').addEventListener('change', (e) => { qMission = e.target.value; renderQList(); });
  $('#qAdd').addEventListener('click', addQuestion);
  $('#qSave').addEventListener('click', saveQuestions);
  $('#qBackup').addEventListener('click', () => { qFull.questions = qmodel; download('questions.json', JSON.stringify(qFull, null, 2), 'application/json'); });
  const list = $('#qList');
  list.addEventListener('input', onField);
  list.addEventListener('change', onField);
  list.addEventListener('click', onListClick);
  renderQList();
}

function onField(e) {
  const el = e.target; const qid = el.dataset.qid, path = el.dataset.path;
  if (!qid || path == null || !qmodel[qid]) return;
  let v = el.value; if (el.dataset.num) v = Number(v) || 0;
  setPath(qmodel[qid], path, v);
}
function onListClick(e) {
  const add = e.target.closest('[data-addopt]'); const del = e.target.closest('[data-delopt]'); const dq = e.target.closest('[data-delq]');
  if (add) { const q = qmodel[add.dataset.addopt]; const used = (q.options || []).map((o) => o.key); const key = 'ABCDEFGH'.split('').find((k) => !used.includes(k)) || String(used.length + 1); q.options.push({ key, text: '' }); renderQList(); }
  else if (del) { const [qid, i] = del.dataset.delopt.split(':'); const q = qmodel[qid]; const removed = q.options[+i]; q.options.splice(+i, 1); if (q.correct === removed.key) q.correct = (q.options[0] || {}).key || ''; renderQList(); }
  else if (dq) { if (confirm('ลบคำถามนี้?')) { renumberDelete(dq.dataset.delq); renderQList(); } }
}

function renderQList() {
  const list = $('#qList'); const ids = qidsFor(qMission);
  list.innerHTML = ids.length ? ids.map((id, i) => questionCard(id, i)).join('') : '<p class="ds-muted ds-center" style="padding:14px 0">ยังไม่มีคำถาม — กด “เพิ่มคำถาม” ด้านล่าง</p>';
}
function questionCard(id, i) {
  const q = qmodel[id];
  const forms = { scenario: scenarioForm, investigation: investigationForm, dragsort: dragsortForm, ordering: orderingForm, assessment: assessmentForm };
  const body = (forms[q.type] || scenarioForm)(id, q);
  return `<div class="qcard"><div class="qc-head"><b>ข้อ ${i + 1}</b> <span class="ds-chip">${q.type}</span>
    <button class="qc-del" data-delq="${id}" type="button">🗑 ลบข้อนี้</button></div>${body}</div>`;
}
const lbl = (t) => `<label class="qf-label">${t}</label>`;
const area = (id, path, v) => `<textarea class="qf-area" data-qid="${id}" data-path="${path}">${escT(v)}</textarea>`;
const inp = (id, path, v, extra = '') => `<input class="qf-in" data-qid="${id}" data-path="${path}" value="${escA(v)}" ${extra}>`;

function scenarioForm(id, q) {
  return `${lbl('สถานการณ์ / คำถาม')}${area(id, 'situation', q.situation)}
    ${lbl('ตัวเลือก — วงกลมหน้าข้อ = คำตอบที่ถูก')}
    <div class="qf-opts">${(q.options || []).map((o, i) => `<div class="qf-opt">
      <input type="radio" name="c-${id}" value="${escA(o.key)}" data-qid="${id}" data-path="correct" ${q.correct === o.key ? 'checked' : ''} title="ตั้งเป็นข้อที่ถูก">
      <span class="qf-key">${escA(o.key)}</span>${inp(id, `options.${i}.text`, o.text)}
      <button class="qf-x" data-delopt="${id}:${i}" type="button" title="ลบ">✕</button></div>`).join('')}</div>
    <button class="qf-addbtn" data-addopt="${id}" type="button">+ เพิ่มตัวเลือก</button>
    ${lbl('คำอธิบายเฉลย')}${area(id, 'explanation', q.explanation)}
    ${lbl('คะแนน XP')}<input class="qf-in qf-num" type="number" data-qid="${id}" data-path="xp" data-num="1" value="${q.xp || 100}">`;
}
function investigationForm(id, q) {
  return `${lbl('พาดหัวข่าว')}${inp(id, 'headline', q.headline)}
    <div class="qf-row2"><div>${lbl('แหล่งที่มา')}${inp(id, 'source', q.source)}</div><div>${lbl('วันที่ / ยอดแชร์')}${inp(id, 'date', q.date)}</div></div>
    ${lbl('คำพูดอ้าง')}${inp(id, 'quote', q.quote)}
    ${lbl('หลักฐาน (แตะดูได้ในเกม)')}${(q.evidence || []).map((e, i) => `<div class="qf-opt"><span class="qf-key" style="min-width:74px">${escA(e.label || 'หลักฐาน ' + (i + 1))}</span>${inp(id, `evidence.${i}.text`, e.text)}</div>`).join('')}
    ${lbl('คำถาม')}${inp(id, 'question', q.question)}
    ${lbl('คำตอบที่ถูก')}<div class="qf-opts">${(q.options || []).map((o) => `<label class="qf-opt qf-radio"><input type="radio" name="c-${id}" value="${escA(o.key)}" data-qid="${id}" data-path="correct" ${q.correct === o.key ? 'checked' : ''}> ${escA(o.text)}</label>`).join('')}</div>
    ${lbl('คำอธิบายเฉลย')}${area(id, 'explanation', q.explanation)}`;
}
function dragsortForm(id, q) {
  const buckets = q.buckets || [];
  return `${lbl('คำสั่ง')}${area(id, 'prompt', q.prompt)}
    ${lbl('การ์ด — เลือกกล่องที่ถูกต้อง')}${(q.cards || []).map((c, i) => `<div class="qf-opt">${inp(id, `cards.${i}.text`, c.text)}<select class="qf-sel" data-qid="${id}" data-path="cards.${i}.correct">${buckets.map((b) => `<option value="${escA(b.key)}" ${c.correct === b.key ? 'selected' : ''}>${escA(b.labelTh || b.label || b.key)}</option>`).join('')}</select></div>`).join('')}
    ${lbl('คำอธิบายเฉลย')}${area(id, 'explanation', q.explanation)}`;
}
function orderingForm(id, q) {
  return `${lbl('สถานการณ์')}${area(id, 'scenario', q.scenario)}
    ${lbl('ขั้นตอน (บนลงล่าง = ลำดับที่ถูก)')}${(q.correctOrder || []).map((sid, idx) => { const si = (q.steps || []).findIndex((s) => s.id === sid); const st = (q.steps || [])[si]; return `<div class="qf-opt"><span class="qf-key">${idx + 1}</span>${inp(id, `steps.${si}.text`, st ? st.text : '')}</div>`; }).join('')}
    ${lbl('คำอธิบายเฉลย')}${area(id, 'explanation', q.explanation)}`;
}
function assessmentForm(id, q) {
  const dims = q.dimensions || {}; const keys = Object.keys(dims);
  return `${lbl('คำนำ')}${area(id, 'prompt', q.prompt)}
    ${lbl('ข้อความประเมิน (เลือกด้าน)')}${(q.statements || []).map((s, i) => `<div class="qf-opt">${inp(id, `statements.${i}.text`, s.text)}<select class="qf-sel" data-qid="${id}" data-path="statements.${i}.dimension">${keys.map((k) => `<option value="${k}" ${s.dimension === k ? 'selected' : ''}>${escA(dims[k])}</option>`).join('')}</select></div>`).join('')}
    ${lbl('คำอธิบาย')}${area(id, 'explanation', q.explanation)}`;
}

function addQuestion() {
  const n = qidsFor(qMission).length + 1; const id = `${qMission}_q${n}`; const t = missionType(qMission);
  const tpl = {
    scenario: { situation: '', options: [{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }], correct: 'A', explanation: '', xp: 100 },
    investigation: { headline: '', source: '', date: '', quote: '', evidence: [{ label: 'หลักฐาน A', text: '' }], question: 'ข่าวนี้น่าเชื่อถือหรือไม่?', options: [{ key: 'TRUE', text: 'จริง' }, { key: 'FALSE', text: 'ปลอม' }, { key: 'UNSURE', text: 'หลักฐานไม่พอ' }], correct: 'FALSE', explanation: '', xp: 150 },
    dragsort: { prompt: '', buckets: [{ key: 'a', label: 'A', labelTh: 'กลุ่ม A' }, { key: 'b', label: 'B', labelTh: 'กลุ่ม B' }], cards: [{ id: 'c1', text: '', correct: 'a' }], explanation: '', xp: 150 },
    ordering: { scenario: '', steps: [{ id: 's1', text: '' }, { id: 's2', text: '' }], correctOrder: ['s1', 's2'], explanation: '', xp: 300 },
    assessment: { prompt: '', scale: [{ v: 0, label: 'ไม่เคย' }, { v: 1, label: 'บางครั้ง' }, { v: 2, label: 'บ่อย' }, { v: 3, label: 'เกือบทุกวัน' }], dimensions: { focus: 'สมาธิ', wellbeing: 'สุขภาวะ' }, statements: [{ id: 's1', text: '', dimension: 'focus' }], explanation: '', xp: 200 },
  }[t] || {};
  qmodel[id] = { id, missionId: qMission, type: t, ...tpl };
  renderQList();
  const list = $('#qList'); list.lastElementChild && list.lastElementChild.scrollIntoView({ block: 'center' });
}
function renumberDelete(delId) {
  // delete then re-number the mission's questions so ids stay m_q1..N (no gaps)
  const ids = qidsFor(qMission); delete qmodel[delId];
  const remaining = ids.filter((x) => x !== delId).map((x) => qmodel[x]);
  ids.forEach((x) => delete qmodel[x]);
  remaining.forEach((q, i) => { const nid = `${qMission}_q${i + 1}`; q.id = nid; qmodel[nid] = q; });
}
async function saveQuestions() {
  const msg = $('#qMsg'), btn = $('#qSave');
  qFull.questions = qmodel;
  const oldHtml = btn.innerHTML; btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    await saveSettings('questions', qmodel); // → Firestore, live immediately
    msg.textContent = `บันทึกสำเร็จ ✓ ${Object.keys(qmodel).length} คำถาม — ใช้ได้ทันที (นักเรียนเห็นเมื่อเข้า/โหลดหน้าใหม่)`; msg.className = 'ed-msg is-ok';
  } catch (e) {
    msg.textContent = 'บันทึกไม่สำเร็จ: ' + (e.code || e.message) + ' — ต้องล็อกอินเป็นผู้ดูแล (role admin)'; msg.className = 'ed-msg is-err';
  }
  btn.disabled = false; btn.innerHTML = oldHtml;
}

/* ---------------- shared ---------------- */
function activeBanner() { return `<div class="active-banner">เซสชัน: <b>${state.active.code}</b> · ${state.users.length} คน <button class="ds-chip" onclick="document.querySelector('.admin-tab[data-tab=&quot;sessions&quot;]').click()">เปลี่ยน</button></div>`; }
function pickFirst() { return `<div class="ds-card ds-empty"><span class="ds-feat">${icon('users')}</span><h3>ยังไม่ได้เลือกเซสชัน</h3><p>ไปที่แท็บ “เซสชัน” แล้วกด “เลือก”</p></div>`; }
function errCard(msg) { return `<div class="ds-card ds-empty"><span class="ds-feat ds-feat--gold">${icon('alert')}</span><h3>เกิดข้อผิดพลาด</h3><p>${msg}</p></div>`; }
