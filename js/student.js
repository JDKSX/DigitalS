/* =================================================================
   Student page controller (student.html) — JDKS ARENA
   Full Digital Passport (identity + XP + level + progress + badges)
   and a phase-reactive stage that mirrors the host's session state
   machine, delegating question rendering to the game engine.
   ================================================================= */
import { getStoredPlayer, listenPlayer, listenSession, listenLeaderboard, touchPresence, clearStoredPlayer } from './session.js';
import { loadGame, levelForXp } from './content.js';
import { onAuth, ensureStudentPersistence, ensureStudentAuth } from './auth.js';
import { auth } from './firebase.js';
import { icon, hydrateIcons } from './icons.js';
import { renderGame } from './game.js';
import { mascot } from './mascot.js';
import { startIdleTimer } from './idle.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => (n || 0).toLocaleString('en-US');
const state = {
  // start with empty-but-valid content so the first paint cannot crash while
  // the room's pack is still loading
  content: { missions: [], levels: [], badges: [] },
  questions: {}, player: null, session: null, leaderboard: [], stageKey: null, packId: undefined,
};

/** Load the pack this room plays (once). */
async function ensureGame(packId) {
  if (state.packId === packId && state.questions && Object.keys(state.questions).length) return;
  const g = await loadGame(packId);
  state.packId = packId;
  state.content = g.content;
  state.questions = g.questions;
  state.stageKey = null;
  renderBadges();
  paintPassport();      // levels are known now — redraw the ladder
}

/** Wait for Auth to restore the persisted (anonymous) user before listening. */
function waitForAuth() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (u) => { if (!done) { done = true; resolve(u); } };
    const unsub = onAuth((u) => { unsub(); finish(u); });
    setTimeout(() => finish(auth.currentUser || null), 6000);
  });
}

