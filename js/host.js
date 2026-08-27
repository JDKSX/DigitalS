/* =================================================================
   Host controller (host.html) — DIGITAL SURVIVAL
   full live control of the session state machine —
   pick a mission, START / LOCK / RESULTS / EXPLAIN / NEXT, with live
   player, answered and answer-distribution stats.
   ================================================================= */
import { onAuth, signInStaff, getRole, authErrorTh, signOutUser } from './auth.js';
import { startIdleTimer } from './idle.js';
import { createSession, listenSession, listenPlayers, listenQuestionAnswers, updateSession, updateStats,
  getQuestionAnswersOnce, getMissionPlayers, applyScores, markScored, markMissionComplete, writeLeaderboard,
  createDemoPlayers, submitAnswer } from './session.js';
import { loadContent, loadQuestions, questionCount } from './content.js';
import { scoreQuestionAnswers } from './scoring.js';
import { icon, hydrateIcons } from './icons.js';

const $ = (s) => document.querySelector(s);
const HOST_KEY = 'ds-host-session';
const state = { uid: null, sid: null, session: null, players: [], content: null };
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

/* ---------------- staff login ---------------- */
function showLogin() {
  if ($('.ds-modal-backdrop')) return;
  const back = document.createElement('div');
  back.className = 'ds-modal-backdrop';
  back.innerHTML = `
    <div class="ds-modal" role="dialog" aria-modal="true" aria-labelledby="loTitle">
      <p class="ds-en" style="color:var(--cyan)">Staff Login</p>
      <h2 id="loTitle">เข้าสู่ระบบวิทยากร</h2>
      <div class="ds-form-row"><label class="ds-label" for="loEmail">อีเมล <span class="ds-en">email</span></label>
        <input id="loEmail" class="ds-input" type="email" autocomplete="username" placeholder="host@example.com"></div>
      <div class="ds-form-row"><label class="ds-label" for="loPass">รหัสผ่าน <span class="ds-en">password</span></label>
        <input id="loPass" class="ds-input" type="password" autocomplete="current-password" placeholder="••••••••"></div>
      <div class="ds-form-err" id="loErr" hidden></div>
      <button class="ds-btn ds-btn--primary ds-btn--block" id="loGo" type="button" style="margin-top:22px">เข้าสู่ระบบ</button>
      <p class="ds-muted" style="font-size:.8rem;margin-top:14px">บัญชีวิทยากรสร้างใน Firebase Console + เพิ่ม <span class="ds-mono">staff/{uid}</span> (ดู README)</p>
    </div>`;
  document.body.appendChild(back);
  const email = $('#loEmail'), pass = $('#loPass'), err = $('#loErr'), go = $('#loGo');
  email.focus();
  async function submit() {
    err.hidden = true; go.disabled = true; go.textContent = 'กำลังเข้าสู่ระบบ…';
    try { await signInStaff(email.value, pass.value); back.remove(); }
    catch (e) { err.hidden = false; err.textContent = authErrorTh(e); go.disabled = false; go.textContent = 'เข้าสู่ระบบ'; }
  }
  go.addEventListener('click', submit);
  [email, pass].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
}

/* ---------------- boot ---------------- */
onAuth(async (user) => {
  if (!user) return showLogin();
  const role = await getRole(user.uid);
  if (!role) return showLogin();
  document.querySelector('.ds-modal-backdrop')?.remove(); // clear any stale login modal
  startStaffIdle(); // auto sign-out after 1h idle
  state.uid = user.uid;
  state.content = await loadContent().catch(() => ({ missions: [] }));
  state.questions = await loadQuestions().catch(() => ({}));
  let sid = null; try { sid = localStorage.getItem(HOST_KEY); } catch (_e) {}
  if (sid) attachSession(sid); else renderCreate();
});

