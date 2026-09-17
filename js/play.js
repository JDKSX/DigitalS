/* =================================================================
   Solo play (play.html) — JDKS ARENA
   "อยากลองเล่นก่อน ไม่ต้องสมัคร": any published pack can be played by
   one person, at their own pace, with no host and no room. Nothing is
   written to the database — anonymous auth is used only to READ the
   public pack, and the score lives in memory for this sitting.

   The five question types are rendered by the very same engine the live
   classroom game uses (js/game.js), driven here by a local phase machine.
   ================================================================= */
import { ensureStudentAuth } from './auth.js';
import { loadPack, loadGame, levelForXp } from './content.js';
import { renderGame, resetSolo } from './game.js';
import { xpForAnswer } from './scoring.js';
import { mascot, hydrateMascots } from './mascot.js';
import { hydrateIcons, icon } from './icons.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n || 0).toLocaleString('en-US');

const PACK_ID = new URLSearchParams(location.search).get('pack');
const LIMIT_S = 45;                       // seconds per question in solo mode

const state = {
  content: null, questions: {}, list: [], i: -1,
  xp: 0, correct: 0, answered: 0, startedMission: null,
};

/* ---------------- boot ---------------- */
(async function main() {
  if (!PACK_ID) return oops('ไม่พบเกม', 'เปิดหน้านี้จากคลังเกมเพื่อเลือกเกมที่อยากเล่น');
  try { await ensureStudentAuth(); } catch (_e) { /* the demo pack needs no sign-in */ }

  let bundle;
  if (PACK_ID === 'demo') {
    // The bundled Digital Literacy game: always playable, no database needed,
    // so there is something to try even before any teacher has published.
    bundle = await loadGame(null);
  } else {
    try { bundle = await loadPack(PACK_ID); }
    catch (e) {
      return oops('เปิดเกมนี้ไม่ได้',
        (e && e.code === 'permission-denied')
          ? 'ชุดนี้ไม่ได้เปิดเผยแพร่ไว้ หรือสิทธิ์ยังไม่ถูกตั้งค่า — ลองเลือกเกมอื่นในคลัง'
          : ((e && e.message) || 'ชุดนี้อาจถูกปิดเผยแพร่หรือถูกลบไปแล้ว'));
    }
  }

  state.content = bundle.content;
  state.questions = bundle.questions;
  state.list = playlist(bundle.content, bundle.questions);
  resetSolo();

  const nm = $('#packName'); if (nm) nm.textContent = bundle.content.title || 'เล่นเดี่ยว';
  document.title = `${bundle.content.title || 'เล่นเดี่ยว'} · JDKS Arena`;

  if (!state.list.length) return oops('เกมนี้ยังไม่มีคำถาม', 'ครูผู้สร้างอาจยังเพิ่มคำถามไม่เสร็จ');
  intro();
})();

/** Missions in order, questions inside them in <mission>_q<n> order. */
function playlist(content, questions) {
  const out = []; const used = new Set();
  (content.missions || []).forEach((m) => {
    let n = 1;
    while (questions[`${m.id}_q${n}`]) { out.push({ m, q: questions[`${m.id}_q${n}`] }); used.add(`${m.id}_q${n}`); n++; }
    Object.keys(questions).forEach((k) => {
      if (!used.has(k) && questions[k].missionId === m.id) { out.push({ m, q: questions[k] }); used.add(k); }
    });
  });
  Object.keys(questions).forEach((k) => { if (!used.has(k)) { out.push({ m: null, q: questions[k] }); used.add(k); } });
  return out;
}

/* ---------------- screens ---------------- */
function stage() { return $('#stage'); }
function paintHud() {
  $('#xpChip').textContent = `${fmt(state.xp)} XP`;
  const pct = state.list.length ? Math.round((Math.max(0, state.i) / state.list.length) * 100) : 0;
  $('#bar').style.width = `${pct}%`;
}

function intro() {
  const c = state.content;
  stage().innerHTML = `<div class="jx-solo-intro">
    ${mascot('rocket', { size: 150 })}
    <p class="jx-eyebrow">เล่นเดี่ยว · ไม่ต้องสมัคร</p>
    <h1 class="jx-solo-intro__h1">${esc(c.title || 'เกมตอบคำถาม')}</h1>
    ${c.subject ? `<p class="jx-pack__subject" style="font-size:1rem">${esc(c.subject)}</p>` : ''}
    <div class="jx-solo-facts">
      <div><b>${(c.missions || []).length}</b><span>ภารกิจ</span></div>
      <div><b>${state.list.length}</b><span>คำถาม</span></div>
      <div><b>${LIMIT_S}</b><span>วินาที/ข้อ</span></div>
    </div>
    <p class="ds-muted" style="max-width:44ch;margin:16px auto 0">
      ตอบถูกได้คะแนน · ยิ่งตอบเร็วยิ่งได้เยอะ — คะแนนนี้เก็บไว้แค่ในเครื่องคุณรอบนี้เท่านั้น</p>
    <button class="ds-btn ds-btn--primary ds-btn--block" id="go" style="margin-top:22px;max-width:360px">${icon('play')} เริ่มเล่น</button>
    <a class="jx-linkbtn" href="community.html" style="display:inline-block;margin-top:14px">เลือกเกมอื่น</a>
  </div>`;
  $('#go').addEventListener('click', () => next());
  paintHud();
}

function next() {
  state.i++;
  if (state.i >= state.list.length) return finish();
  const item = state.list[state.i];
  // A new mission gets its own title card first.
  if (item.m && item.m.id !== state.startedMission) {
    state.startedMission = item.m.id;
    return missionCard(item.m);
  }
  ask();
}

