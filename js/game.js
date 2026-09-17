/* =================================================================
   Game engine (student side) — JDKS ARENA
   Renders the current question by type, captures the answer, submits
   it (write-once), and mirrors locked / revealed states.
   Types: scenario · investigation · dragsort · ordering · assessment.
   All interactions are tap-based (no HTML5 drag) for reliable touch.
   ================================================================= */
import { submitAnswer } from './session.js';
import { icon } from './icons.js';
import { speedFactor, xpForAnswer } from './scoring.js';
import { mascot } from './mascot.js';
import { toast } from './dialog.js';

/* Answer tiles: one saturated colour + one shape per slot, so a student can
   shout "เขียวสี่เหลี่ยม!" across the room and everyone knows which one. */
const TILE = [
  { c: '#E11D48', d: '#9F1239' },
  { c: '#2563EB', d: '#1E40AF' },
  { c: '#F59E0B', d: '#B45309' },
  { c: '#16A34A', d: '#166534' },
  { c: '#7C3AED', d: '#5B21B6' },
  { c: '#0891B2', d: '#155E75' },
];
/* Drawn, not typed: an emoji star renders differently (or in someone else's
   colours) on every platform, and these shapes are the shared language between
   the student's tile, the projector and the teacher's answer spread. */
const SHAPES = [
  '<polygon points="12,3.5 21,20 3,20"/>',
  '<polygon points="12,2.5 21.5,12 12,21.5 2.5,12"/>',
  '<circle cx="12" cy="12" r="9"/>',
  '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/>',
  '<polygon points="12,2.5 14.7,9.3 22,9.8 16.4,14.5 18.2,21.5 12,17.6 5.8,21.5 7.6,14.5 2,9.8 9.3,9.3"/>',
  '<polygon points="12,2.5 20.5,7.2 20.5,16.8 12,21.5 3.5,16.8 3.5,7.2"/>',
];
/** The shape for answer slot i, as an inline SVG. */
export function shapeIcon(i, cls = '') {
  return `<svg class="qx-shape ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${SHAPES[i % SHAPES.length]}</svg>`;
}

const SUBMIT_KEY = 'ds-answers';
let timerIv = null;

/* Solo (account-free) play keeps its answers in memory only. */
let soloSubs = {};
export function resetSolo() { soloSubs = {}; }
function getSubmitted(ctx) {
  if (ctx && ctx.solo) return soloSubs;
  try { return JSON.parse(localStorage.getItem(SUBMIT_KEY) || '{}'); } catch (_e) { return {}; }
}
/** Key answers by sessionId+questionId so a device reused across sessions (or a
    previous student's iPad) never inherits an old answer as "already submitted". */
function subKey(ctx, qid) { return `${(ctx.stored && ctx.stored.sessionId) || ''}_${qid}`; }
function markSubmitted(ctx, key, choice, isCorrect, responseMs) {
  const m = getSubmitted(ctx); m[key] = { choice, isCorrect, responseMs: responseMs || 0 };
  if (ctx && ctx.solo) return;
  try { localStorage.setItem(SUBMIT_KEY, JSON.stringify(m)); } catch (_e) {}
}
function numTime(t) { return typeof t === 'number' ? t : (t && t.toMillis ? t.toMillis() : Date.now()); }

/** Main entry — called by student.js on every relevant session snapshot. */
export function renderGame(ctx) {
  const { container, session, questions } = ctx;
  if (timerIv) { clearInterval(timerIv); timerIv = null; }
  const q = questions[session.currentQuestion];
  if (!q) { container.innerHTML = notReady(); return; }
  ctx.q = q; ctx.sub = getSubmitted(ctx)[subKey(ctx, q.id)];
  window.__ctxQ = q; // used by the delegated evidence-reveal handler

  // เฉลย (showAnswer) และ ผลคะแนน (showResults) เป็นอิสระต่อกัน วิทยากรกดสลับได้
  const origPhase = session.phase;
  if (origPhase === 'revealed' && !ctx.showAnswer) {
    // ยังไม่เฉลย แต่ (อาจ) โชว์ผลคะแนน → ให้ตัวคำถามแสดงเป็น "ล็อกแล้ว" (เห็นคำตอบตัวเอง ไม่เห็นเฉลย)
    ctx.session = { ...session, phase: 'locked' };
  }
  dispatchType(ctx);
  ctx.session = session; // คืนค่าเดิม
  if (origPhase === 'revealed' && ctx.showResults) {
    const wrap = document.createElement('div');
    wrap.innerHTML = standingsHtml(ctx);
    if (wrap.firstElementChild) container.appendChild(wrap.firstElementChild);
  }
}

