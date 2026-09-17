/* =================================================================
   Question forms — JDKS ARENA
   A self-contained, reusable editor for one pack's questions. It owns
   no globals: hand it a mount element, the pack's missions and its
   questions object, and it edits that object in place.

   Supports all five question types: scenario · investigation ·
   dragsort · ordering · assessment.
   ================================================================= */

import { dxConfirm } from './dialog.js';
import { icon } from './icons.js';

const escA = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escT = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function setPath(o, path, val) {
  const ks = path.split('.'); let c = o;
  for (let i = 0; i < ks.length - 1; i++) { if (c[ks[i]] == null) c[ks[i]] = {}; c = c[ks[i]]; }
  c[ks[ks.length - 1]] = val;
}

const lbl  = (t) => `<label class="qf-label">${t}</label>`;
const area = (id, path, v) => `<textarea class="qf-area" data-qid="${id}" data-path="${path}">${escT(v)}</textarea>`;
const inp  = (id, path, v, extra = '') => `<input class="qf-in" data-qid="${id}" data-path="${path}" value="${escA(v)}" ${extra}>`;

/* ---------------- per-type forms ---------------- */
function scenarioForm(id, q) {
  return `${lbl('สถานการณ์ / คำถาม')}${area(id, 'situation', q.situation || q.q_prompt || '')}
    ${lbl('ตัวเลือก — วงกลมหน้าข้อ = คำตอบที่ถูก')}
    <div class="qf-opts">${(q.options || []).map((o, i) => `<div class="qf-opt">
      <input type="radio" name="c-${id}" value="${escA(o.key)}" data-qid="${id}" data-path="correct" ${q.correct === o.key ? 'checked' : ''} title="ตั้งเป็นข้อที่ถูก">
      <span class="qf-key">${escA(o.key)}</span>${inp(id, `options.${i}.text`, o.text)}
      <button class="qf-x" data-delopt="${id}:${i}" type="button" title="ลบ">${icon('close')}</button></div>`).join('')}</div>
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
    ${lbl('คำอธิบายเฉลย')}${area(id, 'explanation', q.explanation)}
    ${lbl('คะแนน XP')}<input class="qf-in qf-num" type="number" data-qid="${id}" data-path="xp" data-num="1" value="${q.xp || 150}">`;
}
function dragsortForm(id, q) {
  const buckets = q.buckets || [];
  return `${lbl('คำสั่ง')}${area(id, 'prompt', q.prompt)}
    ${lbl('ชื่อกล่อง')}${buckets.map((b, i) => `<div class="qf-opt"><span class="qf-key">${i + 1}</span>${inp(id, `buckets.${i}.labelTh`, b.labelTh || b.label || b.key)}</div>`).join('')}
    ${lbl('การ์ด — เลือกกล่องที่ถูกต้อง')}${(q.cards || []).map((c, i) => `<div class="qf-opt">${inp(id, `cards.${i}.text`, c.text)}<select class="qf-sel" data-qid="${id}" data-path="cards.${i}.correct">${buckets.map((b) => `<option value="${escA(b.key)}" ${c.correct === b.key ? 'selected' : ''}>${escA(b.labelTh || b.label || b.key)}</option>`).join('')}</select><button class="qf-x" data-delcard="${id}:${i}" type="button" title="ลบ">${icon('close')}</button></div>`).join('')}
    <button class="qf-addbtn" data-addcard="${id}" type="button">+ เพิ่มการ์ด</button>
    ${lbl('คำอธิบายเฉลย')}${area(id, 'explanation', q.explanation)}
    ${lbl('คะแนน XP')}<input class="qf-in qf-num" type="number" data-qid="${id}" data-path="xp" data-num="1" value="${q.xp || 150}">`;
}
function orderingForm(id, q) {
  return `${lbl('สถานการณ์')}${area(id, 'scenario', q.scenario)}
    ${lbl('ขั้นตอน (บนลงล่าง = ลำดับที่ถูก)')}${(q.correctOrder || []).map((sid, idx) => {
      const si = (q.steps || []).findIndex((s) => s.id === sid); const st = (q.steps || [])[si];
      return `<div class="qf-opt"><span class="qf-key">${idx + 1}</span>${inp(id, `steps.${si}.text`, st ? st.text : '')}
        <button class="qf-x" data-upstep="${id}:${idx}" type="button" title="เลื่อนขึ้น" ${idx === 0 ? 'disabled' : ''}>▲</button></div>`;
    }).join('')}
    <button class="qf-addbtn" data-addstep="${id}" type="button">+ เพิ่มขั้นตอน</button>
    ${lbl('คำอธิบายเฉลย')}${area(id, 'explanation', q.explanation)}
    ${lbl('คะแนน XP')}<input class="qf-in qf-num" type="number" data-qid="${id}" data-path="xp" data-num="1" value="${q.xp || 300}">`;
}
function assessmentForm(id, q) {
  const dims = q.dimensions || {}; const keys = Object.keys(dims);
  return `${lbl('คำนำ')}${area(id, 'prompt', q.prompt)}
    ${lbl('ข้อความประเมิน (เลือกด้าน)')}${(q.statements || []).map((s, i) => `<div class="qf-opt">${inp(id, `statements.${i}.text`, s.text)}<select class="qf-sel" data-qid="${id}" data-path="statements.${i}.dimension">${keys.map((k) => `<option value="${k}" ${s.dimension === k ? 'selected' : ''}>${escA(dims[k])}</option>`).join('')}</select><button class="qf-x" data-delstate="${id}:${i}" type="button" title="ลบ">${icon('close')}</button></div>`).join('')}
    <button class="qf-addbtn" data-addstate="${id}" type="button">+ เพิ่มข้อความ</button>
    ${lbl('คำอธิบาย')}${area(id, 'explanation', q.explanation)}
    ${lbl('คะแนน XP')}<input class="qf-in qf-num" type="number" data-qid="${id}" data-path="xp" data-num="1" value="${q.xp || 200}">`;
}
const FORMS = { scenario: scenarioForm, investigation: investigationForm, dragsort: dragsortForm, ordering: orderingForm, assessment: assessmentForm };

