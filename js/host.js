/* =================================================================
   Host controller (host.html) — JDKS ARENA
   full live control of the session state machine —
   pick a mission, START / LOCK / RESULTS / EXPLAIN / NEXT, with live
   player, answered and answer-distribution stats.
   ================================================================= */
import { onAuth, getTeacher, ensureTeacherProfile, signOutUser } from './auth.js';
import { loginUrl } from './topbar.js';
import { startIdleTimer } from './idle.js';
import { createSession, listenSession, listenPlayers, listenQuestionAnswers, updateSession, updateStats,
  getQuestionAnswersOnce, getMissionPlayers, applyScores, writeLeaderboard,
  createDemoPlayers, submitAnswer } from './session.js';
import { loadGame, questionCount } from './content.js';
import { shapeIcon } from './game.js';
import { scoreQuestionAnswers } from './scoring.js';
import { icon, hydrateIcons } from './icons.js';
import { mascot } from './mascot.js';
import { dxConfirm, toast } from './dialog.js';
import { applyBrand } from './branding.js';

/* The five answer tiles, mirrored from js/game.js so the teacher's screen
   speaks the same colour/shape language the students are tapping. */
const TILE = [
  { c: '#E11D48', d: '#9F1239' }, { c: '#2563EB', d: '#1E40AF' },
  { c: '#F59E0B', d: '#B45309' }, { c: '#16A34A', d: '#166534' },
  { c: '#7C3AED', d: '#5B21B6' }, { c: '#0891B2', d: '#155E75' },
];
const tileStyle = (i) => `--tile:${TILE[i % TILE.length].c};--tile-d:${TILE[i % TILE.length].d}`;
const tileShape = (i) => shapeIcon(i);

const $ = (s) => document.querySelector(s);
const HOST_KEY = 'ds-host-session';
const state = { uid: null, sid: null, session: null, players: [], content: null, questions: {}, packId: undefined, brand: null };
const urlPack = new URLSearchParams(location.search).get('pack');
let unsubSession = null, unsubPlayers = null, unsubAnswers = null, answersQid = null, timerIv = null;
const scoredLocal = new Set();
const demoAnsweredQ = new Set();
let lastLbKey = '';
// เวลาตอบต่อข้อ (วิทยากรเลือกได้ก่อนกด “เริ่ม”). 0 = ไม่จำกัดเวลา.
const DURATIONS = [20, 30, 45, 60, 90, 0];
let selectedDuration = 45;

/* ---------------- staff idle auto-logout (1 ชม.) ---------------- */
let idleStarted = false;
function startStaffIdle() {
  if (idleStarted) return; idleStarted = true;
  startIdleTimer({ key: 'ds-idle-staff', minutes: 60, onIdle: async () => {
    try { await signOutUser(); } catch (_e) {}
    try { localStorage.removeItem('ds-idle-staff'); } catch (_e) {}
    location.reload();
  } });
}

/* ---------------- staff login ----------------
   The console is teachers-only: bounce to the real login page and come
   straight back here (with the same ?pack=) once they are in. */
function showLogin() {
  location.replace(loginUrl('login'));
}

/* Visual preview of this console on localhost only: ?preview=1 skips the
   teacher gate and paints fake data. It never touches Firestore (sid='demo'). */
const PREVIEW = location.hostname === 'localhost' && new URLSearchParams(location.search).get('preview') === '1';

/* ---------------- boot ---------------- */
onAuth(async (user) => {
  if (PREVIEW) return;
  if (!user || user.isAnonymous) return showLogin();
  const teacher = (await getTeacher(user.uid)) || (await ensureTeacherProfile(user).catch(() => null));
  if (!teacher) return showLogin();
  state.brand = teacher.brand || null;
  applyBrand(state.brand);
  startStaffIdle(); // auto sign-out after 1h idle
  state.uid = user.uid;
  let sid = null; try { sid = localStorage.getItem(HOST_KEY); } catch (_e) {}
  if (sid) { attachSession(sid); return; }
  // No live room yet: the pack to play comes from ?pack= (the dashboard link).
  await ensureGameLoaded(urlPack || null);
  renderCreate();
});

/** Load this room's content once. Safe to call repeatedly.
    The sessionId matters: the room's frozen copy is what the students are
    playing, so the console has to read the same thing, or the two ends drift
    apart the moment the teacher edits the pack. */
async function ensureGameLoaded(packId, sessionId = null) {
  if (state.packId === packId && state.contentSid === sessionId && state.content) return;
  const g = await loadGame(packId, sessionId);
  state.contentSid = sessionId;
  state.packId = packId;
  state.content = g.content;
  state.questions = g.questions;
}

/* ---------------- create session ---------------- */
function renderCreate() {
  stage().innerHTML = `<div class="hx-empty">
    ${mascot('rocket', { size: 150 })}
    <h3>พร้อมเปิดห้องแล้ว</h3>
    <p>เปิดห้องจริงให้นักเรียนเข้าด้วยรหัส 5 ตัว — หรือลองซ้อมกับบอต 10 ตัวก่อนก็ได้</p>
    <div class="jx-hero__cta">
      <button class="ds-btn ds-btn--primary" id="mkSession">${icon('room')} เปิดห้องเรียน</button>
      <button class="ds-btn ds-btn--ghost" id="mkDemo">${icon('robot')} ซ้อม + บอต 10 ตัว</button>
    </div>
  </div>`;
  $('#mkSession').addEventListener('click', () => doCreate(false));
  $('#mkDemo').addEventListener('click', () => doCreate(true));
}
async function doCreate(demo) {
  $('#mkSession').disabled = true; $('#mkDemo').disabled = true;
  try {
    const s = await createSession(state.uid, {
      demo, packId: urlPack || null,
      title: (state.content && state.content.title) || 'JDKS Arena',
      brand: state.brand,          // snapshot — see js/branding.js
    });
    if (demo) await createDemoPlayers(s.id, 10);
    localStorage.setItem(HOST_KEY, s.id);
    attachSession(s.id);
  } catch (e) { toast('เปิดห้องไม่สำเร็จ: ' + (e.message || e), 'error'); renderCreate(); }
}