function dispatchType(ctx) {
  const q = ctx.q;
  switch (q.type) {
    case 'investigation': return renderChoice(ctx, investigationHeader(q));
    case 'dragsort': return renderDragsort(ctx);
    case 'ordering': return renderOrdering(ctx);
    case 'assessment': return renderAssessment(ctx);
    case 'scenario':
    default: return renderChoice(ctx, `<p class="q-situation">${q.q_prompt || q.situation}</p>`);
  }
}

/* ---------------- standings (ผลคะแนนบนจอนักเรียน) ---------------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtXp(n) { return (n || 0).toLocaleString('en-US'); }
function standingsHtml(ctx) {
  const lb = ctx.leaderboard || [];
  const me = ctx.player || {};
  const top = lb.slice(0, 5);
  const inTop = top.some((p) => p.playerId === me.playerId);
  return `<div class="stand ds-fade-up">
    <div class="stand__h">${icon('trophy')} อันดับคะแนน <span class="ds-en">Live Standings</span></div>
    ${top.length ? top.map((p, i) => `<div class="stand__row ${p.playerId === me.playerId ? 'is-me' : ''}">
        <span class="stand__rk ${i < 3 ? 'is-top' : ''}">${i + 1}</span>
        <span class="stand__nm">${esc(p.nickname) || '—'} <span class="ds-pid">${esc(p.playerId)}</span></span>
        <span class="stand__xp">${fmtXp(p.xp)}</span></div>`).join('')
      : '<p class="ds-muted ds-center" style="padding:10px 0">กำลังรวมคะแนน…</p>'}
    ${(!inTop && me.playerId) ? `<div class="stand__row is-me stand__me">
        <span class="stand__rk">•</span>
        <span class="stand__nm">คุณ <span class="ds-pid">${esc(me.playerId)}</span></span>
        <span class="stand__xp">${fmtXp(me.xp)}</span></div>` : ''}
  </div>`;
}

/* =====================================================================
   Question chrome — timer ring + the XP that is still up for grabs
   ===================================================================== */
function maxXp(ctx) {
  const rules = (ctx.content && ctx.content.xpRules) || {};
  return Number(ctx.q.xp) || Number(rules.base) || 1000;
}
function qxHead(ctx, label, opts = {}) {
  const live = opts.live !== false;
  return `<div class="qx-head">
    <span class="qx-timer ${live ? '' : 'is-off'}" id="qTimer"><b>--</b></span>
    <span class="ds-chip ${live ? 'ds-chip--live' : ''}">${label}</span>
    ${live ? `<span class="qx-xp" id="qXpNow" title="ยิ่งตอบเร็ว ยิ่งได้คะแนนเยอะ">+${fmtXp(maxXp(ctx))} XP</span>` : ''}
  </div>`;
}
/** One answer tile. st: {selected, correct, wrong, static} */
function tile(o, i, st = {}) {
  const t = TILE[i % TILE.length];
  const cls = ['qx-tile', st.selected && 'is-selected', st.correct && 'is-correct',
    st.wrong && 'is-wrong', st.faded && 'is-faded'].filter(Boolean).join(' ');
  const mark = st.correct ? `<span class="qx-tile__mark">${icon('check')}</span>`
    : st.wrong ? `<span class="qx-tile__mark">${icon('close')}</span>` : '';
  const style = `--tile:${t.c};--tile-d:${t.d}`;
  return st.static
    ? `<div class="${cls}" style="${style}"><span class="qx-tile__shape">${shapeIcon(i)}</span><span class="qx-tile__txt">${o.text}</span>${mark}</div>`
    : `<button type="button" class="${cls}" style="${style}" data-key="${o.key}">
        <span class="qx-tile__shape">${shapeIcon(i)}</span><span class="qx-tile__txt">${o.text}</span></button>`;
}