/** Blank question of a given type. */
export function blankQuestion(type, id, missionId) {
  const tpl = {
    scenario: { situation: '', options: [{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }], correct: 'A', explanation: '', xp: 100 },
    investigation: { headline: '', source: '', date: '', quote: '', evidence: [{ label: 'หลักฐาน A', text: '' }], question: 'ข่าวนี้น่าเชื่อถือหรือไม่?', options: [{ key: 'TRUE', text: 'จริง' }, { key: 'FALSE', text: 'ปลอม' }, { key: 'UNSURE', text: 'หลักฐานไม่พอ' }], correct: 'FALSE', explanation: '', xp: 150 },
    dragsort: { prompt: '', buckets: [{ key: 'a', label: 'A', labelTh: 'กลุ่ม A' }, { key: 'b', label: 'B', labelTh: 'กลุ่ม B' }], cards: [{ id: 'c1', text: '', correct: 'a' }], explanation: '', xp: 150 },
    ordering: { scenario: '', steps: [{ id: 's1', text: '' }, { id: 's2', text: '' }], correctOrder: ['s1', 's2'], explanation: '', xp: 300 },
    assessment: { prompt: '', scale: [{ v: 0, label: 'ไม่เคย' }, { v: 1, label: 'บางครั้ง' }, { v: 2, label: 'บ่อย' }, { v: 3, label: 'เกือบทุกวัน' }], dimensions: { focus: 'สมาธิ', wellbeing: 'สุขภาวะ' }, statements: [{ id: 's1', text: '', dimension: 'focus' }], explanation: '', xp: 200 },
  }[type] || {};
  return { id, missionId, type, ...JSON.parse(JSON.stringify(tpl)) };
}

/* =================================================================
   createQuestionEditor({ mount, missions, questions, onDirty })
   Edits `questions` IN PLACE. onDirty() fires whenever content changes.
   ================================================================= */
