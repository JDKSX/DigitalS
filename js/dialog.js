/* =================================================================
   Dialogs & toasts — JDKS ARENA
   The browser's own alert/confirm/prompt are grey system boxes that
   break the theme, can't be styled, and block the page. Everything in
   the platform uses these instead:

     if (await dxConfirm({ title, message, danger: true })) …
     await dxAlert({ title, message, kind: 'error' });
     const name = await dxPrompt({ title, label, value });
     toast('บันทึกแล้ว');

   All three return promises and resolve to a sane value when dismissed.
   ================================================================= */
import { icon } from './icons.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ART = { info: 'sparkles', question: 'question', danger: 'alert', error: 'alert', success: 'check', warn: 'alert' };

/** Shared shell. `build` fills the body; `wire` gets ({ root, close }). */
function open({ kind = 'info', title = '', message = '', body = '', actions = '', wire }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'dx-back';
    back.innerHTML = `
      <div class="dx dx--${kind}" role="dialog" aria-modal="true" aria-labelledby="dxTitle">
        <div class="dx__top">
          <span class="dx__ic">${icon(ART[kind] || 'sparkles')}</span>
          <div>
            <h2 class="dx__title" id="dxTitle">${esc(title)}</h2>
            ${message ? `<p class="dx__msg">${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
          </div>
        </div>
        ${body}
        <div class="dx__acts">${actions}</div>
      </div>`;
    document.body.appendChild(back);
    document.body.classList.add('dx-open');

    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      back.classList.add('is-out');
      document.body.classList.remove('dx-open');
      setTimeout(() => back.remove(), 120);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        const go = back.querySelector('[data-dx="ok"]');
        if (go) { e.preventDefault(); go.click(); }
      }
    }
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    wire({ root: back, close });
  });
}

/** Yes / no. Resolves true only when the user confirms. */
export function dxConfirm({ title, message = '', ok = 'ตกลง', cancel = 'ยกเลิก', danger = false } = {}) {
  return open({
    kind: danger ? 'danger' : 'question', title, message,
    actions: `<button class="ds-btn ds-btn--ghost" data-dx="no" type="button">${esc(cancel)}</button>
              <button class="ds-btn ${danger ? 'ds-btn--danger' : 'ds-btn--primary'}" data-dx="ok" type="button">${esc(ok)}</button>`,
    wire: ({ root, close }) => {
      root.querySelector('[data-dx="no"]').addEventListener('click', () => close(false));
      root.querySelector('[data-dx="ok"]').addEventListener('click', () => close(true));
      root.querySelector('[data-dx="ok"]').focus();
    },
  }).then((v) => v === true);
}

/** A message with a single button. */
export function dxAlert({ title, message = '', ok = 'เข้าใจแล้ว', kind = 'info' } = {}) {
  return open({
    kind, title, message,
    actions: `<button class="ds-btn ds-btn--primary" data-dx="ok" type="button">${esc(ok)}</button>`,
    wire: ({ root, close }) => {
      const b = root.querySelector('[data-dx="ok"]');
      b.addEventListener('click', () => close(true));
      b.focus();
    },
  }).then(() => undefined);
}

/** One text field. Resolves the trimmed value, or null if cancelled. */
export function dxPrompt({ title, message = '', label = '', value = '', placeholder = '',
  ok = 'บันทึก', cancel = 'ยกเลิก', required = false, maxlength = 120 } = {}) {
  return open({
    kind: 'question', title, message,
    body: `<div class="dx__field">
        ${label ? `<label class="ds-label" for="dxInput">${esc(label)}</label>` : ''}
        <input id="dxInput" class="ds-input" maxlength="${maxlength}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">
        <p class="dx__err" hidden>กรุณากรอกข้อมูลก่อน</p>
      </div>`,
    actions: `<button class="ds-btn ds-btn--ghost" data-dx="no" type="button">${esc(cancel)}</button>
              <button class="ds-btn ds-btn--primary" data-dx="ok" type="button">${esc(ok)}</button>`,
    wire: ({ root, close }) => {
      const input = root.querySelector('#dxInput');
      const err = root.querySelector('.dx__err');
      root.querySelector('[data-dx="no"]').addEventListener('click', () => close(null));
      root.querySelector('[data-dx="ok"]').addEventListener('click', () => {
        const v = input.value.trim();
        if (required && !v) { err.hidden = false; input.focus(); return; }
        close(v);
      });
      input.addEventListener('input', () => { err.hidden = true; });
      setTimeout(() => { input.focus(); input.select(); }, 30);
    },
  });
}

/* ---------------- toasts ---------------- */
let toastEl = null, toastTimer = null;
/** A short status line. kind: info | success | error */
export function toast(msg, kind = 'info') {
  if (!toastEl || !toastEl.isConnected) {
    toastEl = document.createElement('div');
    document.body.appendChild(toastEl);
  }
  toastEl.className = `dx-toast is-${kind}`;
  toastEl.innerHTML = `<span class="dx-toast__ic">${icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'sparkles')}</span>
    <span class="dx-toast__t">${esc(msg)}</span>
    <button type="button" aria-label="ปิด">${icon('close')}</button>`;
  const el = toastEl;
  el.querySelector('button').addEventListener('click', () => el.remove());
  clearTimeout(toastTimer);
  if (kind !== 'error') toastTimer = setTimeout(() => el.remove(), 3400);
}