/* ---------------- create session ---------------- */
function renderCreate() {
  const panel = $('.host-col:last-child .ds-card');
  panel.className = 'ds-card ds-empty';
  panel.innerHTML = `<span class="ds-feat">${icon('play')}</span>
    <h3>พร้อมเริ่มกิจกรรม</h3><p>สร้างเซสชันจริง หรือโหมดทดสอบพร้อมบอต 10 ตัว</p>
    <div class="ds-row" style="gap:10px;flex-wrap:wrap;justify-content:center">
      <button class="ds-btn ds-btn--primary" id="mkSession">${icon('sparkles')} สร้างเซสชัน</button>
      <button class="ds-btn ds-btn--ghost" id="mkDemo">${icon('cpu')} DEMO + 10 บอท</button>
    </div>`;
  $('#mkSession').addEventListener('click', () => doCreate(false));
  $('#mkDemo').addEventListener('click', () => doCreate(true));
}
async function doCreate(demo) {
  $('#mkSession').disabled = true; $('#mkDemo').disabled = true;
  try {
    const s = await createSession(state.uid, { demo });
    if (demo) await createDemoPlayers(s.id, 10);
    localStorage.setItem(HOST_KEY, s.id);
    attachSession(s.id);
  } catch (e) { alert('สร้างไม่สำเร็จ: ' + (e.message || e)); renderCreate(); }
}

/* ---------------- attach + control skeleton ---------------- */
function attachSession(sid) {
  state.sid = sid;
  if (unsubSession) unsubSession();
  if (unsubPlayers) unsubPlayers();
  buildControlSkeleton();

  unsubSession = listenSession(sid, (s) => {
    if (!s) { try { localStorage.removeItem(HOST_KEY); } catch (_e) {} location.reload(); return; }
    state.session = s;
    renderControl(s);
    watchAnswers(s);
  });
  unsubPlayers = listenPlayers(sid, (players) => { state.players = players; renderStats(); });

  document.querySelectorAll('.quickbar [data-act]').forEach((b) => {
    if (b.dataset.wired) return; b.dataset.wired = '1';
    b.addEventListener('click', () => onAction(b.dataset.act));
  });
}

function buildControlSkeleton() {
  const panel = $('.host-col:last-child .ds-card');
  panel.className = 'ds-card';
  const missions = state.content.missions || [];
  panel.innerHTML = `
    <div class="ds-between">
      <div><span class="ds-en">รหัสห้อง · session code</span>
        <div class="host-code" id="hostCodeBig">—</div></div>
      <div class="ds-row" style="gap:8px">
        <a class="ds-chip" id="presenterLink" href="presenter.html" target="_blank" rel="noopener">${icon('chart')} เปิดจอฉาย ↗</a>
        <button class="ds-chip ds-chip--gold" id="announceBtn" type="button">${icon('trophy')} ประกาศผลรวม</button>
        <button class="ds-chip" id="endSession" type="button">${icon('trophy')} จบกิจกรรม</button>
        <button class="ds-chip" id="newSession" type="button">${icon('sparkles')} เซสชันใหม่</button>
      </div>
    </div>
    <div class="host-phase" id="hostPhase"></div>
    <div class="ds-heading" style="margin-top:18px"><span class="ds-en">เลือกภารกิจ · missions</span></div>
    <div class="mission-grid" id="missionGrid">
      ${missions.map((m) => `<button class="m-tile" data-mid="${m.id}">
        <span class="m-tile__done" aria-label="เล่นแล้ว">${icon('reveal')}</span>
        <span class="m-tile__ic">${icon(m.icon || 'shield')}</span>
        <span class="m-tile__no">${m.id === 'boss' ? 'BOSS' : String(m.no).padStart(2, '0')}</span>
        <span class="m-tile__t">${m.titleTh}</span></button>`).join('')}
    </div>
    <div class="current-q" id="currentQ"></div>`;
  hydrateIcons(panel);
  panel.querySelectorAll('.m-tile').forEach((t) => t.addEventListener('click', () => startMission(t.dataset.mid)));
  const es = panel.querySelector('#endSession');
  if (es) es.addEventListener('click', () => {
    if (confirm('จบกิจกรรม? ผู้เรียนจะเห็นหน้าสรุปผล (Digital Survivor) และห้องจะปิด')) {
      updateSession(state.sid, { status: 'closed', finalAnnounce: false }).catch((e) => alert('ปิดไม่สำเร็จ: ' + (e.message || e)));
    }
  });
  const an = panel.querySelector('#announceBtn');
  if (an) an.addEventListener('click', () => {
    if (confirm('เริ่มประกาศผลรวม? ห้องจะปิด (ผู้เรียนเห็นหน้าสรุปผล) แล้วคุณเผยอันดับทีละขั้นบนจอฉายได้')) {
      updateSession(state.sid, { status: 'closed', finalAnnounce: true, announceStep: 0 }).catch((e) => alert('ประกาศไม่สำเร็จ: ' + (e.message || e)));
    }
  });
  const ns = panel.querySelector('#newSession');
  if (ns) ns.addEventListener('click', () => {
    if (confirm('สร้างเซสชันใหม่? (เซสชันปัจจุบันจะยังอยู่ในระบบ ดูย้อนหลังได้ที่ Admin)')) {
      try { localStorage.removeItem(HOST_KEY); } catch (_e) {}
      scoredLocal.clear(); demoAnsweredQ.clear(); lastLbKey = ''; lastStats = {};
      if (unsubSession) unsubSession(); if (unsubPlayers) unsubPlayers(); if (unsubAnswers) unsubAnswers();
      state.sid = null; state.session = null;
      renderCreate();
    }
  });
}