export function createQuestionEditor({ mount, missions = [], questions = {}, onDirty = () => {}, only = null }) {
  let model = questions;
  // `only` pins this editor to a single mission: the questions then live inside
  // that mission's own card, which is where a teacher looks for them.
  let missionId = only || (missions[0] || {}).id || null;

  const idsFor = (mid) => { const out = []; let n = 1; while (model[`${mid}_q${n}`]) { out.push(`${mid}_q${n}`); n++; } return out; };
  const typeOf = (mid) => { const m = missions.find((x) => x.id === mid); return (m && m.type) || 'scenario'; };

  function shell() {
    if (!missions.length) {
      mount.innerHTML = `<p class="ds-muted ds-center" style="padding:18px 0">ยังไม่มีภารกิจ — เพิ่มภารกิจก่อน แล้วค่อยใส่คำถาม</p>`;
      return;
    }
    mount.innerHTML = `
      ${only ? '' : `<label class="qf-label">ภารกิจที่กำลังแก้</label>
         <select id="qfMission" class="ds-input">${missions.map((m) => `<option value="${escA(m.id)}" ${m.id === missionId ? 'selected' : ''}>${escA(m.titleTh || m.id)} (${escA(m.type || 'scenario')})</option>`).join('')}</select>`}
      <div id="qfList"></div>
      <button class="ds-btn ds-btn--ghost ds-btn--block qf-add" id="qfAdd">${icon('plus')} เพิ่มคำถามในภารกิจนี้</button>`;
    const sel = mount.querySelector('#qfMission');
    if (sel) sel.addEventListener('change', (e) => { missionId = e.target.value; list(); });
    mount.querySelector('#qfAdd').addEventListener('click', addQuestion);
    const l = mount.querySelector('#qfList');
    l.addEventListener('input', onField);
    l.addEventListener('change', onField);
    l.addEventListener('click', onClick);
    list();
  }

  function list() {
    const l = mount.querySelector('#qfList'); if (!l) return;
    const ids = idsFor(missionId);
    l.innerHTML = ids.length
      ? ids.map((id, i) => {
          const q = model[id];
          return `<div class="qcard"><div class="qc-head"><b>ข้อ ${i + 1}</b> <span class="ds-chip">${escA(q.type)}</span>
            <button class="qc-del" data-delq="${id}" type="button">${icon('trash')} ลบข้อนี้</button></div>${(FORMS[q.type] || scenarioForm)(id, q)}</div>`;
        }).join('')
      : '<p class="ds-muted ds-center" style="padding:14px 0">ยังไม่มีคำถาม — กด “เพิ่มคำถาม” ด้านล่าง</p>';
  }

  function onField(e) {
    const el = e.target; const qid = el.dataset.qid, path = el.dataset.path;
    if (!qid || path == null || !model[qid]) return;
    let v = el.value; if (el.dataset.num) v = Number(v) || 0;
    setPath(model[qid], path, v);
    onDirty();
  }

  async function onClick(e) {
    const t = (name) => e.target.closest(`[data-${name}]`);
    const add = t('addopt'), del = t('delopt'), dq = t('delq');
    const addCard = t('addcard'), delCard = t('delcard');
    const addStep = t('addstep'), upStep = t('upstep');
    const addState = t('addstate'), delState = t('delstate');

    if (add) {
      const q = model[add.dataset.addopt]; const used = (q.options || []).map((o) => o.key);
      const key = 'ABCDEFGH'.split('').find((k) => !used.includes(k)) || String(used.length + 1);
      q.options.push({ key, text: '' });
    } else if (del) {
      const [qid, i] = del.dataset.delopt.split(':'); const q = model[qid];
      const removed = q.options[+i]; q.options.splice(+i, 1);
      if (q.correct === removed.key) q.correct = (q.options[0] || {}).key || '';
    } else if (dq) {
      if (!await dxConfirm({ title: 'ลบคำถามนี้?', message: 'ลบแล้วกู้คืนไม่ได้', ok: 'ลบคำถาม', cancel: 'ยกเลิก', danger: true })) return;
      renumberDelete(dq.dataset.delq);
    } else if (addCard) {
      const q = model[addCard.dataset.addcard];
      q.cards.push({ id: 'c' + (q.cards.length + 1), text: '', correct: (q.buckets[0] || {}).key || 'a' });
    } else if (delCard) {
      const [qid, i] = delCard.dataset.delcard.split(':'); model[qid].cards.splice(+i, 1);
    } else if (addStep) {
      const q = model[addStep.dataset.addstep];
      const sid = 's' + (q.steps.length + 1);
      q.steps.push({ id: sid, text: '' }); q.correctOrder.push(sid);
    } else if (upStep) {
      const [qid, idx] = upStep.dataset.upstep.split(':'); const q = model[qid]; const i = +idx;
      if (i > 0) { const o = q.correctOrder; [o[i - 1], o[i]] = [o[i], o[i - 1]]; }
    } else if (addState) {
      const q = model[addState.dataset.addstate];
      const dims = Object.keys(q.dimensions || { focus: 'สมาธิ' });
      q.statements.push({ id: 's' + (q.statements.length + 1), text: '', dimension: dims[0] });
    } else if (delState) {
      const [qid, i] = delState.dataset.delstate.split(':'); model[qid].statements.splice(+i, 1);
    } else return;

    onDirty(); list();
  }

  function addQuestion() {
    const n = idsFor(missionId).length + 1;
    const id = `${missionId}_q${n}`;
    model[id] = blankQuestion(typeOf(missionId), id, missionId);
    onDirty(); list();
    const l = mount.querySelector('#qfList');
    if (l && l.lastElementChild) l.lastElementChild.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /** Delete then renumber so ids stay <mission>_q1..N with no gaps. */
  function renumberDelete(delId) {
    const ids = idsFor(missionId);
    delete model[delId];
    const remaining = ids.filter((x) => x !== delId).map((x) => model[x]);
    ids.forEach((x) => delete model[x]);
    remaining.forEach((q, i) => { const nid = `${missionId}_q${i + 1}`; q.id = nid; model[nid] = q; });
  }

  shell();

  return {
    getQuestions: () => model,
    setData(nextMissions, nextQuestions) {
      missions = nextMissions || [];
      model = nextQuestions || {};
      if (only) missionId = only;
      else if (!missions.find((m) => m.id === missionId)) missionId = (missions[0] || {}).id || null;
      shell();
    },
    selectMission(id) { missionId = id; shell(); },
    countFor: (mid) => idsFor(mid).length,
  };
}