/* ---------------- attach + control skeleton ---------------- */
function attachSession(sid) {
  state.sid = sid;
  if (unsubSession) unsubSession();
  if (unsubPlayers) unsubPlayers();

  // The mission rail needs the pack, and the pack id lives on the session —
  // so nothing is drawn until the first snapshot arrives. (Drawing earlier is
  // what used to leave the console stuck on "กำลังเตรียมแผงควบคุม…" after a
  // reload: state.content was still null.)
  let ready = false;
  const watchdog = setTimeout(() => {
    if (ready) return;
    stage().innerHTML = `<div class="hx-empty">${mascot('clock', { size: 130 })}
      <h3>เปิดห้องเดิมไม่สำเร็จ</h3>
      <p>อ่านข้อมูลห้องไม่ได้ — อาจถูกลบไปแล้ว หรือเครือข่ายมีปัญหา</p>
      <div class="jx-hero__cta">
        <button class="ds-btn ds-btn--primary" id="forgetRoom">เปิดห้องใหม่</button>
        <button class="ds-btn ds-btn--ghost" id="retryRoom">ลองใหม่อีกครั้ง</button>
      </div></div>`;
    const f = $('#forgetRoom'); if (f) f.addEventListener('click', forgetRoom);
    const r = $('#retryRoom'); if (r) r.addEventListener('click', () => location.reload());
  }, 9000);

  unsubSession = listenSession(sid, async (s) => {
    if (!s) { forgetRoom(); return; }
    try { await ensureGameLoaded(s.packId || null, sid); }
    catch (_e) { state.content = state.content || { missions: [], levels: [], badges: [], xpRules: {} }; }
    if (!ready) { ready = true; clearTimeout(watchdog); renderMissions(); }
    state.session = s;
    renderControl(s);
    watchAnswers(s);
  }, (err) => {
    clearTimeout(watchdog);
    stage().innerHTML = `<div class="hx-empty">${mascot('clock', { size: 130 })}
      <h3>เชื่อมต่อห้องไม่ได้</h3><p>${esc((err && err.message) || 'ไม่ทราบสาเหตุ')}</p>
      <div class="jx-hero__cta"><button class="ds-btn ds-btn--primary" id="forgetRoom">เปิดห้องใหม่</button></div></div>`;
    const f = $('#forgetRoom'); if (f) f.addEventListener('click', forgetRoom);
  });
  unsubPlayers = listenPlayers(sid, (players) => { state.players = players; renderStats(); });
}

/** End the round: close the room, then hand the teacher a brand-new code.
    Room codes are single-use, so the one just finished can never be joined
    again — the next class always starts on a clean code. */
async function endActivity() {
  if (!state.sid) return;
  const ok = await dxConfirm({
    title: 'จบกิจกรรมรอบนี้?',
    message: 'ผู้เรียนจะเห็นหน้าสรุปผลทันที ห้องนี้จะปิดถาวร\nแล้วระบบจะออกรหัสห้องใหม่ให้คุณโดยอัตโนมัติ',
    ok: 'จบกิจกรรม', cancel: 'ยังไม่จบ', danger: true,
  });
  if (!ok) return;
  if (!(await push({ status: 'closed', finalAnnounce: false }, 'จบกิจกรรม'))) return;
  await rotateRoom();
}

/** Open the next room and switch this console to it. */
async function rotateRoom() {
  try {
    const s = await createSession(state.uid, {
      packId: state.packId || urlPack || null,
      title: (state.content && state.content.title) || 'JDKS Arena',
      brand: state.brand,
    });
    try { localStorage.setItem(HOST_KEY, s.id); } catch (_e) {}
    scoredLocal.clear(); demoAnsweredQ.clear(); lastLbKey = ''; lastStats = {};
    state.players = []; renderStats();
    attachSession(s.id);
    toast(`ห้องเดิมปิดแล้ว · รหัสใหม่คือ ${s.code}`, 'success');
  } catch (e) {
    toast('เปิดห้องใหม่ไม่สำเร็จ: ' + ((e && e.message) || e), 'error');
    forgetRoom();
  }
}

/** Drop the remembered room and go back to the "open a room" screen. */
function forgetRoom() {
  try { localStorage.removeItem(HOST_KEY); } catch (_e) {}
  scoredLocal.clear(); demoAnsweredQ.clear(); lastLbKey = ''; lastStats = {};
  if (unsubSession) unsubSession(); if (unsubPlayers) unsubPlayers(); if (unsubAnswers) unsubAnswers();
  unsubSession = unsubPlayers = unsubAnswers = null; answersQid = null;
  state.sid = null; state.session = null;
  setText('#codeVal', '—————');
  ensureGameLoaded(urlPack || null).catch(() => {}).then(renderCreate);
}

const stage = () => document.getElementById('centerStage');