async function main() {
  const stored = getStoredPlayer();
  if (!stored) { showNotJoined(); return; }

  // iOS Safari FIX: pin auth to localStorage BEFORE restoring, so the anonymous
  // session from the join page is found here (IndexedDB is often blocked on
  // iPhone / in-app browsers). Then wait for the restored user; if it truly did
  // not survive (ephemeral storage), sign in anonymously so at least the session
  // loads and the student can still answer (scoring is keyed by playerId).
  await ensureStudentPersistence();
  let user = await waitForAuth();
  if (!user) { try { user = await ensureStudentAuth(); } catch (_e) {} }

  renderBadges();          // draw locked grid immediately
  renderStage();           // initial "connecting" state

  // Attach live listeners IMMEDIATELY — do not wait for the question bank, so
  // the passport + connection work even if content loads slowly (mobile).
  listenPlayer(stored.docId, (p) => {
    if (!p) { showNotJoined(); return; }
    state.player = p;
    paintPassport();
    renderBadges();
  }, (err) => setConn(false, err));

  let gotSession = false;
  listenSession(stored.sessionId, async (s) => {
    gotSession = true;
    setConn(true);
    if (s) { try { await ensureGame(s.packId || null); } catch (_e) {} }
    state.session = s;
    renderStage();
  }, (err) => { setConn(false, err); showConnHelp(err); });
  // Watchdog: if no session snapshot arrives (auth/storage blocked by an in-app
  // browser or Private mode), stop the endless "connecting" and show how to fix.
  setTimeout(() => { if (!gotSession) showConnHelp(); }, 9000);

  // อันดับคะแนน (สาธารณะ ไม่มีข้อมูลส่วนตัว) — ใช้แสดงเมื่อวิทยากรกด “ผลคะแนน”
  listenLeaderboard(stored.sessionId, (arr) => {
    state.leaderboard = arr || [];
    const s = state.session;
    if (s && s.phase === 'revealed' && s.showResults) { state.stageKey = null; renderStage(); }
  });

  // Presence heartbeat (cheap): on load + every 120s while visible, plus when
  // the tab becomes visible again. Longer interval keeps writes well under the
  // Spark budget with 120 players (§26/§36).
  touchPresence(stored.docId);
  setInterval(() => { if (document.visibilityState === 'visible') touchPresence(stored.docId); }, 180000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') touchPresence(stored.docId); });

  // Offline / online banner (§28)
  window.addEventListener('offline', showOffline);
  window.addEventListener('online', hideOffline);
  if (!navigator.onLine) showOffline();

  // Leave button clears local resume data
  document.querySelectorAll('.sp-leave').forEach((a) => a.addEventListener('click', () => clearStoredPlayer()));

  // Auto-leave the session after 1 hour with no interaction (then a fresh
  // student can use the same iPad). A manual leave button is always available.
  startIdleTimer({ key: 'ds-idle-student', minutes: 60, onIdle: () => leaveSession() });

  // Dev-only helper to preview stage states without a host (localhost)
  if (location.hostname === 'localhost') {
    window.__dsPhase = (patch) => { state.stageKey = null; state.session = { status: 'open', ...(state.session || {}), ...patch }; renderStage(); };
  }
}

/* Localhost preview WITHOUT a real join — fakes player/questions/leaderboard. */
if (location.hostname === 'localhost') {
  window.__dsDemo = async (patch) => {
    const g = await loadGame(null);
    state.content = g.content; state.questions = g.questions;
    state.player = { playerId: 'P021', nickname: 'วีระ', xp: 300, level: 3, progress: 3, badges: [], room: 'ม.5/1' };
    state.leaderboard = [
      { playerId: 'P012', nickname: 'มานี', xp: 520 }, { playerId: 'P003', nickname: 'ปิติ', xp: 480 },
      { playerId: 'P044', nickname: 'ชูใจ', xp: 410 }, { playerId: 'P021', nickname: 'วีระ', xp: 300 },
      { playerId: 'P077', nickname: 'สมชาย', xp: 150 },
    ];
    try { localStorage.setItem('ds-answers', JSON.stringify({ m4_q1: { choice: 'B', isCorrect: false } })); } catch (_e) {}
    state.stageKey = null;
    state.session = { status: 'open', phase: 'revealed', currentMission: 'm4', currentQuestion: 'm4_q1', questionIndex: 1, showAnswer: true, showResults: true, ...(patch || {}) };
    renderStage();
  };
}

/* ---------------- Passport ---------------- */
/** Every player gets their own little avatar, picked from their Player ID so
    it is the same on every device and every reload. */
const AVATARS = ['owl', 'rocket', 'brain', 'star', 'bolt', 'shield', 'medal', 'trophy', 'book', 'clock'];
const TONES = ['violet', 'teal', 'pink', 'gold', 'sky', 'lime'];
function paintAvatar(pid) {
  const host = $('#pAva'); if (!host || host.dataset.pid === pid) return;
  host.dataset.pid = pid;
  let h = 0;
  for (let i = 0; i < String(pid).length; i++) h = (h * 31 + String(pid).charCodeAt(i)) >>> 0;
  host.innerHTML = mascot(AVATARS[h % AVATARS.length], { size: 74, tone: TONES[(h >> 3) % TONES.length] });
}

/** How far this player is between their current level and the next one. */
function levelProgress(levels, xp) {
  const sorted = [...(levels || [])].sort((a, b) => (a.minXp || 0) - (b.minXp || 0));
  // The pack may not have loaded yet — say nothing rather than claiming the
  // player has maxed out at 0 XP.
  if (!sorted.length) return { cur: null, next: null, pct: 0, remain: 0, unknown: true };
  let cur = sorted[0] || null, next = null;
  for (const l of sorted) { if (xp >= (l.minXp || 0)) cur = l; else { next = l; break; } }
  if (!next) return { cur, next: null, pct: 100, remain: 0 };
  const floor = cur ? (cur.minXp || 0) : 0;
  const span = Math.max(1, (next.minXp || 0) - floor);
  return { cur, next, pct: Math.max(0, Math.min(100, ((xp - floor) / span) * 100)), remain: Math.max(0, (next.minXp || 0) - xp) };
}

function paintPassport() {
  const p = state.player; if (!p) return;
  const lv = levelForXp(state.content.levels || [], p.xp || 0);
  setText('#pName', p.nickname || '—');
  setText('#pPid', p.playerId || 'P——');
  setText('#pRoom', p.room || '');
  setText('#pXp', fmt(p.xp));
  setText('#hdrPid', p.playerId || 'P——');
  paintAvatar(p.playerId || '?');
  if (lv) {
    setText('#pLevelNo', 'เลเวล ' + String(lv.level).padStart(2, '0'));
    setText('#pLevelName', lv.nameTh || lv.name || '');
    setText('#pLevelEn', lv.name || '');
  }
  const lp = levelProgress(state.content.levels || [], p.xp || 0);
  const lvBar = $('#pLevelBar'); if (lvBar) lvBar.style.width = lp.pct + '%';
  setText('#pLevelNext', lp.unknown ? 'เก็บ XP เพื่อเลื่อนระดับ'
    : lp.next ? `อีก ${fmt(lp.remain)} XP → ${lp.next.nameTh || lp.next.name}`
    : 'ระดับสูงสุดแล้ว');
  const missions = (state.content.missions || []).filter((m) => m.id !== 'boss');
  const total = missions.length || 8;
  const done = Math.max(0, Math.min(total, p.progress || 0));
  setText('#pProgressLabel', `ความคืบหน้าภารกิจ · ${done} / ${total}`);
  const bar = $('#progressBar');
  if (bar) [...bar.children].forEach((seg, i) => {
    seg.classList.toggle('is-done', i < done);
    seg.classList.toggle('is-current', i === done && done < total);
  });
}

/* ---------------- Badge collection ---------------- */
function renderBadges() {
  const grid = $('#badgeGrid'); if (!grid) return;
  const badges = (state.content.badges || []).filter((b) => b.id !== 'digital_survivor');
  const owned = new Set((state.player && state.player.badges) || []);
  grid.innerHTML = badges.map((b) => {
    const earned = owned.has(b.id);
    return `<div class="badge ${earned ? 'is-earned' : 'is-locked'}">
      <div class="badge__ic">${earned ? icon(b.icon || 'shield') : lockIcon()}</div>
      <div class="badge__nm">${b.nameTh || b.name}</div>
      <div class="ds-en">${b.name}</div>
    </div>`;
  }).join('');
}
function lockIcon() {
  return '<svg class="ds-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
}

/* ---------------- Stage (phase-reactive) ---------------- */
function missionByAny(v) {
  if (v == null) return null;
  const ms = state.content.missions || [];
  return ms.find((m) => m.id === v) || ms.find((m) => m.no === v) || null;
}
function gameCtx(stage, s) {
  return { container: stage, session: s, questions: state.questions, content: state.content, stored: getStoredPlayer(), player: state.player,
    showAnswer: !!s.showAnswer, showResults: !!s.showResults, leaderboard: state.leaderboard };
}

/* ---------------- leave the session (manual or auto) ---------------- */
function leaveSession() {
  clearStoredPlayer();
  try { localStorage.removeItem('ds-idle-student'); } catch (_e) {}
  try { location.replace('index.html'); } catch (_e) { location.href = 'index.html'; }
}

/* ---------------- Final result — Digital Survivor (§43) ---------------- */
function renderFinalResult(stage) {
  const p = state.player || {};
  const lv = levelForXp(state.content.levels || [], p.xp || 0);
  const missions = (state.content.missions || []).filter((m) => m.id !== 'boss');
  const total = missions.length || 8;
  const done = Math.max(0, Math.min(total, p.progress || 0));
  const badges = (state.content.badges || []).filter((b) => b.id !== 'digital_survivor');
  const owned = new Set(p.badges || []);
  const earnedCount = badges.filter((b) => owned.has(b.id)).length;
  const survivor = done >= total;
  stage.innerHTML = `
    <div class="final ds-fade-up">
      <div class="final__notice">${icon('sparkles')} <span>วิทยากรปิดเซสชันแล้ว — นี่คือสรุปผลของคุณ ดูคะแนนได้ตามสบาย</span></div>
      <div class="mx-hero">${mascot(survivor ? 'trophy' : 'medal', { size: 150 })}</div>
      <p class="ds-en" style="color:var(--xp)">${survivor ? 'Arena Champion' : 'จบเกมแล้ว'}</p>
      <h2 class="final__title">${survivor ? 'คุณคือแชมป์สนามนี้!' : 'จบกิจกรรมแล้ว'}</h2>
      <p class="ds-pid" style="font-size:1.05rem">${p.nickname || '—'} · ${p.playerId || 'P——'}</p>
      <div class="final__stats">
        <div><div class="ds-stat__num ds-stat__num--xp">${(p.xp || 0).toLocaleString('en-US')}</div><div class="ds-stat__label">XP รวม</div></div>
        <div><div class="ds-stat__num">${lv ? lv.level : 1}</div><div class="ds-stat__label">เลเวล · ${lv ? (lv.nameTh || lv.name) : ''}</div></div>
        <div><div class="ds-stat__num">${done}/${total}</div><div class="ds-stat__label">ภารกิจสำเร็จ</div></div>
        <div><div class="ds-stat__num">${earnedCount}</div><div class="ds-stat__label">เหรียญตรา</div></div>
      </div>
      <div class="final__badges">${badges.map((b) => `<span class="final__badge ${owned.has(b.id) ? 'is-earned' : ''}" title="${b.nameTh}">${owned.has(b.id) ? icon(b.icon || 'shield') : '·'}</span>`).join('')}</div>
      <blockquote class="final__quote">"การเป็น Digital Citizen ไม่ใช่การรู้ทุกอย่าง<br>แต่คือการรู้ว่าเมื่อไรควร <b>หยุด · คิด · ตรวจสอบ · รับผิดชอบ</b>"</blockquote>
      <div class="final__actions">
        <button class="ds-btn ds-btn--primary" id="leaveBtn" type="button">ออกจากห้อง</button>
        <button class="ds-btn ds-btn--ghost" id="stayBtn" type="button">อยู่ดูคะแนนต่อ</button>
      </div>
      <p class="ds-muted ds-center" style="font-size:.82rem;margin-top:4px">ถ้าไม่ออกเอง ระบบจะพาออกจากห้องอัตโนมัติเมื่อไม่มีการใช้งาน 1 ชั่วโมง</p>
    </div>`;
  const lb = stage.querySelector('#leaveBtn'); if (lb) lb.addEventListener('click', () => leaveSession());
  const sb = stage.querySelector('#stayBtn'); if (sb) sb.addEventListener('click', () => {
    const n = stage.querySelector('.final__notice'); if (n) n.remove();
  });
  finish(stage);
}

function renderStage() {
  const stage = $('#stage'); if (!stage) return;
  const s = state.session;
  const phase = s ? (s.phase || 'lobby') : 'connecting';
  const key = s ? `${s.status}:${phase}:${s.currentMission || ''}:${s.currentQuestion || ''}:${s.showAnswer ? 1 : 0}:${s.showResults ? 1 : 0}` : 'connecting';
  if (key === state.stageKey) return;
  state.stageKey = key;

  if (!s) {
    stage.innerHTML = `<div class="qx-wait">${mascot('rocket', { size: 120 })}
      <h3>กำลังเชื่อมต่อ… <span class="ds-en" style="display:block;margin-top:4px">Connecting</span></h3>
      <p>กำลังเข้าห้องกิจกรรม</p><div class="qx-dots"><i></i><i></i><i></i></div></div>`;
    return finish(stage);
  }
  if (s.status === 'closed') { renderFinalResult(stage); return; }

  const m = missionByAny(s.currentMission);
  const hasQ = s.currentQuestion && state.questions[s.currentQuestion];
  switch (phase) {
    case 'mission_intro':
      stage.innerHTML = missionIntro(m);
      break;
    case 'question_open':
      if (hasQ) { renderGame(gameCtx(stage, s)); return; }
      stage.innerHTML = `<div class="stage-live">
        <span class="ds-chip ds-chip--live">กำลังตอบ</span>
        <span class="ds-feat ds-feat--electric ds-ico--lg">${icon(m ? m.icon : 'search')}</span>
        <h3>${m ? m.titleTh : 'คำถามกำลังมา'}</h3>
        <p class="ds-muted">อ่านสถานการณ์ที่จอหน้าห้อง แล้วเลือกคำตอบของคุณ</p></div>`;
      break;
    case 'locked':
      if (hasQ) { renderGame(gameCtx(stage, s)); return; }
      stage.innerHTML = emptyBlock('lock', 'ล็อกคำตอบแล้ว', 'Answers Locked', 'รอวิทยากรเฉลย — ดูผลที่จอหน้าห้อง');
      break;
    case 'revealed':
      if (hasQ) { renderGame(gameCtx(stage, s)); return; }
      stage.innerHTML = emptyBlock('reveal', 'กำลังเฉลย', 'Revealing', 'ดูเฉลยและคำอธิบายที่จอหน้าห้อง');
      break;
    case 'paused':
      stage.innerHTML = emptyBlock('pause', 'พักชั่วคราว', 'Paused', 'เดี๋ยวเรากลับมาต่อ');
      break;
    case 'lobby':
    default:
      stage.innerHTML = `<div class="qx-wait">${mascot('owl', { size: 140 })}
        <h3>ห้องรอ <span class="ds-en" style="display:block;margin-top:4px">Waiting Room</span></h3>
        <p>เมื่อวิทยากรเริ่มภารกิจ หน้าจอนี้จะเปลี่ยนเอง — ไม่ต้องรีเฟรช</p>
        <div class="qx-dots"><i></i><i></i><i></i></div>
        <span class="ds-chip ds-chip--live">พร้อมแล้ว รอสัญญาณเริ่ม</span></div>`;
  }
  finish(stage);
}

function missionIntro(m) {
  if (!m) return emptyBlock('play', 'เตรียมเริ่มภารกิจ', 'Get Ready', 'วิทยากรกำลังเริ่มภารกิจถัดไป');
  return `<div class="mission-intro">
    <span class="ds-en" style="color:var(--cyan)">Mission ${String(m.no).padStart(2, '0')} · ${m.title}</span>
    <div class="mx-hero" style="margin:8px auto 6px">${mascot('book', { size: 104 })}</div>
    <h2>${m.titleTh}</h2>
    <p class="ds-chip" style="margin:8px auto">${m.topicTh}</p>
    <p class="ds-muted" style="max-width:46ch;margin:14px auto 0">${m.intro || ''}</p>
    <span class="ds-note" style="margin-top:18px">เตรียมตัว — คำถามกำลังจะเริ่ม</span>
  </div>`;
}

const BLOCK_ART = { lock: 'shield', reveal: 'brain', pause: 'clock', play: 'rocket', network: 'owl' };
function emptyBlock(ic, title, en, sub) {
  return `<div class="qx-wait">${mascot(BLOCK_ART[ic] || 'owl', { size: 120 })}
    <h3>${title} <span class="ds-en" style="display:block;margin-top:4px">${en}</span></h3>
    <p>${sub}</p></div>`;
}
function finish(el) { hydrateIcons(el); }

/* ---------------- misc states ---------------- */
function showNotJoined() {
  // The player document is gone (room deleted, or the teacher removed it), so
  // the stored record is stale. Clear it, otherwise index.html would send the
  // student straight back here and they could never join anything again.
  clearStoredPlayer();
  const main = $('.app-main');
  if (!main) return;
  main.innerHTML = `<section class="ds-card" style="padding:clamp(18px,4vw,28px)">
    <div class="qx-wait">
      ${mascot('owl', { size: 140 })}
      <h3>ยังไม่ได้เข้าห้อง</h3>
      <p>กลับไปหน้าแรกเพื่อกรอกรหัสห้อง 5 ตัวและชื่อเล่นของคุณ</p>
      <div class="jx-hero__cta">
        <a class="ds-btn ds-btn--primary" href="index.html">ไปกรอกรหัสห้อง</a>
        <a class="ds-btn ds-btn--ghost" href="community.html">เล่นคนเดียวก่อน</a>
      </div>
    </div>
  </section>`;
}

/** Shown when the session never loads — usually an in-app browser (LINE/กล้อง/
    IG/FB) or Private mode blocking the login storage on iPhone. Tells the
    student how to fix it (open in Safari directly). */
let connHelpShown = false;
function showConnHelp() {
  if (connHelpShown || state.session) return; // don't override a working stage
  connHelpShown = true;
  const stage = $('#stage'); if (!stage) return;
  const ua = navigator.userAgent || '';
  const inApp = /Line\/|FBAN|FBAV|Instagram|Messenger|GSA\//i.test(ua);
  const url = location.href.replace('student.html', 'index.html');
  stage.innerHTML = `<div class="qx-wait">
    ${mascot('clock', { size: 120 })}
    <h3>เชื่อมต่อไม่สำเร็จ <span class="ds-en" style="display:block;margin-top:4px">Can't connect</span></h3>
    <p>${inApp
      ? 'คุณกำลังเปิดในแอป (เช่น LINE/กล้อง) ซึ่งบล็อกการเข้าสู่ระบบ<br><b>แตะปุ่มแชร์มุมจอ แล้วเลือก “เปิดใน Safari”</b>'
      : 'ลองวิธีต่อไปนี้ทีละข้อ'}</p>
    <ol style="text-align:left;max-width:30ch;margin:8px auto 0;padding-left:20px;color:var(--text-muted);font-size:.92rem;line-height:1.9">
      <li>เปิดลิงก์นี้ใน <b>Safari</b> โดยตรง (ไม่ใช่ในแอป)</li>
      <li>ปิด <b>โหมดการเรียกดูแบบส่วนตัว</b> (Private) ถ้าเปิดอยู่</li>
      <li>แล้วสแกน QR / เข้าห้องใหม่อีกครั้ง</li>
    </ol>
    <a class="ds-btn ds-btn--primary" href="${url}" style="margin-top:16px">เข้าห้องใหม่</a>
  </div>`;
  hydrateIcons(stage);
}

let offlineEl = null;
function showOffline() {
  if (offlineEl) return;
  offlineEl = document.createElement('div');
  offlineEl.className = 'offline-banner';
  offlineEl.innerHTML = `${icon('wifiOff')} <span>การเชื่อมต่อหลุด — ระบบกำลังเก็บความคืบหน้าไว้ให้ และจะซิงก์เมื่อกลับมาออนไลน์</span>`;
  document.body.appendChild(offlineEl);
}
function hideOffline() { if (offlineEl) { offlineEl.remove(); offlineEl = null; } }

function setConn(ok) {
  const el = $('#connStatus'); if (!el) return;
  el.className = 'ds-status ' + (ok ? 'is-ok' : 'is-err');
  el.lastElementChild.textContent = ok ? 'เชื่อมต่อแล้ว' : 'การเชื่อมต่อมีปัญหา';
}
function setText(sel, t) { const el = $(sel); if (el) el.textContent = t; }

main();