/* ---------------- render ---------------- */
function renderControl(s) {
  setText('#hostCodeBig', s.code);
  const chip = document.querySelector('.role-chip b'); if (chip) chip.textContent = s.code;
  const pl = $('#presenterLink'); if (pl) pl.href = `presenter.html?s=${s.code}`;
  setHTML('#hostPhase', `<span class="ds-chip">สถานะ: <b style="color:var(--text);margin-left:4px">${phaseTh(s.phase)}</b></span>
    <span class="host-hint">${icon('sparkles')} ${hostHint(s)}</span>`);
  hydrateIcons($('#hostPhase'));

  const done = s.completedMissions || [];
  document.querySelectorAll('.m-tile').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.mid === s.currentMission);
    t.classList.toggle('is-done', done.includes(t.dataset.mid));
  });

  const m = (state.content.missions || []).find((x) => x.id === s.currentMission);
  const cq = $('#currentQ');
  if (cq) {
    if (s.status === 'closed') {
      if (s.finalAnnounce) renderAnnounceControls(s);
      else cq.innerHTML = `<p class="ds-muted ds-center" style="padding:16px 0">จบกิจกรรมแล้ว — กด “🏆 ประกาศผลรวม” เพื่อประกาศอันดับ หรือ “เซสชันใหม่”</p>`;
    }
    else if (!s.currentMission) cq.innerHTML = `<p class="ds-muted ds-center" style="padding:16px 0">แตะภารกิจด้านบนเพื่อเริ่ม</p>`;
    else {
      const total = questionCount(state.questions, s.currentMission);
      const q = s.currentQuestion ? state.questions[s.currentQuestion] : null;
      const open = s.phase === 'question_open';
      // ซิงก์ค่าเวลาที่เลือกกับที่บันทึกในเซสชัน (เผื่อเปิดคนละแท็บ)
      if (typeof s.questionDuration === 'number' && !open) selectedDuration = s.questionDuration;
      cq.innerHTML = `
      <div class="ds-between" style="margin-top:6px">
        <div><span class="ds-en">${m ? m.title : ''}</span><div style="font-family:var(--font-display);font-weight:700;font-size:1.15rem">${m ? m.titleTh : s.currentMission}</div>
          <span class="ds-muted" style="font-size:.85rem">${s.currentQuestion ? `ข้อ ${s.questionIndex || 1}${total ? ' / ' + total : ''}` : (total ? `${total} ข้อ · ยังไม่เริ่ม` : 'ยังไม่มีคำถาม (เพิ่มใน questions.json)')}</span></div>
        <div class="host-timer" id="hostTimer"></div>
      </div>
      ${!s.currentQuestion && m && m.script ? `<div class="host-script"><div class="host-script__h">🎤 บทเกริ่นนำ (พูดนำก่อนกด “เริ่ม”)</div><p>${m.script}</p></div>` : ''}
      ${q ? hostQuestionView(q, s) : (total ? '' : '')}
      ${s.phase === 'revealed' ? `<div class="host-live-chips">
          ${s.showAnswer ? '<span class="host-live host-live--on">✓ เฉลยขึ้นทุกจอแล้ว</span>' : '<span class="host-live">เฉลยยังไม่ขึ้นจอ</span>'}
          ${s.showResults ? '<span class="host-live host-live--on">🏆 ผลคะแนนขึ้นทุกจอแล้ว</span>' : '<span class="host-live">ผลคะแนนยังไม่ขึ้นจอ</span>'}
        </div>` : ''}
      ${!open ? durationPicker() : ''}`;
      hydrateIcons(cq);
      if (!open) cq.querySelectorAll('.host-dur__opt').forEach((b) => b.addEventListener('click', () => {
        selectedDuration = Number(b.dataset.dur);
        cq.querySelectorAll('.host-dur__opt').forEach((x) => x.classList.toggle('is-on', x === b));
      }));
    }
  }
  updateQuickbar(s);
  runTimer(s);
  maybeScore(s);
  if (s.demo) maybeDemo(s);
}