/** The mission rail. Called once the pack is known. */
function renderMissions() {
  const rail = document.getElementById('missionRail');
  if (!rail) return;
  const missions = (state.content && state.content.missions) || [];
  if (!missions.length) {
    rail.innerHTML = '<p class="hx-none">ชุดนี้ยังไม่มีภารกิจ</p>';
    return;
  }
  rail.innerHTML = missions.map((m) => `<button class="m-tile" data-mid="${esc(m.id)}">
    <span class="m-tile__no">${m.id === 'boss' ? icon('crown') : String(m.no).padStart(2, '0')}</span>
    <span class="m-tile__t">${esc(m.titleTh || m.title || m.id)}</span>
    <span class="m-tile__done" aria-label="เล่นแล้ว">${icon('check')}</span>
  </button>`).join('');
  rail.querySelectorAll('.m-tile').forEach((t) =>
    t.addEventListener('click', () => startMission(t.dataset.mid)));
}

/** Top-bar + control-bar buttons live in the page, so wire them once. */
(function wireChrome() {
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

  on('endSession', endActivity);
  on('announceBtn', async () => {
    if (!state.sid) return;
    const ok = await dxConfirm({
      title: 'ประกาศผลรวม',
      message: 'ห้องจะปิดและผู้เรียนเห็นหน้าสรุปผล จากนั้นคุณเผยอันดับทีละขั้นบนจอฉายได้\nเมื่อประกาศเสร็จ กด “จบกิจกรรม” เพื่อรับรหัสห้องใหม่',
      ok: 'เริ่มประกาศ', cancel: 'ยังก่อน',
    });
    if (ok) push({ status: 'closed', finalAnnounce: true, announceStep: 0 }, 'ประกาศผลรวม');
  });
  on('newSession', async () => {
    const ok = await dxConfirm({
      title: 'เปิดห้องใหม่?',
      message: 'ห้องปัจจุบันจะยังอยู่ในระบบ แต่คุณจะได้รหัสห้องใหม่สำหรับรอบถัดไป',
      ok: 'เปิดห้องใหม่', cancel: 'ยกเลิก',
    });
    if (ok) await rotateRoom();
  });

  // the ⋯ menu
  const btn = document.getElementById('moreBtn');
  const menu = document.getElementById('moreMenu');
  if (btn && menu) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.hidden = true; });
    menu.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { menu.hidden = true; }));
  }

  document.querySelectorAll('.hx-bar--bottom [data-act]').forEach((b) =>
    b.addEventListener('click', () => onAction(b.dataset.act)));
})();

/* ---------------- render ---------------- */
function renderControl(s) {
  setText('#codeVal', s.code || '—————');
  const pl = $('#presenterLink'); if (pl) pl.href = `presenter.html?s=${s.code}`;

  const done = s.completedMissions || [];
  document.querySelectorAll('.m-tile').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.mid === s.currentMission);
    t.classList.toggle('is-done', done.includes(t.dataset.mid));
  });

  const el = stage();
  const missions = (state.content && state.content.missions) || [];
  const m = missions.find((x) => x.id === s.currentMission);

  if (s.status === 'closed') {
    if (s.finalAnnounce) renderAnnounceControls(s);
    else el.innerHTML = `<div class="hx-empty">${mascot('trophy', { size: 140 })}
      <h3>จบกิจกรรมแล้ว</h3>
      <p>เลือก “ประกาศผลรวม” จากเมนูมุมขวาบน เพื่อเผยอันดับทีละขั้นบนจอฉาย
         หรือ “เปิดห้องใหม่” เพื่อรับรหัสห้องใหม่สำหรับรอบต่อไป</p></div>`;
  } else if (!s.currentMission) {
    const nid = nextMissionId(s);
    const nm = missions.find((x) => x.id === nid);
    el.innerHTML = `<div class="hx-empty">${mascot('owl', { size: 140 })}
      <h3>พร้อมเริ่มเกมแล้ว</h3>
      <p>แตะภารกิจจากรายการด้านซ้ายเพื่อเลือกเอง หรือกดปุ่มนี้เพื่อเริ่มภารกิจถัดไปได้เลย</p>
      <div class="jx-hero__cta">
        <button class="ds-btn ds-btn--primary" id="startFirst" ${nid ? '' : 'disabled'}>
          ${icon('play')} เริ่ม${nm ? ' “' + esc(nm.titleTh || nm.title) + '”' : ''}</button>
      </div></div>`;
    const b = el.querySelector('#startFirst');
    if (b) b.addEventListener('click', () => startMission(nid));
  } else {
    const total = questionCount(state.questions, s.currentMission);
    const q = s.currentQuestion ? state.questions[s.currentQuestion] : null;
    const open = s.phase === 'question_open';
    if (typeof s.questionDuration === 'number' && !open) selectedDuration = s.questionDuration;

    const phaseCls = open ? 'hx-pill--live' : (s.phase === 'locked' ? 'hx-pill--warn' : '');
    el.innerHTML = `
      <div class="hx-head">
        <span class="hx-pill ${phaseCls}">${phaseTh(s.phase)}</span>
        ${s.currentQuestion ? `<span class="hx-step">ข้อ ${s.questionIndex || 1}${total ? ' / ' + total : ''}</span>` : ''}
        <div class="host-timer" id="hostTimer"></div>
      </div>
      <h2 class="hx-mission">${esc(m ? (m.titleTh || m.title) : s.currentMission)}</h2>
      ${m && m.topicTh ? `<p class="hx-topic">${esc(m.topicTh)}</p>` : ''}
      <p class="hx-pill" style="margin-bottom:16px">${icon('point')} ${hostHint(s)}</p>
      ${!s.currentQuestion && m && m.script
        ? `<div class="hx-cue"><div class="hx-cue__h">${icon('mic')} บทเกริ่นนำ — พูดนำก่อนกด “เริ่ม”</div><p>${esc(m.script)}</p></div>` : ''}
      ${q ? hostQuestionView(q, s) : (total ? '' : '<p class="hx-none">ภารกิจนี้ยังไม่มีคำถาม</p>')}
      ${s.phase === 'revealed' ? `<div class="host-live-chips">
          ${s.showAnswer ? `<span class="host-live host-live--on">${icon('check')} เฉลยขึ้นทุกจอแล้ว</span>` : '<span class="host-live">เฉลยยังไม่ขึ้นจอ</span>'}
          ${s.showResults ? `<span class="host-live host-live--on">${icon('check')} ผลคะแนนขึ้นทุกจอแล้ว</span>` : '<span class="host-live">ผลคะแนนยังไม่ขึ้นจอ</span>'}
        </div>` : ''}
      ${!open ? durationPicker() : ''}`;
    hydrateIcons(el);
    if (!open) el.querySelectorAll('.host-dur__opt').forEach((b) => b.addEventListener('click', () => {
      selectedDuration = Number(b.dataset.dur);
      el.querySelectorAll('.host-dur__opt').forEach((x) => x.classList.toggle('is-on', x === b));
    }));
  }

  updateQuickbar(s);
  runTimer(s);
  maybeScore(s);
  if (s.demo) maybeDemo(s);
}