/** The question's own wording, whatever its type (used by the projector). */
export function promptOf(q) {
  if (!q) return '';
  return q.q_prompt || q.situation || q.question || q.prompt || q.scenario || '';
}
/** Read-only answer tiles for the projector, optionally marking the answer. */
export function answerTiles(q, { correct = null, big = false } = {}) {
  if (!q || !Array.isArray(q.options) || !q.options.length) return '';
  return `<div class="qx-tiles ${big ? 'qx-tiles--big' : ''}">${q.options.map((o, i) => tile(o, i, {
    static: true,
    correct: correct != null && o.key === correct,
    faded: correct != null && o.key !== correct,
  })).join('')}</div>`;
}

/* =====================================================================
   CHOICE (scenario + investigation) — single-select A..E / TRUE..
   ===================================================================== */
function renderChoice(ctx, headerHtml) {
  const { container, session, q, sub } = ctx;
  const phase = session.phase;
  if (phase === 'question_open' && sub) return submittedBox(ctx, `คำตอบของคุณคือ <b>${esc(labelOf(q, sub.choice))}</b>`);
  if (phase === 'locked') return lockedChoice(ctx, headerHtml);
  if (phase === 'revealed') return revealedChoice(ctx, headerHtml);

  container.innerHTML = `
    ${qxHead(ctx, 'กำลังตอบ')}
    ${headerHtml}
    <div class="qx-tiles" id="qOptions">${q.options.map((o, i) => tile(o, i)).join('')}</div>
    <button class="ds-btn ds-btn--primary ds-btn--block qx-send" id="qSubmit" disabled>เลือกคำตอบก่อน</button>
    <p class="q-hint ds-muted ds-center" id="qHint">คิดให้ดี — แต่ยิ่งตอบเร็ว ยิ่งได้คะแนนเยอะ</p>`;

  let choice = null;
  const opts = [...container.querySelectorAll('.qx-tile')];
  const submit = container.querySelector('#qSubmit');
  opts.forEach((b) => b.addEventListener('click', () => {
    choice = b.dataset.key;
    opts.forEach((x) => x.classList.toggle('is-selected', x === b));
    submit.disabled = false;
    submit.textContent = 'ส่งคำตอบ';
  }));
  submit.addEventListener('click', () => doSubmit(ctx, submit,
    () => ({ choice, isCorrect: choice === q.correct }),
    () => submittedBox(ctx, `คำตอบของคุณคือ <b>${esc(labelOf(q, choice))}</b>`)));
  startTimer(ctx, () => softLock(ctx));
}

function lockedChoice(ctx, headerHtml) {
  const { container, q, sub } = ctx;
  container.innerHTML = `${qxHead(ctx, 'ล็อกคำตอบแล้ว', { live: false })}${headerHtml}
    <div class="qx-tiles">${q.options.map((o, i) => tile(o, i, { static: true, selected: sub && sub.choice === o.key, faded: sub && sub.choice !== o.key })).join('')}</div>
    <p class="ds-muted ds-center" style="margin-top:14px">รอวิทยากรเฉลย…</p>`;
}
function revealedChoice(ctx, headerHtml) {
  const { container, q, sub } = ctx;
  const right = !!(sub && sub.choice === q.correct);
  container.innerHTML = `${resultSplash(ctx, sub, right)}
    ${qxHead(ctx, 'เฉลย', { live: false })}${headerHtml}
    <div class="qx-tiles">${q.options.map((o, i) => tile(o, i, {
      static: true,
      correct: o.key === q.correct,
      wrong: !!(sub && sub.choice === o.key && o.key !== q.correct),
      faded: o.key !== q.correct && !(sub && sub.choice === o.key),
    })).join('')}</div>
    ${resultBanner(sub, right, q)}`;
}
/** Big win/miss splash with the XP actually earned. */
function resultSplash(ctx, sub, right) {
  const { q } = ctx;
  const none = !sub;
  const rules = (ctx.content && ctx.content.xpRules) || {};
  const gained = right
    ? xpForAnswer(q, sub, rules, (ctx.session.questionDuration || 45) * 1000)
    : 0;
  const kind = none ? 'miss' : right ? 'win' : 'lose';
  const art = none ? 'clock' : right ? 'trophy' : 'brain';
  const title = none ? 'ไม่ได้ตอบข้อนี้' : right ? 'ตอบถูก!' : 'ยังไม่ใช่คำตอบที่ดีที่สุด';
  const line = none ? 'ไม่เป็นไร ข้อต่อไปเอาใหม่'
    : right ? `+${fmtXp(sub.xp != null ? sub.xp : gained)} XP`
    : 'อ่านเฉลยด้านล่าง แล้วไปต่อกัน';
  return `<div class="qx-splash qx-splash--${kind}">
    ${mascot(art, { size: 92 })}
    <div><h3>${title}</h3><p>${line}</p></div>
  </div>`;
}
function labelOf(q, key) {
  const o = (q.options || []).find((x) => x.key === key);
  return o ? o.text : key;
}
function investigationHeader(q) {
  return `<div class="news-card">
    <div class="news-card__tag">${icon('search')} ข่าวที่ต้องตรวจสอบ</div>
    <h3 class="news-card__headline">${q.headline}</h3>
    <div class="news-card__meta"><span>ที่มา: ${q.source}</span><span>${q.date}</span></div>
    ${q.quote ? `<blockquote class="news-card__quote">${q.quote}</blockquote>` : ''}
  </div>
  <div class="evidence" id="evidence">
    ${(q.evidence || []).map((e, i) => `<button class="evidence__btn" data-i="${i}">${icon('eye')} ${e.label}</button>`).join('')}
    <div class="evidence__panel" id="evPanel" hidden></div>
  </div>
  <p class="q-situation">${q.question}</p>`;
}