function missionCard(m) {
  stage().innerHTML = `<div class="jx-solo-intro">
    ${mascot('book', { size: 130 })}
    <p class="jx-eyebrow">ภารกิจ ${String(m.no || '').padStart(2, '0')}</p>
    <h2 class="jx-solo-intro__h1" style="font-size:clamp(1.4rem,4vw,2rem)">${esc(m.titleTh || m.title || '')}</h2>
    ${m.topicTh ? `<span class="jx-chip">${esc(m.topicTh)}</span>` : ''}
    <p class="ds-muted" style="max-width:46ch;margin:14px auto 0">${esc(m.intro || '')}</p>
    <button class="ds-btn ds-btn--primary" id="go" style="margin-top:22px">เริ่มภารกิจนี้</button>
  </div>`;
  $('#go').addEventListener('click', ask);
  hydrateMascots(stage());
  paintHud();
}

function ask() {
  const { q } = state.list[state.i];
  state.askedAt = Date.now();
  renderGame(ctxFor(q, 'question_open'));
  hydrateIcons(stage());
  paintHud();
}

/** Context handed to the shared engine. solo:true keeps it off the network. */
function ctxFor(q, phase) {
  return {
    container: stage(),
    solo: true,
    session: {
      status: 'open', phase,
      currentQuestion: q.id, currentMission: q.missionId,
      questionDuration: LIMIT_S, questionStartAt: state.askedAt || Date.now(),
      showAnswer: true, showResults: false,
    },
    questions: state.questions,
    content: state.content,
    stored: null, player: null, leaderboard: [],
    showAnswer: true, showResults: false,
    onAnswer: (res) => grade(q, res),
    // ran out of time without answering → show the answer and move on
    onTimeout: () => { state.answered++; reveal(q); },
  };
}

function grade(q, res) {
  const rules = (state.content && state.content.xpRules) || {};
  const gained = xpForAnswer(q, { isCorrect: res.isCorrect, responseMs: res.responseMs }, rules, LIMIT_S * 1000);
  state.xp += gained;
  state.answered++;
  if (res.isCorrect) state.correct++;
  reveal(q);
}

function reveal(q) {
  renderGame(ctxFor(q, 'revealed'));
  hydrateIcons(stage());
  paintHud();

  const last = state.i >= state.list.length - 1;
  const bar = document.createElement('div');
  bar.className = 'jx-solo-next';
  bar.innerHTML = `<button class="ds-btn ds-btn--primary ds-btn--block" id="nx">
    ${last ? `${icon('flag')} ดูผลรวม` : `ข้อถัดไป ${icon('next')}`}</button>`;
  stage().appendChild(bar);
  bar.querySelector('#nx').addEventListener('click', () => { state.askedAt = Date.now(); next(); });
}

/* ---------------- the end ---------------- */
function finish() {
  $('#bar').style.width = '100%';
  const lv = levelForXp(state.content.levels || [], state.xp);
  const pct = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
  const art = pct >= 80 ? 'trophy' : pct >= 50 ? 'medal' : 'brain';
  stage().innerHTML = `<div class="jx-solo-intro">
    ${mascot(art, { size: 170 })}
    <p class="jx-eyebrow">จบเกมแล้ว</p>
    <h1 class="jx-solo-intro__h1">${fmt(state.xp)} XP</h1>
    <p class="ds-muted">ตอบถูก ${state.correct} จาก ${state.answered} ข้อ (${pct}%)${lv ? ` · ระดับ <b style="color:var(--level)">${esc(lv.nameTh || lv.name)}</b>` : ''}</p>
    <div class="jx-solo-facts" style="margin-top:20px">
      <div><b>${fmt(state.xp)}</b><span>คะแนนรวม</span></div>
      <div><b>${state.correct}/${state.answered}</b><span>ตอบถูก</span></div>
      <div><b>${pct}%</b><span>ความแม่นยำ</span></div>
    </div>
    <div class="jx-hero__cta">
      <button class="ds-btn ds-btn--primary" id="again">เล่นอีกครั้ง</button>
      <a class="ds-btn ds-btn--ghost" href="community.html">เลือกเกมอื่น</a>
    </div>
    <div class="jx-solo-cta">
      <span data-mascot="owl" data-size="76"></span>
      <div>
        <b>อยากเปิดให้ทั้งห้องเล่นพร้อมกันไหม?</b>
        <span>สมัครบัญชีครูฟรี แล้วเปิดห้องให้นักเรียนเข้าด้วยรหัส 5 ตัว — หรือสร้างชุดคำถามของวิชาคุณเอง</span>
        <a class="ds-btn ds-btn--cyan" href="login.html?mode=signup&amp;next=teacher.html" style="margin-top:12px">สมัครใช้งานฟรี</a>
      </div>
    </div>
  </div>`;
  hydrateMascots(stage());
  $('#again').addEventListener('click', () => {
    resetSolo();
    Object.assign(state, { i: -1, xp: 0, correct: 0, answered: 0, startedMission: null, askedAt: Date.now() });
    paintHud(); next();
  });
  paintHud();
}

function oops(title, sub) {
  stage().innerHTML = `<div class="jx-solo-intro">${mascot('clock', { size: 130 })}
    <h2 class="jx-solo-intro__h1" style="font-size:1.5rem">${esc(title)}</h2>
    <p class="ds-muted">${esc(sub)}</p>
    <a class="ds-btn ds-btn--primary" href="community.html" style="margin-top:20px">ไปที่คลังเกม</a></div>`;
}