/* ---------------- final announcement controls (เผยทีละอันดับ) ---------------- */
function renderAnnounceControls(s) {
  const cq = stage(); if (!cq) return;
  const N = Math.min(state.players.length, 20);
  const step = Math.max(0, Math.min(typeof s.announceStep === 'number' ? s.announceStep : N, N));
  const nextRank = N - step;
  if (!N) { cq.innerHTML = `<div class="host-announce"><div class="host-announce__h">${icon('trophy')} ประกาศผลรวม</div><p class="ds-muted">ยังไม่มีผู้เล่นในเซสชันนี้</p></div>`; hydrateIcons(cq); return; }
  cq.innerHTML = `<div class="host-announce">
    <div class="host-announce__h">${icon('trophy')} ประกาศผลรวม — เผยทีละอันดับ</div>
    <p class="ds-muted" style="font-size:.9rem">เผยจากอันดับท้าย ไล่ขึ้นหาที่ 1 (ลุ้นบนจอฉาย) · เผยครบแล้วจะขึ้นแท่น 1-2-3 + คอนเฟตติ</p>
    <div class="host-announce__meta">เผยแล้ว <b>${step}</b> / ${N} อันดับ${step < N ? ` · ถัดไป: <b>อันดับที่ ${nextRank}</b>` : ' · ครบแล้ว'}</div>
    <div class="host-announce__btns">
      <button class="ds-btn ds-btn--primary" id="revNext" type="button" ${step >= N ? 'disabled' : ''}>เผยอันดับถัดไป</button>
      <button class="ds-btn ds-btn--ghost" id="revAll" type="button" ${step >= N ? 'disabled' : ''}>เผยทั้งหมด</button>
      <button class="ds-btn ds-btn--ghost" id="revReset" type="button" ${step <= 0 ? 'disabled' : ''}>เริ่มใหม่</button>
    </div>
  </div>`;
  hydrateIcons(cq);
  const set = (v) => push({ announceStep: v }, 'เผยอันดับ');
  cq.querySelector('#revNext')?.addEventListener('click', () => set(Math.min(N, step + 1)));
  cq.querySelector('#revAll')?.addEventListener('click', () => set(N));
  cq.querySelector('#revReset')?.addEventListener('click', () => set(0));
}

/* ---------------- duration picker (§วิทยากรกำหนดเวลาต่อข้อ) ---------------- */
/* "ไม่ตัดเวลา" used to read "ไม่จำกัด", which sounds like the clock stops
   mattering. It does not: nothing cuts the question off, but the speed bonus
   still runs against a one-minute assumption, so an answer after a minute
   scores the same 40% floor as the slowest answer on a timed question. Say
   that on the button instead of leaving the teacher to discover it. */
function durationPicker() {
  return `<div class="host-dur">
    <span class="host-dur__lbl">⏱ เวลาตอบต่อข้อ</span>
    <div class="host-dur__opts">
      ${DURATIONS.map((d) => `<button type="button" class="host-dur__opt ${d === selectedDuration ? 'is-on' : ''}" data-dur="${d}">${d === 0 ? 'ไม่ตัดเวลา' : d + ' วิ'}</button>`).join('')}
    </div>
    <p class="host-dur__note">${selectedDuration === 0
      ? 'ไม่ปิดรับคำตอบเอง คุณกด “ล็อก” เมื่อพร้อม — แต่คะแนนยังลดตามความเร็วอยู่ ตอบหลังหนึ่งนาทีได้ 40% ของข้อนั้น'
      : `ปิดรับคำตอบอัตโนมัติเมื่อครบ ${selectedDuration} วินาที · ยิ่งตอบเร็วยิ่งได้คะแนนเยอะ ช้าสุดได้ 40%`}</p>
  </div>`;
}