/* =====================================================================
   DRAGSORT — tap a card, tap a bucket (touch friendly)
   ===================================================================== */
function renderDragsort(ctx) {
  const { container, session, q, sub } = ctx;
  const phase = session.phase;
  if (phase === 'question_open' && sub) return submittedBox(ctx, 'ส่งคำตอบจับคู่การ์ดแล้ว');
  if (phase === 'locked') return dragReview(ctx, false);
  if (phase === 'revealed') return dragReview(ctx, true);

  const assign = {}; // cardId -> bucketKey
  let picked = null;
  container.innerHTML = `
    ${qxHead(ctx, 'จับคู่ลงกล่อง')}
    <p class="q-situation">${q.prompt}</p>
    <p class="q-hint ds-muted">แตะการ์ด 1 ใบ แล้วแตะกล่องที่ต้องการ · แตะการ์ดในกล่องเพื่อเอากลับ</p>
    <div class="pool" id="pool">${q.cards.map((c) => cardChip(c)).join('')}</div>
    <div class="buckets buckets--${q.buckets.length}">
      ${q.buckets.map((b) => `<div class="bucket" data-bucket="${b.key}"><div class="bucket__label">${b.labelTh}<span class="ds-en">${b.label}</span></div><div class="bucket__drop" data-drop="${b.key}"></div></div>`).join('')}
    </div>
    <button class="ds-btn ds-btn--primary ds-btn--block" id="qSubmit" style="margin-top:16px" disabled>ส่งคำตอบ</button>`;

  const pool = container.querySelector('#pool');
  const submit = container.querySelector('#qSubmit');
  const refresh = () => { submit.disabled = Object.keys(assign).length !== q.cards.length; };
  function selectCard(el) { picked = el.dataset.card; container.querySelectorAll('.card-chip').forEach((c) => c.classList.toggle('is-picked', c === el)); }
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.card-chip');
    const drop = e.target.closest('.bucket__drop, .bucket');
    if (chip) {
      if (chip.parentElement.classList.contains('bucket__drop') || chip.closest('.bucket')) {
        // card sits in a bucket → return to pool
        delete assign[chip.dataset.card]; pool.appendChild(chip); chip.classList.remove('is-picked'); picked = null; refresh(); return;
      }
      selectCard(chip); return;
    }
    if (drop && picked) {
      const key = (drop.dataset.drop || drop.dataset.bucket);
      const chipEl = container.querySelector(`.card-chip[data-card="${picked}"]`);
      const target = container.querySelector(`.bucket__drop[data-drop="${key}"]`);
      assign[picked] = key; target.appendChild(chipEl); chipEl.classList.remove('is-picked'); picked = null; refresh();
    }
  });
  submit.addEventListener('click', () => {
    const isCorrect = q.cards.every((c) => assign[c.id] === c.correct);
    doSubmit(ctx, submit, () => ({ choice: assign, isCorrect }), () => submittedBox(ctx, 'ส่งคำตอบจับคู่การ์ดแล้ว'));
  });
  startTimer(ctx, () => softLock(ctx));
}
function cardChip(c) { return `<button class="card-chip" data-card="${c.id}">${c.text}</button>`; }
function dragReview(ctx, reveal) {
  const { container, q, sub } = ctx;
  const assign = (sub && typeof sub.choice === 'object') ? sub.choice : {};
  container.innerHTML = `<div class="q-head"><span class="ds-chip">${reveal ? 'เฉลย' : 'ล็อกแล้ว'}</span></div>
    <p class="q-situation">${q.prompt}</p>
    <div class="review-list">${q.cards.map((c) => {
      const mine = assign[c.id]; const ok = mine === c.correct;
      const bucket = q.buckets.find((b) => b.key === c.correct);
      return `<div class="review-row ${reveal ? (ok ? 'is-correct' : 'is-wrong') : ''}">
        <span>${c.text}</span>
        <span class="review-row__ans">${reveal ? `${icon(ok ? 'check' : 'close')} ${bucket ? bucket.labelTh : c.correct}` : (q.buckets.find((b) => b.key === mine)?.labelTh || '—')}</span></div>`;
    }).join('')}</div>
    ${reveal ? `<div class="ds-alert ${sub && q.cards.every((c) => assign[c.id] === c.correct) ? 'ds-alert--ok' : 'ds-alert--warn'}" style="margin-top:14px"><span>${icon('bulb')}</span><div><span class="ds-muted">${q.explanation}</span></div></div>` : '<p class="ds-muted ds-center" style="margin-top:12px">รอวิทยากรเฉลย…</p>'}`;
}

