/* =================================================================
   Admin controller (admin.html) — DIGITAL SURVIVAL (§6, §31, §32)
   Sessions list · analytics · CSV/XLSX export · close/archive.
   Read-only content overview (content is edited in data/*.json).
   ================================================================= */
import { onAuth, signInStaff, getRole, authErrorTh } from './auth.js';
import { getSessions, getSessionUsers, getSessionAnswers, setSessionStatus, archiveSession } from './session.js';
import { loadContent, loadQuestions } from './content.js';
import { computeAnalytics } from './analytics.js';
import { exportCSV, exportXLSX } from './export.js';
import { icon, hydrateIcons } from './icons.js';

const $ = (s) => document.querySelector(s);
const state = { content: null, questions: {}, sessions: [], active: null, users: [], answers: [], analytics: null };

/* ---------------- login ---------------- */
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
      <span class="ds-chip">${n} ข้อ · ${m.type}</span></div>`; }).join('')}</div></div>`;
  hydrateIcons(box);
}
function countQ(mid) { let n = 0; while (state.questions[`${mid}_q${n + 1}`]) n++; return n; }

/* ---------------- shared ---------------- */
function activeBanner() { return `<div class="active-banner">เซสชัน: <b>${state.active.code}</b> · ${state.users.length} คน <button class="ds-chip" onclick="document.querySelector('.admin-tab[data-tab=&quot;sessions&quot;]').click()">เปลี่ยน</button></div>`; }
function pickFirst() { return `<div class="ds-card ds-empty"><span class="ds-feat">${icon('users')}</span><h3>ยังไม่ได้เลือกเซสชัน</h3><p>ไปที่แท็บ “เซสชัน” แล้วกด “เลือก”</p></div>`; }
function errCard(msg) { return `<div class="ds-card ds-empty"><span class="ds-feat ds-feat--gold">${icon('alert')}</span><h3>เกิดข้อผิดพลาด</h3><p>${msg}</p></div>`; }