/* ---------------- host question view — เห็นคำถาม+เฉลย+คำอธิบายเพื่อบรรยาย ---------------- */
function hostQuestionView(q, s) {
  const answered = s.phase === 'revealed';
  let body = '';
  if (q.type === 'scenario' || q.type === 'investigation') {
    if (q.type === 'investigation') {
      body += `<div class="hq-news"><div class="hq-news__tag">${icon('search')} ข่าวที่ต้องตรวจสอบ</div>
        <div class="hq-news__hl">${esc(q.headline)}</div>
        <div class="hq-news__meta">ที่มา: ${esc(q.source || '—')} · ${esc(q.date || '')}</div>
        ${q.quote ? `<blockquote class="hq-news__q">${esc(q.quote)}</blockquote>` : ''}</div>`;
      if (q.evidence && q.evidence.length) body += `<div class="hq-ev"><b>หลักฐาน/เบาะแส:</b><ul>${q.evidence.map((e) => `<li><b>${esc(e.label)}:</b> ${esc(e.text)}</li>`).join('')}</ul></div>`;
      body += `<p class="hq-prompt">${esc(q.question)}</p>`;
    } else {
      body += `<p class="hq-prompt">${esc(q.q_prompt || q.situation)}</p>`;
    }
    body += `<div class="hq-opts">${(q.options || []).map((o, i) => `<div class="hq-opt ${o.key === q.correct ? 'is-correct' : ''}">
      <span class="hq-opt__k" style="${tileStyle(i)}" title="ตัวเลือก ${esc(o.key)}">${tileShape(i)}</span>
      <span>${esc(o.text)}</span>
      ${o.key === q.correct ? `<span class="hq-opt__mk">${icon('check')} เฉลย</span>` : ''}</div>`).join('')}</div>`;
  } else if (q.type === 'dragsort') {
    body += `<p class="hq-prompt">${esc(q.prompt)}</p>`;
    body += `<div class="hq-map">${(q.cards || []).map((c) => { const b = (q.buckets || []).find((x) => x.key === c.correct); return `<div class="hq-map__row"><span>${esc(c.text)}</span><span class="hq-map__ar">→</span><b>${esc(b ? (b.labelTh || b.label) : c.correct)}</b></div>`; }).join('')}</div>`;
  } else if (q.type === 'ordering') {
    body += `<p class="hq-prompt">${esc(q.scenario)}</p>`;
    body += `<ol class="hq-order">${(q.correctOrder || []).map((id) => { const st = (q.steps || []).find((x) => x.id === id); return `<li>${esc(st ? st.text : id)}</li>`; }).join('')}</ol>`;
  } else if (q.type === 'assessment') {
    body += `<p class="hq-prompt">${esc(q.prompt)}</p>`;
    body += `<div class="hq-ev"><ul>${(q.statements || []).map((st) => `<li>${esc(st.text)}</li>`).join('')}</ul></div>`;
    body += `<p class="ds-muted" style="font-size:.85rem">แบบประเมินตนเอง — ไม่มีถูก/ผิด (ทุกคนได้ XP เท่ากัน)</p>`;
  }
  const expl = q.explanation ? `<div class="hq-expl"><b>${icon('bulb')} คำอธิบาย (สำหรับบรรยายเพิ่มเติม):</b><p>${esc(q.explanation)}</p></div>` : '';
  return `<div class="host-qview ${answered ? 'is-revealed' : ''}">${body}${expl}</div>`;
}

/* ---------------- demo bots (§40) ---------------- */
async function maybeDemo(s) {
  if (s.phase !== 'question_open' || !s.currentQuestion) return;
  const qid = s.currentQuestion;
  if (demoAnsweredQ.has(qid)) return;
  demoAnsweredQ.add(qid);
  const q = state.questions[qid];
  if (!q) return;
  const bots = state.players.filter((p) => p.room === 'DEMO' || (p.nickname || '').startsWith('Bot-'));
  bots.forEach((bot) => {
    const delay = 600 + Math.floor(Math.random() * 9000);
    setTimeout(() => {
      const a = simulateAnswer(q);
      submitAnswer({ sessionId: state.sid, playerId: bot.playerId, hostUid: state.uid }, a).catch(() => {});
    }, delay);
  });
}
function simulateAnswer(q) {
  const correct = Math.random() < 0.6;
  let choice, isCorrect = correct;
  if (q.type === 'scenario' || q.type === 'investigation') {
    if (correct) choice = q.correct;
    else { const wrong = q.options.map((o) => o.key).filter((k) => k !== q.correct); choice = wrong[Math.floor(Math.random() * wrong.length)] || q.correct; }
  } else if (q.type === 'dragsort') {
    choice = {}; q.cards.forEach((c) => { choice[c.id] = correct ? c.correct : q.buckets[Math.floor(Math.random() * q.buckets.length)].key; });
    isCorrect = q.cards.every((c) => choice[c.id] === c.correct);
  } else if (q.type === 'ordering') {
    choice = correct ? [...q.correctOrder] : [...q.steps].map((s) => s.id).sort(() => Math.random() - 0.5);
    isCorrect = choice.every((id, i) => id === q.correctOrder[i]);
  } else if (q.type === 'assessment') {
    choice = {}; q.statements.forEach((s) => { choice[s.id] = Math.floor(Math.random() * 4); }); isCorrect = null;
  } else { choice = 'A'; }
  return { questionId: q.id, missionId: q.missionId, choice, isCorrect, responseMs: 1000 + Math.floor(Math.random() * 14000) };
}