/* =====================================================================
   ORDERING — tap steps to build a sequence
   ===================================================================== */
function renderOrdering(ctx) {
  const { container, session, q, sub } = ctx;
  const phase = session.phase;
  if (phase === 'question_open' && sub) return submittedBox(ctx, 'ส่งลำดับการตัดสินใจแล้ว');
  if (phase === 'locked') return orderReview(ctx, false);
  if (phase === 'revealed') return orderReview(ctx, true);

  const shuffled = [...q.steps].sort(() => Math.random() - 0.5);
  const order = [];
  container.innerHTML = `
    ${qxHead(ctx, 'เรียงลำดับ')}
    <p class="q-situation">${q.scenario}</p>
    <p class="q-hint ds-muted">แตะขั้นตอนตามลำดับที่คุณคิดว่าถูก · แตะในลำดับเพื่อเอาออก</p>
    <div class="order-seq" id="orderSeq"></div>
    <div class="order-pool" id="orderPool">${shuffled.map((s) => `<button class="card-chip" data-step="${s.id}">${s.text}</button>`).join('')}</div>
    <button class="ds-btn ds-btn--primary ds-btn--block" id="qSubmit" style="margin-top:16px" disabled>ส่งคำตอบ</button>`;
  const seq = container.querySelector('#orderSeq');
  const pool = container.querySelector('#orderPool');
  const submit = container.querySelector('#qSubmit');
  const redraw = () => {
    seq.innerHTML = order.map((id, i) => { const st = q.steps.find((s) => s.id === id); return `<button class="card-chip is-picked" data-rem="${id}"><b>${i + 1}.</b> ${st.text}</button>`; }).join('');
    submit.disabled = order.length !== q.steps.length;
  };
  pool.addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (!b || order.includes(b.dataset.step)) return; order.push(b.dataset.step); b.style.visibility = 'hidden'; redraw(); });
  seq.addEventListener('click', (e) => { const b = e.target.closest('[data-rem]'); if (!b) return; const id = b.dataset.rem; order.splice(order.indexOf(id), 1); const pb = pool.querySelector(`[data-step="${id}"]`); if (pb) pb.style.visibility = 'visible'; redraw(); });
  submit.addEventListener('click', () => {
    const isCorrect = order.length === q.correctOrder.length && order.every((id, i) => id === q.correctOrder[i]);
    doSubmit(ctx, submit, () => ({ choice: order, isCorrect }), () => submittedBox(ctx, 'ส่งลำดับการตัดสินใจแล้ว'));
  });
  startTimer(ctx, () => softLock(ctx));
}
function orderReview(ctx, reveal) {
  const { container, q, sub } = ctx;
  const mine = (sub && Array.isArray(sub.choice)) ? sub.choice : [];
  const right = mine.length === q.correctOrder.length && mine.every((id, i) => id === q.correctOrder[i]);
  container.innerHTML = `<div class="q-head"><span class="ds-chip">${reveal ? 'เฉลย' : 'ล็อกแล้ว'}</span></div>
    <p class="q-situation">${q.scenario}</p>
    <div class="order-seq">${(reveal ? q.correctOrder : mine).map((id, i) => { const st = q.steps.find((s) => s.id === id); return `<div class="card-chip"><b>${i + 1}.</b> ${st ? st.text : id}</div>`; }).join('')}</div>
    ${reveal ? `<div class="ds-alert ${right ? 'ds-alert--ok' : 'ds-alert--warn'}" style="margin-top:14px"><span>${icon(right ? 'check' : 'bulb')}</span><div><strong>${right ? 'เรียงถูกต้อง!' : 'ลำดับที่ดีที่สุด (ด้านบน)'}</strong><br><span class="ds-muted">${q.explanation}</span></div></div>` : '<p class="ds-muted ds-center" style="margin-top:12px">รอวิทยากรเฉลย…</p>'}`;
}

