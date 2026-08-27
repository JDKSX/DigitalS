/* =================================================================
   Game engine (student side) — DIGITAL SURVIVAL
   Renders the current question by type, captures the answer, submits
   it (write-once), and mirrors locked / revealed states.
   Types: scenario · investigation · dragsort · ordering · assessment.
   All interactions are tap-based (no HTML5 drag) for reliable touch.
   ================================================================= */
import { submitAnswer } from './session.js';
import { icon } from './icons.js';

const SUBMIT_KEY = 'ds-answers';
let timerIv = null;

function getSubmitted() { try { return JSON.parse(localStorage.getItem(SUBMIT_KEY) || '{}'); } catch (_e) { return {}; } }
function markSubmitted(qid, choice, isCorrect) {
  const m = getSubmitted(); m[qid] = { choice, isCorrect };
  try { localStorage.setItem(SUBMIT_KEY, JSON.stringify(m)); } catch (_e) {}
}
function numTime(t) { return typeof t === 'number' ? t : (t && t.toMillis ? t.toMillis() : Date.now()); }

/** Main entry — called by student.js on every relevant session snapshot. */
export function renderGame(ctx) {
  const { container, session, questions } = ctx;
  if (timerIv) { clearInterval(timerIv); timerIv = null; }
  const q = questions[session.currentQuestion];
  if (!q) { container.innerHTML = notReady(); return; }
  ctx.q = q; ctx.sub = getSubmitted()[q.id];
  window.__ctxQ = q; // used by the delegated evidence-reveal handler
  switch (q.type) {
    case 'investigation': return renderChoice(ctx, investigationHeader(q));
    case 'dragsort': return renderDragsort(ctx);
    case 'ordering': return renderOrdering(ctx);
    case 'assessment': return renderAssessment(ctx);
    case 'scenario':
    default: return renderChoice(ctx, `<p class="q-situation">${q.q_prompt || q.situation}</p>`);
  }
}

/* =====================================================================
   CHOICE (scenario + investigation) — single-select A..E / TRUE..
   ===================================================================== */
function renderChoice(ctx, headerHtml) {
  const { container, session, q, sub } = ctx;
  const phase = session.phase;
  if (phase === 'question_open' && sub) return submittedBox(container, `คำตอบของคุณ: <b class="ds-pid">${sub.choice}</b>`);
  if (phase === 'locked') return lockedChoice(ctx, headerHtml);
  if (phase === 'revealed') return revealedChoice(ctx, headerHtml);

  container.innerHTML = `
    <div class="q-head"><span class="ds-chip ds-chip--live">กำลังตอบ</span><span class="ds-timer q-timer" id="qTimer">--:--</span></div>
    ${headerHtml}
    <div class="stage-options" id="qOptions">
      ${q.options.map((o) => `<button class="ds-option" data-key="${o.key}"><span class="ds-option__key">${o.key}</span><span>${o.text}</span></button>`).join('')}
    </div>
    <button class="ds-btn ds-btn--primary ds-btn--block" id="qSubmit" style="margin-top:18px" disabled>ส่งคำตอบ</button>
    <p class="q-hint ds-muted ds-center" id="qHint">💭 คิดก่อนตอบ — คุณภาพการตัดสินใจสำคัญกว่าความเร็ว</p>`;

  let choice = null;
  const opts = [...container.querySelectorAll('.ds-option')];
  const submit = container.querySelector('#qSubmit');
  opts.forEach((b) => b.addEventListener('click', () => { choice = b.dataset.key; opts.forEach((x) => x.classList.toggle('is-selected', x === b)); submit.disabled = false; }));
  submit.addEventListener('click', () => doSubmit(ctx, submit, () => ({ choice, isCorrect: choice === q.correct }), () => submittedBox(container, `คำตอบของคุณ: <b class="ds-pid">${choice}</b>`)));
  startTimer(session, () => softLock(container, () => getSubmitted()[q.id]));
}

