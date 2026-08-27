/* =================================================================
   Student page controller (student.html) — DIGITAL SURVIVAL
   Phase 4: full Digital Passport (identity + XP + level + progress +
   badge collection) and a phase-reactive stage that mirrors the host's
   session state machine. Actual question rendering lands in Phase 6.
   ================================================================= */
import { getStoredPlayer, listenPlayer, listenSession, touchPresence, clearStoredPlayer } from './session.js';
import { loadContent, loadQuestions, levelForXp } from './content.js';
import { onAuth } from './auth.js';
import { auth } from './firebase.js';
import { icon, hydrateIcons } from './icons.js';
import { renderGame } from './game.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => (n || 0).toLocaleString('en-US');
const state = { content: null, questions: {}, player: null, session: null, stageKey: null };

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

  await waitForAuth();

  try { state.content = await loadContent(); }
  catch (_e) { state.content = { levels: [{ level: 1, nameTh: 'มือใหม่ดิจิทัล', name: 'Digital Rookie', minXp: 0 }], missions: [], badges: [] }; }
  state.questions = await loadQuestions().catch(() => ({}));

  renderBadges();          // draw locked grid immediately
  renderStage();           // initial "connecting" state

  listenPlayer(stored.docId, (p) => {
    if (!p) { showNotJoined(); return; }
    state.player = p;
    paintPassport();
    renderBadges();
  }, (err) => setConn(false, err));

  listenSession(stored.sessionId, (s) => {
    setConn(true);
    state.session = s;
    renderStage();
  }, (err) => setConn(false, err));

  // Presence heartbeat (cheap): on load + every 120s while visible, plus when
  // the tab becomes visible again. Longer interval keeps writes well under the
  // Spark budget with 120 players (§26/§36).
  touchPresence(stored.docId);
  setInterval(() => { if (document.visibilityState === 'visible') touchPresence(stored.docId); }, 120000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') touchPresence(stored.docId); });

  // Offline / online banner (§28)
  window.addEventListener('offline', showOffline);
  window.addEventListener('online', hideOffline);
  if (!navigator.onLine) showOffline();

  // Leave button clears local resume data
  document.querySelectorAll('a[href="index.html"]').forEach((a) => {
    if (a.textContent.includes('ออกจากภารกิจ')) a.addEventListener('click', () => clearStoredPlayer());
  });

  // Dev-only helper to preview stage states without a host (localhost)
  if (location.hostname === 'localhost') {
    window.__dsPhase = (patch) => { state.session = { status: 'open', ...(state.session || {}), ...patch }; renderStage(); };
  }
}