/* =====================================================================
   ASSESSMENT — 0..3 scale per statement → Digital Habit Profile
   ===================================================================== */
function renderAssessment(ctx) {
  const { container, session, q, sub } = ctx;
  if (sub && typeof sub.choice === 'object') return assessmentResult(ctx, sub.choice);

  const answers = {};
  container.innerHTML = `
    ${qxHead(ctx, 'ประเมินตนเอง', { live: false })}
    <p class="q-situation">${q.prompt}</p>
    <div class="assess">${q.statements.map((s) => `
      <div class="assess__row" data-sid="${s.id}">
        <div class="assess__text">${s.text}</div>
        <div class="assess__scale">${q.scale.map((sc) => `<button class="assess__opt" data-v="${sc.v}">${sc.v}<small>${sc.label}</small></button>`).join('')}</div>
      </div>`).join('')}</div>
    <button class="ds-btn ds-btn--primary ds-btn--block" id="qSubmit" style="margin-top:18px" disabled>ดูผล Digital Habit Profile</button>`;
  const submit = container.querySelector('#qSubmit');
  container.querySelectorAll('.assess__row').forEach((row) => {
    row.querySelectorAll('.assess__opt').forEach((b) => b.addEventListener('click', () => {
      answers[row.dataset.sid] = Number(b.dataset.v);
      row.querySelectorAll('.assess__opt').forEach((x) => x.classList.toggle('is-selected', x === b));
      submit.disabled = Object.keys(answers).length !== q.statements.length;
    }));
  });
  submit.addEventListener('click', () => doSubmit(ctx, submit, () => ({ choice: answers, isCorrect: null }), () => assessmentResult(ctx, answers)));
}
function assessmentResult(ctx, answers) {
  const { container, q } = ctx;
  const dims = {}; // dim -> {sum,count}
  q.statements.forEach((s) => { const v = answers[s.id] || 0; dims[s.dimension] = dims[s.dimension] || { sum: 0, count: 0 }; dims[s.dimension].sum += v; dims[s.dimension].count++; });
  const total = Object.values(answers).reduce((a, b) => a + b, 0);
  const max = q.statements.length * 3;
  const balance = Math.round((1 - total / max) * 100); // higher = more balanced
  container.innerHTML = `
    <div class="q-head"><span class="ds-chip">Digital Habit Profile</span></div>
    <div class="balance"><div class="balance__num">${balance}<small>/100</small></div><div class="balance__label">คะแนนสมดุลดิจิทัล<br><span class="ds-muted">${balanceWord(balance)}</span></div></div>
    <div class="dims">${Object.keys(dims).map((k) => {
      const avg = dims[k].sum / dims[k].count; const pct = Math.round((avg / 3) * 100); const risk = avg >= 2;
      return `<div class="dim"><div class="dim__head"><span>${q.dimensions[k] || k}</span><span class="ds-en">${risk ? 'ควรดูแล' : 'สมดุลดี'}</span></div><div class="ds-progress"><span class="ds-progress__fill" style="width:${pct}%;background:${risk ? 'linear-gradient(90deg,var(--warning),var(--danger))' : 'linear-gradient(90deg,var(--electric),var(--cyan))'}"></span></div></div>`;
    }).join('')}</div>
    <div class="ds-alert" style="margin-top:16px"><span>${icon('balance')}</span><div><span class="ds-muted">${q.explanation}</span></div></div>
    <p class="ds-muted ds-center" style="margin-top:10px">${tips(dims)}</p>`;
}
function balanceWord(b) { return b >= 70 ? 'สมดุลดีมาก' : b >= 45 ? 'พอใช้ ปรับได้อีกนิด' : 'ลองปรับสมดุลการใช้ดิจิทัลดูนะ'; }
function tips(dims) {
  const worst = Object.keys(dims).sort((a, b) => (dims[b].sum / dims[b].count) - (dims[a].sum / dims[a].count))[0];
  const map = { focus: 'ลองตั้งเวลาพักจากมือถือ และปิดแจ้งเตือนที่ไม่จำเป็น', wellbeing: 'ลองงดจอ 1 ชม.ก่อนนอน เพื่อการนอนที่ดีขึ้น', safety: 'ตั้งรหัสผ่านที่ต่างกันในแต่ละบัญชี และตรวจก่อนกดลิงก์', privacy: 'ตรวจการตั้งค่าความเป็นส่วนตัว และคิดก่อนแชร์ข้อมูลส่วนตัว' };
  return worst ? `คำแนะนำ: ${map[worst] || ''}` : '';
}