function lockedChoice(ctx, headerHtml) {
  const { container, q, sub } = ctx;
  container.innerHTML = `<div class="q-head"><span class="ds-chip">ล็อกคำตอบแล้ว</span></div>${headerHtml}
    <div class="stage-options">${q.options.map((o) => optionRow(o, { selected: sub && sub.choice === o.key })).join('')}</div>
    <p class="ds-muted ds-center" style="margin-top:14px">รอวิทยากรเฉลย…</p>`;
}
function revealedChoice(ctx, headerHtml) {
  const { container, q, sub } = ctx;
  const right = sub && sub.choice === q.correct;
  container.innerHTML = `<div class="q-head"><span class="ds-chip">เฉลย</span></div>${headerHtml}
    <div class="stage-options">${q.options.map((o) => optionRow(o, { correct: o.key === q.correct, wrong: sub && sub.choice === o.key && o.key !== q.correct, selected: sub && sub.choice === o.key })).join('')}</div>
    ${resultBanner(sub, right, q)}`;
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
  if (phase === 'question_open' && sub) return submittedBox(container, 'ส่งคำตอบเรียงการ์ดแล้ว');
  if (phase === 'locked') return dragReview(ctx, false);
  if (phase === 'revealed') return dragReview(ctx, true);

  const assign = {}; // cardId -> bucketKey
  let picked = null;
  container.innerHTML = `
    <div class="q-head"><span class="ds-chip ds-chip--live">ลากการ์ด (แตะ)</span><span class="ds-timer q-timer" id="qTimer">--:--</span></div>
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
    doSubmit(ctx, submit, () => ({ choice: assign, isCorrect }), () => submittedBox(container, 'ส่งคำตอบเรียงการ์ดแล้ว'));
  });
  startTimer(session, () => softLock(container, () => getSubmitted()[q.id]));
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
        <span class="review-row__ans">${reveal ? `${ok ? '✓' : '✕'} ${bucket ? bucket.labelTh : c.correct}` : (q.buckets.find((b) => b.key === mine)?.labelTh || '—')}</span></div>`;
    }).join('')}</div>
    ${reveal ? `<div class="ds-alert ${sub && q.cards.every((c) => assign[c.id] === c.correct) ? 'ds-alert--ok' : 'ds-alert--warn'}" style="margin-top:14px"><span>ℹ︎</span><div><span class="ds-muted">${q.explanation}</span></div></div>` : '<p class="ds-muted ds-center" style="margin-top:12px">รอวิทยากรเฉลย…</p>'}`;
}

/* =====================================================================
   ORDERING — tap steps to build a sequence
   ===================================================================== */
function renderOrdering(ctx) {
  const { container, session, q, sub } = ctx;
  const phase = session.phase;
  if (phase === 'question_open' && sub) return submittedBox(container, 'ส่งลำดับการตัดสินใจแล้ว');
  if (phase === 'locked') return orderReview(ctx, false);
  if (phase === 'revealed') return orderReview(ctx, true);

  const shuffled = [...q.steps].sort(() => Math.random() - 0.5);
  const order = [];
  container.innerHTML = `
    <div class="q-head"><span class="ds-chip ds-chip--live">เรียงลำดับ</span><span class="ds-timer q-timer" id="qTimer">--:--</span></div>
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
    doSubmit(ctx, submit, () => ({ choice: order, isCorrect }), () => submittedBox(container, 'ส่งลำดับการตัดสินใจแล้ว'));
  });
  startTimer(session, () => softLock(container, () => getSubmitted()[q.id]));
}
function orderReview(ctx, reveal) {
  const { container, q, sub } = ctx;
  const mine = (sub && Array.isArray(sub.choice)) ? sub.choice : [];
  const right = mine.length === q.correctOrder.length && mine.every((id, i) => id === q.correctOrder[i]);
  container.innerHTML = `<div class="q-head"><span class="ds-chip">${reveal ? 'เฉลย' : 'ล็อกแล้ว'}</span></div>
    <p class="q-situation">${q.scenario}</p>
    <div class="order-seq">${(reveal ? q.correctOrder : mine).map((id, i) => { const st = q.steps.find((s) => s.id === id); return `<div class="card-chip"><b>${i + 1}.</b> ${st ? st.text : id}</div>`; }).join('')}</div>
    ${reveal ? `<div class="ds-alert ${right ? 'ds-alert--ok' : 'ds-alert--warn'}" style="margin-top:14px"><span>${right ? '✓' : 'ℹ︎'}</span><div><strong>${right ? 'เรียงถูกต้อง! 🎉' : 'ลำดับที่ดีที่สุด (ด้านบน)'}</strong><br><span class="ds-muted">${q.explanation}</span></div></div>` : '<p class="ds-muted ds-center" style="margin-top:12px">รอวิทยากรเฉลย…</p>'}`;
}