/* ---------------- final announcement controls (เผยทีละอันดับ) ---------------- */
function renderAnnounceControls(s) {
  const cq = $('#currentQ'); if (!cq) return;
  const N = Math.min(state.players.length, 20);
  const step = Math.max(0, Math.min(typeof s.announceStep === 'number' ? s.announceStep : N, N));
  const nextRank = N - step;
  if (!N) { cq.innerHTML = `<div class="host-announce"><div class="host-announce__h">${icon('trophy')} ประกาศผลรวม</div><p class="ds-muted">ยังไม่มีผู้เล่นในเซสชันนี้</p></div>`; hydrateIcons(cq); return; }
  cq.innerHTML = `<div class="host-announce">
    <div class="host-announce__h">${icon('trophy')} ประกาศผลรวม — เผยทีละอันดับ</div>
    <p class="ds-muted" style="font-size:.9rem">เผยจากอันดับท้าย ไล่ขึ้นหาที่ 1 (ลุ้นบนจอฉาย) · เผยครบแล้วจะขึ้นแท่น 1-2-3 + คอนเฟตติ</p>
    <div class="host-announce__meta">เผยแล้ว <b>${step}</b> / ${N} อันดับ${step < N ? ` · ถัดไป: <b>อันดับที่ ${nextRank}</b>` : ' · ครบแล้ว 🎉'}</div>
    <div class="host-announce__btns">
      <button class="ds-btn ds-btn--primary" id="revNext" type="button" ${step >= N ? 'disabled' : ''}>เผยอันดับถัดไป ▶</button>
      <button class="ds-btn ds-btn--ghost" id="revAll" type="button" ${step >= N ? 'disabled' : ''}>เผยทั้งหมด</button>
      <button class="ds-btn ds-btn--ghost" id="revReset" type="button" ${step <= 0 ? 'disabled' : ''}>เริ่มใหม่</button>
    </div>
  </div>`;
  hydrateIcons(cq);
  const set = (v) => updateSession(state.sid, { announceStep: v }).catch(() => {});
  cq.querySelector('#revNext')?.addEventListener('click', () => set(Math.min(N, step + 1)));
  cq.querySelector('#revAll')?.addEventListener('click', () => set(N));
  cq.querySelector('#revReset')?.addEventListener('click', () => set(0));
}

/* ---------------- duration picker (§วิทยากรกำหนดเวลาต่อข้อ) ---------------- */
function durationPicker() {
  return `<div class="host-dur">
    <span class="host-dur__lbl">⏱ เวลาตอบต่อข้อ</span>
    <div class="host-dur__opts">
      ${DURATIONS.map((d) => `<button type="button" class="host-dur__opt ${d === selectedDuration ? 'is-on' : ''}" data-dur="${d}">${d === 0 ? 'ไม่จำกัด' : d + ' วิ'}</button>`).join('')}
    </div>
  </div>`;
}