/* =====================================================================
   shared helpers
   ===================================================================== */
async function doSubmit(ctx, submit, build, onDone) {
  const { session, q } = ctx;
  submit.disabled = true; submit.textContent = 'กำลังส่ง…';
  const { choice, isCorrect } = build();
  const responseMs = Math.max(0, Date.now() - numTime(session.questionStartAt));
  if (!ctx.solo) {
    // Firestore's offline persistence is deliberately off (it hangs on some
    // iOS Safari devices), so a failed write is NOT retried for us. Two cases
    // have to be told apart:
    //   rejected  → it will never land. Don't pretend it was sent.
    //   still slow → the SDK holds it in memory and flushes on reconnect, so
    //                carry on rather than making the student stare at a
    //                disabled button while the bell rings.
    let failed = null;
    const write = submitAnswer(ctx.stored, {
      questionId: q.id, missionId: q.missionId, choice, isCorrect, responseMs,
    }).catch((e) => { failed = e; });
    await Promise.race([write, new Promise((r) => setTimeout(r, 5000))]);
    if (failed) {
      submit.disabled = false;
      submit.textContent = 'ส่งอีกครั้ง';
      toast('ส่งคำตอบไม่สำเร็จ — ตรวจสัญญาณแล้วกดส่งอีกครั้ง', 'error');
      try { console.error('[JDKS Arena submit]', failed); } catch (_e) {}
      return;
    }
  }
  markSubmitted(ctx, subKey(ctx, q.id), choice, isCorrect, responseMs);
  ctx.sub = { choice, isCorrect, responseMs };
  // Solo play has no host to wait for: jump straight to the reveal.
  if (ctx.solo && ctx.onAnswer) ctx.onAnswer({ choice, isCorrect, responseMs });
  else onDone();
}
function submittedBox(ctx, line) {
  const container = ctx.container || ctx;
  container.innerHTML = `<div class="qx-wait">
    ${mascot('rocket', { size: 120 })}
    <h3>ส่งคำตอบแล้ว</h3>
    <p>${line}</p>
    <div class="qx-dots"><i></i><i></i><i></i></div>
    <p class="ds-muted">รอเพื่อนๆ ตอบให้ครบ แล้ววิทยากรจะเฉลย</p></div>`;
}
function resultBanner(sub, right, q) {
  return `<div class="ds-alert ${right ? 'ds-alert--ok' : 'ds-alert--warn'}" style="margin-top:16px"><span>${icon(right ? 'check' : 'bulb')}</span>
    <div><strong>ทำไมถึงเป็นแบบนั้น</strong><br><span class="ds-muted">${q.explanation || ''}</span></div></div>`;
}
function notReady() {
  return `<div class="qx-wait">${mascot('owl', { size: 130 })}
    <h3>เตรียมคำถาม…</h3><p class="ds-muted">วิทยากรกำลังเปิดคำถาม รอสักครู่</p>
    <div class="qx-dots"><i></i><i></i><i></i></div></div>`;
}
function softLock(ctx) {
  const container = ctx.container;
  if (getSubmitted(ctx)[subKey(ctx, ctx.q.id)]) return;
  const submit = container.querySelector('#qSubmit'); if (submit) submit.disabled = true;
  const hint = container.querySelector('#qHint'); if (hint) { hint.textContent = 'หมดเวลา — รอวิทยากรเฉลย'; hint.style.color = 'var(--danger)'; }
  const send = container.querySelector('#qSubmit'); if (send) send.textContent = 'หมดเวลาแล้ว';
  if (ctx.solo && ctx.onTimeout) ctx.onTimeout();
  // pointer-events alone only stops a mouse or a finger. The tiles and cards
  // are real <button>s, so a student on a keyboard — or on switch access or a
  // screen reader — could still Tab to one and keep answering after the clock
  // ran out. Disabling them closes both routes and takes them out of the tab
  // order, which is also what "locked" should sound like to a screen reader.
  container.querySelectorAll('.qx-tile, .ds-option, .card-chip, .assess__opt, .bucket__drop').forEach((x) => {
    x.style.pointerEvents = 'none';
    if ('disabled' in x) x.disabled = true;
    else x.setAttribute('aria-disabled', 'true');
  });
}
/** Countdown ring + a live XP number that drains as the clock runs, so the
    "ยิ่งเร็วยิ่งได้เยอะ" rule is something students can literally watch. */