/* ---------------- scoring at reveal (idempotent, staff-only) ---------------- */
async function maybeScore(s) {
  if (s.phase !== 'revealed' || !s.currentQuestion) return;
  const qid = s.currentQuestion;
  if (scoredLocal.has(qid) || (s.scoredQuestions || []).includes(qid)) return;
  scoredLocal.add(qid);
  try {
    const q = state.questions[qid];
    if (!q) return;
    const rules = (state.content && state.content.xpRules) || {};
    const answers = await getQuestionAnswersOnce(state.sid, qid);
    // the clock the students actually had — drives the speed bonus
    const limitMs = (typeof s.questionDuration === 'number' ? s.questionDuration : 45) * 1000;
    const updates = scoreQuestionAnswers(q, answers, rules, limitMs);

    const count = questionCount(state.questions, s.currentMission);
    const isLast = count && (s.questionIndex || 0) >= count;
    const alreadyDone = (s.completedMissions || []).includes(s.currentMission);
    if (isLast && !alreadyDone) {
      const mission = (state.content.missions || []).find((m) => m.id === s.currentMission);
      const badge = mission && mission.badge;
      const bonus = rules.missionComplete || 500;
      const players = await getMissionPlayers(state.sid, s.currentMission);
      players.forEach((pid) => {
        let u = updates.find((x) => x.playerId === pid);
        if (!u) { u = { playerId: pid, missionId: s.currentMission, xpDelta: 0 }; updates.push(u); }
        u.xpDelta += bonus; if (badge) u.badge = badge; u.progressDelta = 1;
      });
    }
    // One batch: the XP and the "already scored" marker land together, so a
    // retry after a failure can never award the same question twice.
    await applyScores(state.sid, updates, {
      scoredQuestion: qid,
      completedMission: (isLast && !alreadyDone) ? s.currentMission : null,
    });
  } catch (e) {
    scoredLocal.delete(qid); // allow retry on next snapshot
    toast('ให้คะแนนข้อนี้ไม่สำเร็จ — ระบบจะลองใหม่เอง ถ้ายังไม่ขึ้นให้กด “เฉลย” ซ้ำ', 'error');
    try { console.error('[JDKS Arena scoring]', e); } catch (_e) {}
  }
}

function renderStats() {
  const online = state.players.filter((p) => p.lastSeen && p.lastSeen.toMillis && (Date.now() - p.lastSeen.toMillis() < 240000)).length;
  setStat(0, online);
  setStat(1, state.players.length);
  const xps = state.players.map((p) => p.xp || 0);
  setStat(3, xps.length ? Math.round(xps.reduce((a, b) => a + b, 0) / xps.length) : 0);
  // Denormalize counts to the SEPARATE stats doc (presenter-only) — keeps these
  // frequent writes off the session doc that all students listen to.
  pushStats({ playersOnline: online, playersJoined: state.players.length });
  renderLeaderboard();
}

/* ---------------- leaderboard ---------------- */
function renderLeaderboard() {
  const ranked = [...state.players]
    .map((p) => ({ playerId: p.playerId || '—', nickname: p.nickname || '—', xp: p.xp || 0 }))
    .sort((a, b) => b.xp - a.xp);
  const top = ranked.slice(0, 10);        // host side panel
  const board = ranked.slice(0, 20);      // presenter / students / final announcement
  const el = document.getElementById('lbList');
  if (el) {
    el.innerHTML = top.length ? top.map((p, i) => `<div class="lb-row">
      <span class="lb-rank ${i < 3 ? 'lb-rank--top' : ''}">${i + 1}</span>
      <span class="lb-name">${esc(p.nickname) || '—'} <span class="ds-pid">${esc(p.playerId)}</span></span>
      <span class="lb-xp">${(p.xp || 0).toLocaleString('en-US')}</span></div>`).join('')
      : '<p class="ds-muted ds-center" style="padding:14px 0">ยังไม่มีคะแนน</p>';
  }
  // Persist top-N (no private data) for presenter/students — only when changed.
  const key = board.map((p) => `${p.playerId}:${p.xp}`).join('|');
  if (key !== lastLbKey && state.sid && state.sid !== 'demo') { lastLbKey = key; writeLeaderboard(state.sid, board).catch(() => {}); }
}

/** Throttle answeredCount denormalization to at most ~1 write / 3s. */
let answeredTimer = null, answeredPending = null;
function pushAnsweredThrottled(count) {
  answeredPending = count;
  if (answeredTimer) return;
  answeredTimer = setTimeout(() => { answeredTimer = null; pushStats({ answeredCount: answeredPending }); }, 3000);
}

/** Write volatile counts to the stats doc, only when a value actually changed. */
let lastStats = {};
function pushStats(patch) {
  if (!state.sid || state.sid === 'demo') return;
  const diff = {};
  Object.keys(patch).forEach((k) => { if (lastStats[k] !== patch[k]) diff[k] = patch[k]; });
  if (Object.keys(diff).length) { Object.assign(lastStats, diff); updateStats(state.sid, diff).catch(() => {}); }
}

function watchAnswers(s) {
  const qid = s.currentQuestion;
  if (qid === answersQid) return;
  answersQid = qid;
  if (unsubAnswers) { unsubAnswers(); unsubAnswers = null; }
  pushStats({ answeredCount: 0 }); // reset immediately on question change (no stale count)
  if (!qid) { setStat(2, 0); paintDistribution([]); return; }
  paintDistribution([]);   // draw this question's empty bars right away
  unsubAnswers = listenQuestionAnswers(state.sid, qid, (answers) => {
    setStat(2, answers.length);
    paintDistribution(answers);
    pushAnsweredThrottled(answers.length); // throttle session writes (§26)
  });
}

