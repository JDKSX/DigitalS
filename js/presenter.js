/* =================================================================
   Presenter / projector screen (presenter.html) — DIGITAL SURVIVAL
   Read-only mirror of the session state machine, big and legible.
   Opened as presenter.html?s=CODE. Reads only the session doc (counts
   are denormalised there by the host), so it works even when the
   projector machine is only signed in anonymously.
   ================================================================= */
import { findSessionByCode, listenSession, listenLeaderboard, listenStats } from './session.js';
import { ensureStudentAuth } from './auth.js';
import { loadContent, loadQuestions } from './content.js';
import { audio } from './audio.js';

const $ = (s) => document.querySelector(s);
const stage = () => $('#stage');
const MOODMAP = { lobby: 'lobby', mission_intro: 'lobby', question_open: 'question', locked: 'locked', revealed: 'reveal', paused: 'locked' };
let content = { missions: [] };
let questions = {};
let stats = {}; // volatile counts from stats/{sessionId} (answeredCount / playersJoined / playersOnline)
let timerIv = null, lastKey = null, lb = [], lastSession = null, prevRanks = {}, lastConfettiQ = null, lastAllInQ = null, lastTickLeft = null, lastStartQ = null;

async function main() {
  const code = new URLSearchParams(location.search).get('s');
  if (!code) return fatal('ไม่พบรหัสห้อง', 'เปิดจอฉายจากปุ่ม “เปิดจอฉาย” ในแผงวิทยากร');

  try { await ensureStudentAuth(); } catch (_e) {}
  content = await loadContent().catch(() => ({ missions: [] }));
  loadQuestions().then((q) => { questions = q || {}; if (lastSession) { lastKey = null; render(lastSession); } }).catch(() => {});

  // Localhost-only preview helpers (no Firestore) — registered early so they
  // work even without a real session doc.
  if (location.hostname === 'localhost') {
    window.__pres = (patch) => { lastKey = null; render({ status: 'open', code, playersJoined: 24, ...patch }); };
    window.__presLb = (arr) => { lb = arr; };
  }

  let session;
  try { session = await findSessionByCode(code); } catch (_e) {}
  if (!session) return fatal('ไม่พบเซสชัน', `รหัส ${code.toUpperCase()} ไม่ถูกต้อง หรือห้องปิดแล้ว`);

  listenSession(session.id, (s) => { if (s) { lastSession = s; render(s); } }, () => {});
  listenLeaderboard(session.id, (arr) => {
    lb = arr;
    if (!lastSession) return;
    const showingScores = (lastSession.phase === 'revealed' && lastSession.showResults) || (lastSession.status === 'closed' && lastSession.finalAnnounce);
    if (showingScores) { lastKey = null; render(lastSession); }
  });

  // Live counts (kept off the students' session-doc fan-out). Re-render the
  // phases that display a count when it changes.
  listenStats(session.id, (st) => {
    stats = st || {};
    if (lastSession && ['lobby', 'question_open', 'locked'].includes(lastSession.phase)) { lastKey = null; render(lastSession); }
  });

  wireSound();
}

function render(s) {
  const key = `${s.status}:${s.phase}:${s.currentMission || ''}:${s.currentQuestion || ''}:${s.showAnswer ? 1 : 0}:${s.showResults ? 1 : 0}:${s.finalAnnounce ? 1 : 0}`;
  const dynamic = s.phase === 'question_open'; // timer + live count keep updating
  if (key === lastKey && !dynamic) return;
  lastKey = key;
  if (timerIv) { clearInterval(timerIv); timerIv = null; }

  if (s.status === 'closed') { audio.setMood('reveal'); return closed(s); }
  const m = (content.missions || []).find((x) => x.id === s.currentMission);
  audio.setMood(MOODMAP[s.phase] || 'lobby');

  switch (s.phase) {
    case 'mission_intro': return missionIntro(s, m);
    case 'question_open': return question(s, m);
    case 'locked': return locked(s, m);
    case 'revealed': return revealed(s, m);
    case 'paused': return simple('พักชั่วคราว', 'PAUSED', 'เดี๋ยวเรากลับมาต่อ');
    case 'lobby':
    default: return lobby(s);
  }
}

/* volatile counts come from the stats doc (fallback to session for old data) */
function joinedCount(s) { return (stats.playersJoined != null) ? stats.playersJoined : (s.playersJoined || 0); }
function answeredCountOf(s) { return (stats.answeredCount != null) ? stats.answeredCount : (s.answeredCount || 0); }