/* =====================================================================
   ASSESSMENT — 0..3 scale per statement → Digital Habit Profile
   ===================================================================== */
function renderAssessment(ctx) {
  const { container, session, q, sub } = ctx;
  if (sub && typeof sub.choice === 'object') return assessmentResult(ctx, sub.choice);

  const answers = {};
  container.innerHTML = `
    <div class="q-head"><span class="ds-chip ds-chip--live">ประเมินตนเอง</span></div>
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
function balanceWord(b) { return b >= 70 ? 'สมดุลดีมาก 👍' : b >= 45 ? 'พอใช้ ปรับได้อีกนิด' : 'ลองปรับสมดุลการใช้ดิจิทัลดูนะ'; }
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
  try {
    await submitAnswer(ctx.stored, { questionId: q.id, missionId: q.missionId, choice, isCorrect, responseMs });
  } catch (_e) { /* offline → queued by persistence */ }
  markSubmitted(q.id, choice, isCorrect);
  onDone();
}
function submittedBox(container, line) {
  container.innerHTML = `<div class="ds-empty"><span class="ds-feat ds-feat--electric ds-ico--lg">${icon('reveal')}</span>
    <h3>ส่งคำตอบแล้ว ✓</h3><p>${line}</p><p class="ds-muted">รอเพื่อนๆ ตอบให้ครบ แล้ววิทยากรจะเฉลย</p></div>`;
}
function optionRow(o, st) {
  const cls = ['ds-option', st.selected ? 'is-selected' : '', st.correct ? 'is-correct' : '', st.wrong ? 'is-wrong' : ''].join(' ').replace(/\s+/g, ' ').trim();
  const mark = st.correct ? ' <span style="margin-left:auto;color:var(--success)">✓</span>' : (st.wrong ? ' <span style="margin-left:auto;color:var(--danger)">✕</span>' : '');
  return `<div class="${cls}" style="pointer-events:none"><span class="ds-option__key">${o.key}</span><span>${o.text}</span>${mark}</div>`;
}
function resultBanner(sub, right, q) {
  return `<div class="ds-alert ${right ? 'ds-alert--ok' : 'ds-alert--warn'}" style="margin-top:16px"><span>${right ? '✓' : 'ℹ︎'}</span>
    <div><strong>${sub ? (right ? 'ตอบถูก! 🎉' : 'ยังไม่ใช่คำตอบที่ดีที่สุด') : 'เฉลย'}</strong><br><span class="ds-muted">${q.explanation || ''}</span></div></div>
    ${sub ? `<p class="ds-muted ds-center" style="margin-top:12px">คำตอบที่ดีที่สุดคือ <b class="ds-pid">${q.correct}</b>${right ? ` · +${q.xp || 100} XP` : ''}</p>` : ''}`;
}
function notReady() {
  return `<div class="ds-empty"><span class="ds-feat ds-feat--electric ds-ico--lg">${icon('search')}</span><h3>เตรียมคำถาม…</h3><p>วิทยากรกำลังเปิดคำถาม รอสักครู่</p></div>`;
}
function softLock(container, isSubmitted) {
  if (isSubmitted()) return;
  const submit = container.querySelector('#qSubmit'); if (submit) submit.disabled = true;
  const hint = container.querySelector('#qHint'); if (hint) { hint.textContent = 'หมดเวลา — รอวิทยากรเฉลย'; hint.style.color = 'var(--danger)'; }
  container.querySelectorAll('.ds-option, .card-chip, .assess__opt, .bucket__drop').forEach((x) => (x.style.pointerEvents = 'none'));
}
function startTimer(session, onZero) {
  const start = numTime(session.questionStartAt);
  const dur = (session.questionDuration || 30) * 1000;
  let fired = false;
  const tick = () => {
    const left = Math.max(0, Math.ceil((start + dur - Date.now()) / 1000));
    const el = document.getElementById('qTimer');
    if (el) { const m = Math.floor(left / 60), s = left % 60; el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; el.classList.toggle('is-low', left <= 10); }
    if (left <= 0 && !fired) { fired = true; onZero && onZero(); if (timerIv) { clearInterval(timerIv); timerIv = null; } }
  };
  tick(); timerIv = setInterval(tick, 500);
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