function startTimer(ctx, onZero) {
  const session = ctx.session || ctx;
  const rules = (ctx.content && ctx.content.xpRules) || {};
  const base = ctx.q ? maxXp(ctx) : 0;
  const unlimited = session.questionDuration === 0;
  const start = numTime(session.questionStartAt);
  const dur = (unlimited ? 60 : (session.questionDuration || 45)) * 1000;

  const paintXp = (usedMs) => {
    const el = document.getElementById('qXpNow');
    if (!el || !base) return;
    const now = Math.round(base * speedFactor(usedMs, dur, rules));
    el.textContent = `+${fmtXp(now)} XP`;
    el.classList.toggle('is-low', now <= base * 0.55);
  };

  const ring = document.getElementById('qTimer');
  if (unlimited) {
    if (ring) { ring.innerHTML = '<b>∞</b>'; ring.style.setProperty('--p', '100%'); }
    paintXp(Date.now() - start);
    timerIv = setInterval(() => paintXp(Date.now() - start), 1000);
    return;
  }

  let fired = false;
  const tick = () => {
    const used = Date.now() - start;
    const left = Math.max(0, Math.ceil((dur - used) / 1000));
    const el = document.getElementById('qTimer');
    if (el) {
      el.innerHTML = `<b>${left}</b>`;
      el.style.setProperty('--p', `${Math.max(0, Math.min(100, ((dur - used) / dur) * 100))}%`);
      el.classList.toggle('is-low', left <= 10);
    }
    paintXp(used);
    if (left <= 0 && !fired) { fired = true; onZero && onZero(); if (timerIv) { clearInterval(timerIv); timerIv = null; } }
  };
  tick(); timerIv = setInterval(tick, 250);
}

/* evidence reveal (delegated globally since header is re-rendered) */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.evidence__btn'); if (!btn) return;
  const wrap = btn.closest('.evidence'); const panel = wrap.querySelector('#evPanel');
  const q = window.__ctxQ; // set below
  if (!q || !q.evidence) return;
  const ev = q.evidence[Number(btn.dataset.i)];
  panel.hidden = false; panel.innerHTML = `<b>${ev.label}:</b> ${ev.text}`;
  wrap.querySelectorAll('.evidence__btn').forEach((b) => b.classList.toggle('is-active', b === btn));
});