/* ---------------- Passport ---------------- */
function paintPassport() {
  const p = state.player; if (!p) return;
  const lv = levelForXp(state.content.levels || [], p.xp || 0);
  setText('#pName', p.nickname || '—');
  setText('#pPid', p.playerId || 'P——');
  setText('#pRoom', p.room ? ` · ${p.room}` : '');
  setText('#pXp', fmt(p.xp));
  setText('#hdrPid', p.playerId || 'P——');
  if (lv) {
    setText('#pLevelNo', 'เลเวล ' + String(lv.level).padStart(2, '0'));
    setText('#pLevelName', lv.nameTh || lv.name || '');
    setText('#pLevelEn', lv.name || '');
  }
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
  return { container: stage, session: s, questions: state.questions, content: state.content, stored: getStoredPlayer(), player: state.player };
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
      <div class="final__coin">${icon('trophy')}</div>
      <p class="ds-en" style="color:var(--xp)">${survivor ? 'Digital Survivor' : 'Mission Complete'}</p>
      <h2 class="final__title">${survivor ? 'คุณรอดชีวิตในโลกดิจิทัล!' : 'จบกิจกรรมแล้ว 🎉'}</h2>
      <p class="ds-pid" style="font-size:1.05rem">${p.nickname || '—'} · ${p.playerId || 'P——'}</p>
      <div class="final__stats">
        <div><div class="ds-stat__num ds-stat__num--xp">${(p.xp || 0).toLocaleString('en-US')}</div><div class="ds-stat__label">XP รวม</div></div>
        <div><div class="ds-stat__num">${lv ? lv.level : 1}</div><div class="ds-stat__label">เลเวล · ${lv ? (lv.nameTh || lv.name) : ''}</div></div>
        <div><div class="ds-stat__num">${done}/${total}</div><div class="ds-stat__label">ภารกิจสำเร็จ</div></div>
        <div><div class="ds-stat__num">${earnedCount}</div><div class="ds-stat__label">เหรียญตรา</div></div>
      </div>
      <div class="final__badges">${badges.map((b) => `<span class="final__badge ${owned.has(b.id) ? 'is-earned' : ''}" title="${b.nameTh}">${owned.has(b.id) ? icon(b.icon || 'shield') : '·'}</span>`).join('')}</div>
      <blockquote class="final__quote">"การเป็น Digital Citizen ไม่ใช่การรู้ทุกอย่าง<br>แต่คือการรู้ว่าเมื่อไรควร <b>หยุด · คิด · ตรวจสอบ · รับผิดชอบ</b>"</blockquote>
      <a class="ds-btn ds-btn--ghost" href="index.html" style="margin-top:8px">กลับหน้าแรก</a>
    </div>`;
  finish(stage);
}

function renderStage() {
  const stage = $('#stage'); if (!stage) return;
  const s = state.session;
  const phase = s ? (s.phase || 'lobby') : 'connecting';
  const key = s ? `${s.status}:${phase}:${s.currentMission || ''}:${s.currentQuestion || ''}` : 'connecting';
  if (key === state.stageKey) return;
  state.stageKey = key;

  if (!s) { stage.innerHTML = emptyBlock('network', 'กำลังเชื่อมต่อ…', 'Connecting', 'กำลังเข้าห้องกิจกรรม'); return finish(stage); }
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
      stage.innerHTML = `<div class="ds-empty"><span class="ds-feat ds-feat--violet ds-ico--lg">${icon('network')}</span>
        <h3>ห้องรอ <span class="ds-en" style="display:block;margin-top:4px">Waiting Room</span></h3>
        <p>เมื่อวิทยากรเริ่มภารกิจ หน้าจอนี้จะเปลี่ยนเอง<br>ไม่ต้องรีเฟรช</p>
        <span class="ds-chip">พร้อมแล้ว รอสัญญาณเริ่ม</span></div>`;
  }
  finish(stage);
}

function missionIntro(m) {
  if (!m) return emptyBlock('play', 'เตรียมเริ่มภารกิจ', 'Get Ready', 'วิทยากรกำลังเริ่มภารกิจถัดไป');
  return `<div class="mission-intro">
    <span class="ds-en" style="color:var(--cyan)">Mission ${String(m.no).padStart(2, '0')} · ${m.title}</span>
    <span class="ds-feat ds-feat--electric ds-ico--lg" style="margin:14px auto">${icon(m.icon)}</span>
    <h2>${m.titleTh}</h2>
    <p class="ds-chip" style="margin:8px auto">${m.topicTh}</p>
    <p class="ds-muted" style="max-width:46ch;margin:14px auto 0">${m.intro || ''}</p>
    <span class="ds-note" style="margin-top:18px">เตรียมตัว — คำถามกำลังจะเริ่ม</span>
  </div>`;
}

function emptyBlock(ic, title, en, sub) {
  return `<div class="ds-empty"><span class="ds-feat ds-ico--lg">${icon(ic)}</span>
    <h3>${title} <span class="ds-en" style="display:block;margin-top:4px">${en}</span></h3>
    <p>${sub}</p></div>`;
}
function finish(el) { hydrateIcons(el); }

/* ---------------- misc states ---------------- */
function showNotJoined() {
  const main = $('.app-main');
  if (!main) return;
  main.innerHTML = `<section class="ds-card ds-empty" style="margin-top:24px">
    <span class="ds-feat ds-feat--electric ds-ico--lg">${icon('play')}</span>
    <h3>ยังไม่ได้เข้าร่วมภารกิจ</h3>
    <p>กลับไปหน้าแรกเพื่อกรอกรหัสห้องและชื่อเล่น</p>
    <a class="ds-btn ds-btn--primary" href="index.html">ไปหน้าเข้าร่วม</a>
  </section>`;
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