/* ---------------- host question view — เห็นคำถาม+เฉลย+คำอธิบายเพื่อบรรยาย ---------------- */
function hostQuestionView(q, s) {
  const answered = s.phase === 'revealed';
  let body = '';
  if (q.type === 'scenario' || q.type === 'investigation') {
    if (q.type === 'investigation') {
      body += `<div class="hq-news"><div class="hq-news__tag">📰 ข่าวที่ต้องตรวจสอบ</div>
        <div class="hq-news__hl">${esc(q.headline)}</div>
        <div class="hq-news__meta">ที่มา: ${esc(q.source || '—')} · ${esc(q.date || '')}</div>
        ${q.quote ? `<blockquote class="hq-news__q">${esc(q.quote)}</blockquote>` : ''}</div>`;
      if (q.evidence && q.evidence.length) body += `<div class="hq-ev"><b>หลักฐาน/เบาะแส:</b><ul>${q.evidence.map((e) => `<li><b>${esc(e.label)}:</b> ${esc(e.text)}</li>`).join('')}</ul></div>`;
      body += `<p class="hq-prompt">${esc(q.question)}</p>`;
    } else {
      body += `<p class="hq-prompt">${esc(q.q_prompt || q.situation)}</p>`;
    }
    body += `<div class="hq-opts">${(q.options || []).map((o) => `<div class="hq-opt ${o.key === q.correct ? 'is-correct' : ''}"><span class="hq-opt__k">${o.key}</span><span>${esc(o.text)}</span>${o.key === q.correct ? '<span class="hq-opt__mk">✓ เฉลย</span>' : ''}</div>`).join('')}</div>`;
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
  const expl = q.explanation ? `<div class="hq-expl"><b>💡 คำอธิบาย (สำหรับบรรยายเพิ่มเติม):</b><p>${esc(q.explanation)}</p></div>` : '';
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
      submitAnswer({ sessionId: state.sid, playerId: bot.playerId }, a).catch(() => {});
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
    const updates = scoreQuestionAnswers(q, answers, rules);

    const count = questionCount(state.questions, s.currentMission);
    const isLast = count && (s.questionIndex || 0) >= count;
    const alreadyDone = (s.completedMissions || []).includes(s.currentMission);
    if (isLast && !alreadyDone) {
      const mission = (state.content.missions || []).find((m) => m.id === s.currentMission);
      const badge = mission && mission.badge;
      const bonus = rules.missionComplete || 100;
      const players = await getMissionPlayers(state.sid, s.currentMission);
      players.forEach((pid) => {
        let u = updates.find((x) => x.playerId === pid);
        if (!u) { u = { playerId: pid, missionId: s.currentMission, xpDelta: 0 }; updates.push(u); }
        u.xpDelta += bonus; if (badge) u.badge = badge; u.progressDelta = 1;
      });
    }
    await applyScores(state.sid, updates);
    await markScored(state.sid, qid);
    if (isLast && !alreadyDone) await markMissionComplete(state.sid, s.currentMission);
  } catch (e) {
    scoredLocal.delete(qid); // allow retry on next snapshot
    console.warn('scoring failed', e);
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

/** Write to the session only when a value actually changed (saves writes §26). */
function maybePush(patch) {
  const s = state.session; if (!s) return;
  const diff = {};
  Object.keys(patch).forEach((k) => { if (s[k] !== patch[k]) diff[k] = patch[k]; });
  if (Object.keys(diff).length) updateSession(state.sid, diff).catch(() => {});
}

function watchAnswers(s) {
  const qid = s.currentQuestion;
  if (qid === answersQid) return;
  answersQid = qid;
  if (unsubAnswers) { unsubAnswers(); unsubAnswers = null; }
  pushStats({ answeredCount: 0 }); // reset immediately on question change (no stale count)
  if (!qid) { setStat(2, 0); paintDistribution([]); return; }
  unsubAnswers = listenQuestionAnswers(state.sid, qid, (answers) => {
    setStat(2, answers.length);
    paintDistribution(answers);
    pushAnsweredThrottled(answers.length); // throttle session writes (§26)
  });
}

function paintDistribution(answers) {
  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  answers.forEach((a) => { const c = typeof a.choice === 'string' ? a.choice.toUpperCase() : null; if (c && counts[c] != null) counts[c]++; });
  const total = answers.length || 1;
  ['A', 'B', 'C', 'D', 'E'].forEach((k, i) => {
    const row = document.querySelectorAll('.dist')[i]; if (!row) return;
    row.querySelector('.dist__bar i').style.width = Math.round((counts[k] / total) * 100) + '%';
    row.querySelector('.dist__v').textContent = counts[k];
  });
}

/* ---------------- actions (state machine) ---------------- */
function startMission(mid) {
  updateSession(state.sid, { currentMission: mid, phase: 'mission_intro', currentQuestion: null, questionIndex: 0, showAnswer: false, showResults: false });
}
function onAction(act) {
  const s = state.session; if (!s) return;
  const openNext = () => {
    const count = questionCount(state.questions, s.currentMission);
    const n = (s.questionIndex || 0) + 1;
    if (count && n > count) { alert('ครบทุกข้อของภารกิจนี้แล้ว — เลือกภารกิจถัดไปได้เลย'); return; }
    // เปิดคำถามใหม่: ใช้เวลาที่วิทยากรเลือกไว้ + รีเซ็ตสถานะเฉลย/ผลคะแนน
    updateSession(state.sid, { phase: 'question_open', currentQuestion: `${s.currentMission}_q${n}`, questionIndex: n, questionStartAt: Date.now(), questionDuration: selectedDuration, showAnswer: false, showResults: false });
  };
  if (act === 'start') {
    if (!s.currentMission) { alert('เลือกภารกิจก่อน'); return; }
    openNext();
  } else if (act === 'lock') {
    updateSession(state.sid, { phase: 'locked' });
  } else if (act === 'results') {
    // ผลคะแนน — อิสระ, กดก่อนหรือหลังเฉลยก็ได้ (toggle)
    updateSession(state.sid, { phase: 'revealed', showResults: !s.showResults });
  } else if (act === 'explain') {
    // เฉลยคำตอบ — อิสระจากผลคะแนน (toggle)
    updateSession(state.sid, { phase: 'revealed', showAnswer: !s.showAnswer });
  } else if (act === 'next') {
    openNext();
  }
}

function updateQuickbar(s) {
  const en = { start: false, lock: false, results: false, explain: false, next: false };
  const on = { results: !!s.showResults, explain: !!s.showAnswer };
  const p = s.phase;
  if (s.status === 'closed') { /* all disabled — use ประกาศผล controls */ }
  else if (!s.currentMission) { /* all disabled */ }
  else if (p === 'mission_intro' || p === 'lobby') en.start = true;
  else if (p === 'question_open') { en.lock = true; en.results = true; en.explain = true; }
  else if (p === 'locked') { en.results = true; en.explain = true; }
  else if (p === 'revealed') {
    const count = questionCount(state.questions, s.currentMission);
    const more = !count || (s.questionIndex || 0) < count;
    en.results = true; en.explain = true; en.next = more;
  }
  document.querySelectorAll('.quickbar [data-act]').forEach((b) => {
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
    const t = el(); if (t) { t.textContent = fmtTime(left); t.classList.toggle('is-low', left <= 10); }
    if (left <= 0 && timerIv) { clearInterval(timerIv); timerIv = null; }
  };
  tick(); timerIv = setInterval(tick, 500);
}

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
function setStat(i, v) { const el = document.querySelectorAll('.stat .ds-stat__num')[i]; if (el) el.textContent = v; }
function setText(sel, t) { const el = $(sel); if (el) el.textContent = t; }
function setHTML(sel, h) { const el = $(sel); if (el) el.innerHTML = h; }

/* Localhost-only UI preview (no Firestore writes) for visual verification. */
if (location.hostname === 'localhost') {
  window.__hostDemo = async (patch) => {
    document.querySelector('.ds-modal-backdrop')?.remove();
    state.content = await loadContent().catch(() => ({ missions: [] }));
    state.questions = await loadQuestions().catch(() => ({}));
    state.sid = 'demo';
    buildControlSkeleton();
    state.session = { code: 'DEMO1', phase: 'mission_intro', currentMission: 'm4', questionIndex: 0, playersJoined: 24, completedMissions: ['m1', 'm2'], ...(patch || {}) };
    renderControl(state.session);
    state.players = Array.from({ length: 24 }, (_, i) => ({ playerId: 'P' + String(i + 1).padStart(3, '0'), nickname: 'Player' + (i + 1), xp: i * 40, lastSeen: { toMillis: () => Date.now() } }));
    renderStats();
  };
}