/* ---------------- states ---------------- */
function lobby(s) {
  const joinUrl = new URL('index.html?code=' + encodeURIComponent(s.code), location.href).href;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=12&data=${encodeURIComponent(joinUrl)}`;
  stage().innerHTML = `
    <p class="ds-en presenter__eyebrow" style="color:var(--cyan)">Digital Survival · Live</p>
    <h1 class="presenter__title" style="font-size:clamp(2rem,7vw,4rem)"><span class="ds-ai-text">DIGITAL SURVIVAL</span></h1>
    <p class="presenter__sub">สแกน QR หรือกรอกรหัสห้องเพื่อเข้าเล่น</p>
    <div class="pres-join">
      <div class="pres-qr"><img src="${qr}" alt="QR เข้าเล่น" width="230" height="230"
        onerror="this.style.display='none'"><span class="pres-qr__cap">📷 สแกนเพื่อเข้าเล่น</span></div>
      <div class="pres-join__code"><span class="ds-en">รหัสห้อง · session code</span><div class="pres-code">${s.code}</div>
        <div class="presenter__count"><span class="ds-stat__num" style="font-size:2.2rem">${joinedCount(s)}</span>
          <span class="ds-muted">ผู้เล่นพร้อมแล้ว</span></div></div>
    </div>`;
}

function missionIntro(s, m) {
  stage().innerHTML = `
    <p class="ds-en presenter__eyebrow" style="color:var(--cyan)">Mission ${m ? String(m.no).padStart(2, '0') : ''} · ${m ? m.title : ''}</p>
    <h1 class="presenter__title" style="font-size:clamp(2.4rem,8vw,5.5rem)">${m ? m.titleTh : ''}</h1>
    <p class="presenter__sub">${m ? m.topicTh : ''}</p>
    <p class="pres-intro">${m ? (m.intro || '') : ''}</p>`;
}

function question(s, m) {
  const total = joinedCount(s);
  const ans = answeredCountOf(s);
  const allIn = total > 0 && ans >= total;
  stage().innerHTML = `
    <p class="ds-en presenter__eyebrow" style="color:var(--cyan)">${m ? m.title : ''} · ข้อ ${s.questionIndex || 1}</p>
    <h1 class="presenter__title" style="font-size:clamp(2rem,7vw,4.5rem)">${m ? m.titleTh : 'คำถาม'}</h1>
    <div class="pres-timer" id="presTimer">--:--</div>
    <div class="pres-answered ${allIn ? 'is-all' : ''}"><span id="presAns">${ans}</span> / ${total} <span class="ds-muted">ตอบแล้ว</span></div>
    ${allIn
      ? '<p class="pres-allin">🎉 ทุกคนตอบครบแล้ว!</p>'
      : '<p class="ds-muted" style="margin-top:8px">อ่านสถานการณ์บนสไลด์ แล้วเลือกคำตอบบน iPad ของคุณ</p>'}`;
  if (s.currentQuestion !== lastStartQ) { lastStartQ = s.currentQuestion; audio.sfx('start'); }
  if (allIn && s.currentQuestion !== lastAllInQ) { lastAllInQ = s.currentQuestion; audio.sfx('allin'); }
  startTimer(s);
}

function locked(s, m) {
  const total = joinedCount(s);
  stage().innerHTML = `
    <p class="ds-en presenter__eyebrow" style="color:var(--warning)">Answers Locked</p>
    <h1 class="presenter__title" style="font-size:clamp(2rem,7vw,4.2rem)">ปิดรับคำตอบแล้ว</h1>
    <div class="pres-answered">${answeredCountOf(s)} / ${total} <span class="ds-muted">ตอบแล้ว</span></div>
    <p class="ds-muted" style="margin-top:8px">เตรียมเฉลย…</p>`;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function revealed(s, m) {
  const wantAns = !!s.showAnswer;
  const wantRes = !!s.showResults;
  const q = questions[s.currentQuestion];
  const eyebrow = wantAns && wantRes ? 'Answer + Results' : wantAns ? 'Answer' : 'Results';
  let html = `<p class="ds-en presenter__eyebrow" style="color:var(--success)">${eyebrow}${m ? ' · ' + esc(m.title) : ''}</p>`;
  if (wantAns) html += answerCard(q);
  if (wantRes) {
    html += `<h1 class="presenter__title" style="font-size:clamp(1.4rem,4vw,2.4rem);margin-top:${wantAns ? '10px' : '0'}">🏆 อันดับคะแนน</h1>${podiumBlock()}`;
  }
  if (!wantAns && !wantRes) html += `<h1 class="presenter__title">เฉลยแล้ว</h1><p class="presenter__sub">ดูคำตอบบน iPad ของคุณ</p>`;
  stage().innerHTML = html;
  if (wantRes) {
    animatePodium();
    if (lb.length && s.currentQuestion !== lastConfettiQ) { lastConfettiQ = s.currentQuestion; confetti(); audio.sfx('reveal'); }
    const next = {}; lb.forEach((p, i) => { next[p.playerId] = i + 1; });
    prevRanks = next; // จำอันดับไว้ให้รอบถัดไปโชว์ลูกศรขึ้น/ลง
  } else if (wantAns && s.currentQuestion !== lastConfettiQ) {
    lastConfettiQ = s.currentQuestion; audio.sfx('reveal');
  }
}

/** การ์ดเฉลยบนจอฉาย — เฉลย + คำอธิบาย (ตัวหนังสือใหญ่ อ่านง่าย). */
function answerCard(q) {
  if (!q) return '<p class="presenter__sub">ดูเฉลยบน iPad ของนักเรียน</p>';
  let ans = '';
  if (q.type === 'scenario' || q.type === 'investigation') {
    const opt = (q.options || []).find((o) => o.key === q.correct);
    ans = `<b class="ds-pid">${esc(q.correct)}</b> ${esc(opt ? opt.text : '')}`;
  } else if (q.type === 'ordering') {
    ans = (q.correctOrder || []).map((id) => { const st = (q.steps || []).find((x) => x.id === id); return esc(st ? st.text : id); }).join(' → ');
  } else if (q.type === 'dragsort') {
    ans = 'ดูการจับคู่ที่ถูกต้องบนแผงวิทยากร';
  } else if (q.type === 'assessment') {
    ans = 'แบบประเมินตนเอง — ไม่มีถูก/ผิด';
  }
  return `<div class="pres-answer">
    <div class="pres-answer__lbl">เฉลย</div>
    <div class="pres-answer__ans">${ans}</div>
    ${q.explanation ? `<div class="pres-answer__ex">${esc(q.explanation)}</div>` : ''}
  </div>`;
}
function move(pid, curRank) {
  const prev = prevRanks[pid];
  if (prev == null) return '<span class="mv mv-new">ใหม่</span>';
  const d = prev - curRank;
  if (d > 0) return `<span class="mv mv-up">▲${d}</span>`;
  if (d < 0) return `<span class="mv mv-down">▼${-d}</span>`;
  return '<span class="mv mv-same">–</span>';
}
function podiumBlock() {
  if (!lb.length) return '<p class="presenter__sub">ยังไม่มีคะแนน — เริ่มตอบเพื่อขึ้นกระดาน</p>';
  const top = lb.slice(0, 5);
  const [p1, p2, p3] = top;
  const rest = top.slice(3);
  const ped = (p, rank) => p ? `<div class="ped ped--${rank}">
      <div class="ped__player">
        ${rank === 1 ? '<div class="ped__crown">👑</div>' : ''}
        <div class="ped__name">${esc(p.nickname) || '—'}</div>
        <div class="ped__pid ds-mono">${esc(p.playerId)} ${move(p.playerId, rank)}</div>
        <div class="ped__xp" data-xp="${p.xp || 0}">0</div>
      </div>
      <div class="ped__bar"><span class="ped__rank">${rank}</span></div>
    </div>` : '';
  return `<div class="podium">${ped(p2, 2)}${ped(p1, 1)}${ped(p3, 3)}</div>
    ${rest.length ? `<div class="pod-rest">${rest.map((p, i) => `<div class="pod-row">
      <span class="pod-rank">${i + 4}</span>
      <span class="pod-name">${esc(p.nickname) || '—'} <span class="ds-mono" style="opacity:.55">${esc(p.playerId)}</span> ${move(p.playerId, i + 4)}</span>
      <span class="pod-xp" data-xp="${p.xp || 0}">0</span></div>`).join('')}</div>` : ''}`;
}
function animatePodium() {
  document.querySelectorAll('#stage [data-xp]').forEach((el) => {
    const target = +el.dataset.xp || 0; const dur = 900; const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(target * (p * (2 - p))).toLocaleString('en-US'); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
function confetti() {
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (_e) {}
  const wrap = document.createElement('div'); wrap.className = 'confetti';
  const colors = ['#FFC24B', '#22D3EE', '#2E7DFF', '#A78BFA', '#34D399'];
  for (let i = 0; i < 26; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = (Math.random() * 0.7).toFixed(2) + 's';
    c.style.animationDuration = (2.2 + Math.random()).toFixed(2) + 's';
    wrap.appendChild(c);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4000);
}

function simple(title, en, sub) {
  stage().innerHTML = `<p class="ds-en presenter__eyebrow">${en}</p>
    <h1 class="presenter__title">${title}</h1><p class="presenter__sub">${sub}</p>`;
}
function closed(s) {
  if (s && s.finalAnnounce) return finalRanking(s);
  stage().innerHTML = `<h1 class="presenter__title"><span class="ds-ai-text">DIGITAL SURVIVOR</span></h1>
    <p class="presenter__sub">จบกิจกรรมแล้ว — ขอบคุณทุกคน 🎉</p>
    <p class="ds-muted" style="margin-top:10px">เตรียมประกาศผลรวม…</p>`;
}

/** Grand finale — announced by the host via "ประกาศผลรวม". Supports a
    suspense reveal: the host reveals positions one at a time from the bottom up
    (announceStep = how many revealed). When all are revealed it shows the full
    celebratory podium. announceStep null/undefined = show everything at once. */
let lastStep = null;
function finalRanking(s) {
  const ranked = lb || [];
  const N = ranked.length;
  const step = (s && typeof s.announceStep === 'number') ? Math.min(s.announceStep, N) : N;
  const stepChanged = step !== lastStep; lastStep = step;

  if (!N) { stage().innerHTML = `<p class="ds-en presenter__eyebrow" style="color:var(--xp)">Final Results</p>
    <h1 class="presenter__title" style="font-size:clamp(1.8rem,5vw,3rem)">🏆 ประกาศผลรวม</h1>
    <p class="presenter__sub">ยังไม่มีคะแนน</p>`; return; }

  if (step >= N) return finalPodium(ranked, stepChanged); // all revealed → celebratory podium

  // Progressive suspense reveal: bottom `step` ranks are shown, filling upward.
  const firstRevealed = N - step; // indices >= firstRevealed are revealed
  const nextRank = firstRevealed; // 0-based index of the next one to reveal (its rank = firstRevealed)
  const rows = ranked.map((p, i) => {
    const rank = i + 1;
    if (i >= firstRevealed) {
      const isNew = i === firstRevealed;
      return `<div class="pod-row ${rank <= 3 ? 'pod-row--top' : ''} ${isNew ? 'pod-row--new' : ''}">
        <span class="pod-rank ${rank <= 3 ? 'is-top' : ''}">${rank}</span>
        <span class="pod-name">${esc(p.nickname) || '—'} <span class="ds-mono" style="opacity:.55">${esc(p.playerId)}</span></span>
        <span class="pod-xp" data-xp="${p.xp || 0}">0</span></div>`;
    }
    return `<div class="pod-row pod-row--hidden"><span class="pod-rank">${rank}</span>
      <span class="pod-name ds-muted">อันดับที่ ${rank} · รอประกาศ…</span><span class="pod-xp">•••</span></div>`;
  }).join('');
  stage().innerHTML = `
    <p class="ds-en presenter__eyebrow" style="color:var(--xp)">Final Results · ประกาศทีละอันดับ</p>
    <h1 class="presenter__title" style="font-size:clamp(1.6rem,4.5vw,2.6rem)">🏆 ลุ้นอันดับคะแนน</h1>
    <p class="presenter__sub" style="font-size:clamp(1rem,2.5vw,1.4rem)">เผยแล้ว ${step} / ${N} อันดับ${step ? '' : ' · เตรียมลุ้น!'}</p>
    <div class="pod-rest" style="max-width:720px;margin:18px auto 0">${rows}</div>`;
  animatePodium();
  if (stepChanged && step > 0) audio.sfx('reveal');
}

function finalPodium(ranked, celebrate) {
  const [p1, p2, p3] = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const ped = (p, rank) => p ? `<div class="ped ped--${rank}">
      <div class="ped__player">
        ${rank === 1 ? '<div class="ped__crown">👑</div>' : ''}
        <div class="ped__name">${esc(p.nickname) || '—'}</div>
        <div class="ped__pid ds-mono">${esc(p.playerId)}</div>
        <div class="ped__xp" data-xp="${p.xp || 0}">0</div>
      </div>
      <div class="ped__bar"><span class="ped__rank">${rank}</span></div>
    </div>` : '';
  stage().innerHTML = `
    <p class="ds-en presenter__eyebrow" style="color:var(--xp)">Final Results · ประกาศผลรวม</p>
    <h1 class="presenter__title" style="font-size:clamp(1.8rem,5vw,3rem)">🏆 อันดับคะแนนสุดท้าย</h1>
    <div class="podium">${ped(p2, 2)}${ped(p1, 1)}${ped(p3, 3)}</div>
    ${rest.length ? `<div class="pod-rest">${rest.map((p, i) => `<div class="pod-row">
      <span class="pod-rank">${i + 4}</span>
      <span class="pod-name">${esc(p.nickname) || '—'} <span class="ds-mono" style="opacity:.55">${esc(p.playerId)}</span></span>
      <span class="pod-xp" data-xp="${p.xp || 0}">0</span></div>`).join('')}</div>` : ''}
    <p class="ds-muted" style="margin-top:22px">ขอบคุณทุกคนที่ร่วมกิจกรรม 🎉 · <span class="ds-ai-text">DIGITAL SURVIVOR</span></p>`;
  animatePodium();
  if (celebrate !== false) { confetti(); audio.sfx('reveal'); }
}
function fatal(title, sub) {
  stage().innerHTML = `<h1 class="presenter__title" style="font-size:clamp(2rem,6vw,3.4rem)">${title}</h1>
    <p class="presenter__sub">${sub}</p>`;
}

/* ---------------- sound control (independent BG + SFX) ---------------- */
function wireSound() {
  const bgBtn = document.getElementById('bgBtn');
  const sfxBtn = document.getElementById('sfxBtn');
  const hint = document.getElementById('soundHint');
  if (!bgBtn || !sfxBtn) return;
  const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (_e) { return d; } };
  const paint = () => {
    bgBtn.classList.toggle('is-on', audio.bgOn); bgBtn.classList.toggle('is-off', !audio.bgOn);
    sfxBtn.classList.toggle('is-on', audio.sfxOn); sfxBtn.classList.toggle('is-off', !audio.sfxOn);
    if (hint) hint.style.display = (audio.bgOn || audio.sfxOn) ? 'none' : '';
  };
  bgBtn.addEventListener('click', () => {
    audio.init(); audio.setMood(MOODMAP[lastSession ? lastSession.phase : 'lobby'] || 'lobby');
    audio.setBg(!audio.bgOn); paint();
  });
  sfxBtn.addEventListener('click', () => { audio.init(); audio.setSfx(!audio.sfxOn); if (audio.sfxOn) audio.sfx('select'); paint(); });
  // If sound was on before, re-enable on the first user gesture (autoplay policy).
  if (pref('ds-bg', '0') === '1' || pref('ds-sfx', '0') === '1') {
    const once = () => {
      audio.init(); audio.setMood(MOODMAP[lastSession ? lastSession.phase : 'lobby'] || 'lobby');
      if (pref('ds-bg', '0') === '1') audio.setBg(true);
      if (pref('ds-sfx', '0') === '1') audio.setSfx(true);
      paint(); document.removeEventListener('click', once);
    };
    document.addEventListener('click', once, { once: true });
  }
  paint();
}

/* ---------------- timer ---------------- */
function startTimer(s) {
  const start = typeof s.questionStartAt === 'number' ? s.questionStartAt
    : (s.questionStartAt && s.questionStartAt.toMillis ? s.questionStartAt.toMillis() : Date.now());
  const dur = (s.questionDuration || 30) * 1000;
  lastTickLeft = null;
  const tick = () => {
    const left = Math.max(0, Math.ceil((start + dur - Date.now()) / 1000));
    const el = $('#presTimer');
    if (el) { const m = Math.floor(left / 60), sec = left % 60; el.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; el.classList.toggle('is-low', left <= 10); }
    // countdown ticks (once per second) for the final 10s + a time-up cue
    if (left !== lastTickLeft) {
      if (left > 0 && left <= 10) audio.sfx(left <= 3 ? 'tick' : 'tickLow');
      else if (left === 0 && lastTickLeft != null) audio.sfx('timeup');
      lastTickLeft = left;
    }
    if (left <= 0 && timerIv) { clearInterval(timerIv); timerIv = null; }
  };
  tick(); timerIv = setInterval(tick, 250);
}

main();