/** Live answer spread, drawn with the SAME colours and shapes the students
    see on their tiles — so the teacher can say "สามเหลี่ยมแดงเยอะสุด" and the
    whole room knows which option that is. Questions without options (จับคู่ /
    เรียงลำดับ / ประเมินตนเอง) get a plain count instead of bars. */
function paintDistribution(answers) {
  const list = document.getElementById('distList');
  if (!list) return;
  const s = state.session;
  const q = s && s.currentQuestion ? state.questions[s.currentQuestion] : null;
  const opts = (q && Array.isArray(q.options)) ? q.options : null;

  if (!q) {
    list.innerHTML = '<p class="ds-muted ds-center" style="padding:14px 0">ยังไม่ได้เปิดคำถาม</p>';
    return;
  }
  if (!opts) {
    list.innerHTML = `<p class="ds-center" style="padding:14px 0">
      <b style="font-family:var(--font-display);font-size:1.6rem;color:var(--electric)">${answers.length}</b>
      <span class="ds-muted" style="display:block;font-size:.88rem">คนส่งคำตอบแล้ว · คำถามแบบนี้ไม่มีตัวเลือกให้นับ</span></p>`;
    return;
  }

  const counts = opts.map(() => 0);
  const byKey = {};
  opts.forEach((o, i) => { byKey[String(o.key)] = i; });
  answers.forEach((a) => {
    const k = typeof a.choice === 'string' ? a.choice : null;
    const i = k != null ? byKey[k] : undefined;
    if (i != null) counts[i]++;
  });
  const total = answers.length || 1;
  const reveal = s.phase === 'revealed' && s.showAnswer;

  list.innerHTML = opts.map((o, i) => `<div class="dist ${reveal && o.key === q.correct ? 'is-correct' : ''}"
      style="${tileStyle(i)}" title="${esc(o.text)}">
      <span class="dist__k">${tileShape(i)}</span>
      <div class="dist__bar"><i style="width:${Math.round((counts[i] / total) * 100)}%"></i></div>
      <span class="dist__v">${counts[i]}</span>
    </div>`).join('');
}

/* ---------------- actions (state machine) ---------------- */
/** The first mission that has not been completed yet (else the first one). */
function nextMissionId(s) {
  const missions = (state.content && state.content.missions) || [];
  const done = s.completedMissions || [];
  const next = missions.find((m) => !done.includes(m.id));
  return (next || missions[0] || {}).id || null;
}

function startMission(mid) {
  if (!mid) { toast('ชุดคำถามนี้ยังไม่มีภารกิจ — เพิ่มภารกิจในหน้าแก้ไขชุดก่อน', 'error'); return; }
  push({ currentMission: mid, phase: 'mission_intro', currentQuestion: null, questionIndex: 0, showAnswer: false, showResults: false }, 'เริ่มภารกิจ');
}
function onAction(act) {
  const s = state.session; if (!s) return;
  const openNext = () => {
    const count = questionCount(state.questions, s.currentMission);
    const n = (s.questionIndex || 0) + 1;
    if (count && n > count) { toast('ครบทุกข้อของภารกิจนี้แล้ว — เลือกภารกิจถัดไปได้เลย'); return; }
    // เปิดคำถามใหม่: ใช้เวลาที่วิทยากรเลือกไว้ + รีเซ็ตสถานะเฉลย/ผลคะแนน
    push({ phase: 'question_open', currentQuestion: `${s.currentMission}_q${n}`, questionIndex: n, questionStartAt: Date.now(), questionDuration: selectedDuration, showAnswer: false, showResults: false }, 'เปิดคำถาม');
  };
  if (act === 'start') {
    // No mission picked yet? Don't dead-end the teacher — start the next one
    // they haven't played. Tapping a mission in the rail still overrides this.
    if (!s.currentMission) { startMission(nextMissionId(s)); return; }
    openNext();
  } else if (act === 'lock') {
    push({ phase: 'locked' }, 'ล็อกคำตอบ');
  } else if (act === 'results') {
    // ผลคะแนน — อิสระ, กดก่อนหรือหลังเฉลยก็ได้ (toggle)
    push({ phase: 'revealed', showResults: !s.showResults }, 'แสดงผลคะแนน');
  } else if (act === 'explain') {
    // เฉลยคำตอบ — อิสระจากผลคะแนน (toggle)
    push({ phase: 'revealed', showAnswer: !s.showAnswer }, 'แสดงเฉลย');
  } else if (act === 'next') {
    openNext();
  }
}

function updateQuickbar(s) {
  const en = { start: false, lock: false, results: false, explain: false, next: false };
  const on = { results: !!s.showResults, explain: !!s.showAnswer };
  const p = s.phase;
  if (s.status === 'closed') { /* all disabled — use ประกาศผล controls */ }
  else if (!s.currentMission) { en.start = true; }   // starts the next unplayed mission
  else if (p === 'mission_intro' || p === 'lobby') en.start = true;
  else if (p === 'question_open') { en.lock = true; en.results = true; en.explain = true; }
  else if (p === 'locked') { en.results = true; en.explain = true; }
  else if (p === 'revealed') {
    const count = questionCount(state.questions, s.currentMission);
    const more = !count || (s.questionIndex || 0) < count;
    en.results = true; en.explain = true; en.next = more;
  }
  document.querySelectorAll('.hx-bar--bottom [data-act]').forEach((b) => {
    b.disabled = !en[b.dataset.act];
    b.classList.toggle('is-live', !!on[b.dataset.act]);
  });
}

/* ---------------- timer ---------------- */
function runTimer(s) {
  if (timerIv) { clearInterval(timerIv); timerIv = null; }
  const el = () => $('#hostTimer');
  if (s.phase !== 'question_open' || !s.questionStartAt) { if (el()) el().textContent = ''; return; }
  if (s.questionDuration === 0) { if (el()) { el().textContent = '∞'; el().classList.remove('is-low'); } return; } // ไม่จำกัดเวลา
  const start = typeof s.questionStartAt === 'number' ? s.questionStartAt : (s.questionStartAt.toMillis ? s.questionStartAt.toMillis() : Date.now());
  const dur = (s.questionDuration || 30) * 1000;
  const tick = () => {
    const left = Math.max(0, Math.ceil((start + dur - Date.now()) / 1000));
    // seconds alone under a minute — easier to read at a glance than 00:24
    const t = el(); if (t) { t.textContent = left < 60 ? String(left) : fmtTime(left); t.classList.toggle('is-low', left <= 10); }
    if (left <= 0 && timerIv) { clearInterval(timerIv); timerIv = null; }
  };
  tick(); timerIv = setInterval(tick, 500);
}

/* ---------------- talking back to the teacher ---------------- */
/** Every write to the session goes through here, so a rejected write is never
    silent again — the teacher sees exactly why nothing happened. */
function push(patch, what = 'สั่งงาน') {
  if (!state.sid) { toast('ยังไม่ได้เปิดห้อง — กด “เปิดห้องเรียน” ก่อน', 'error'); return Promise.resolve(false); }
  return updateSession(state.sid, patch)
    .then(() => true)
    .catch((e) => {
      const code = (e && e.code) || '';
      toast(code === 'permission-denied'
        ? `${what}ไม่สำเร็จ: ไม่มีสิทธิ์แก้ห้องนี้ (ห้องนี้อาจเป็นของบัญชีอื่น)`
        : `${what}ไม่สำเร็จ: ${(e && e.message) || e}`, 'error');
      try { console.error('[JDKS Arena host]', code, e); } catch (_e) {}
      return false;
    });
}

/* ---------------- room-code chip: tap to copy ---------------- */
(function wireCodeChip() {
  const chip = document.getElementById('codeChip');
  if (!chip) return;
  chip.addEventListener('click', async () => {
    const code = (document.getElementById('codeVal') || {}).textContent || '';
    if (!code || code.startsWith('—')) return;
    try { await navigator.clipboard.writeText(code); } catch (_e) { return; }
    chip.classList.add('is-copied');
    setTimeout(() => chip.classList.remove('is-copied'), 1600);
  });
})();

/* ---------------- utils ---------------- */
function phaseTh(p) { return ({ lobby: 'ห้องรอ', mission_intro: 'เกริ่นภารกิจ', question_open: 'กำลังตอบ', locked: 'ล็อกคำตอบ', revealed: 'เฉลยแล้ว', paused: 'พักชั่วคราว' })[p] || p || '—'; }
/** Contextual "what to do next" hint for the host, by phase. */
function hostHint(s) {
  if (!s.currentMission) return 'แตะการ์ดภารกิจด้านล่างเพื่อเริ่ม';
  switch (s.phase) {
    case 'mission_intro': return 'อ่านบทเกริ่นนำ · เลือกเวลา แล้วกด “เริ่ม”';
    case 'question_open': return 'อ่านโจทย์ให้ฟัง · กด “ล็อก” เมื่อตอบครบหรือหมดเวลา';
    case 'locked': return 'กด “เฉลย” และ/หรือ “ผลคะแนน” ได้ตามลำดับที่ต้องการ';
    case 'revealed': return 'อธิบายเพิ่มเติม แล้วกด “ถัดไป” หรือแตะภารกิจใหม่';
    default: return 'แตะการ์ดภารกิจเพื่อเริ่ม';
  }
}
function fmtTime(sec) { const m = Math.floor(sec / 60), s = sec % 60; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function setStat(i, v) { const el = document.querySelectorAll('.hx-stat__n')[i]; if (el) el.textContent = (v || 0).toLocaleString('en-US'); }
function setText(sel, t) { const el = $(sel); if (el) el.textContent = t; }
function setHTML(sel, h) { const el = $(sel); if (el) el.innerHTML = h; }

/* Localhost-only UI preview (no Firestore writes) for visual verification. */
if (location.hostname === 'localhost') {
  window.__hostDemo = async (patch) => {
    const g = await loadGame(urlPack || null);
    state.content = g.content; state.questions = g.questions; state.packId = urlPack || null;
    state.sid = 'demo';
    renderMissions();
    state.session = { code: 'DEMO1', phase: 'mission_intro', currentMission: 'm4', questionIndex: 0, playersJoined: 24, completedMissions: ['m1', 'm2'], ...(patch || {}) };
    renderControl(state.session);
    state.players = Array.from({ length: 24 }, (_, i) => ({ playerId: 'P' + String(i + 1).padStart(3, '0'), nickname: 'Player' + (i + 1), xp: i * 40, lastSeen: { toMillis: () => Date.now() } }));
    renderStats();
  };

  if (PREVIEW) window.__hostDemo({ phase: 'question_open', currentQuestion: 'm4_q1', questionIndex: 1, questionStartAt: Date.now(), questionDuration: 45 });
}
