/* =================================================================
   Join flow (index.html) — DIGITAL SURVIVAL
   Opens a dialog: session code → nickname → (room) → create player →
   redirect to student.html. Minimal in Phase 3; polished in Phase 4.
   ================================================================= */
import { joinSession, getStoredPlayer } from './session.js';

const $ = (s, r = document) => r.querySelector(s);

function openJoin() {
  // Already joined? go straight in.
  const existing = getStoredPlayer();
  if (existing) { location.href = 'student.html'; return; }

  const back = document.createElement('div');
  back.className = 'ds-modal-backdrop';
  back.innerHTML = `
    <div class="ds-modal" role="dialog" aria-modal="true" aria-labelledby="joinTitle">
      <p class="ds-en" style="color:var(--cyan)">Join Mission</p>
      <h2 id="joinTitle">เข้าร่วมภารกิจ</h2>
      <p class="ds-muted" style="font-size:.9rem">กรอกรหัสห้องจากวิทยากร แล้วตั้งชื่อเล่นของคุณ</p>

      <div class="ds-form-row">
        <label class="ds-label" for="jCode">รหัสห้อง <span class="ds-en">session code</span></label>
        <input id="jCode" class="ds-input ds-input--code" maxlength="6" autocomplete="off"
               autocapitalize="characters" inputmode="latin" placeholder="ABCDE">
      </div>
      <div class="ds-form-row">
        <label class="ds-label" for="jNick">ชื่อเล่น <span class="ds-en">nickname</span></label>
        <input id="jNick" class="ds-input" maxlength="16" autocomplete="off" placeholder="เช่น Tiger">
      </div>
      <div class="ds-form-row">
        <label class="ds-label" for="jRoom">ห้อง/ชั้น <span class="ds-en">room · optional</span></label>
        <input id="jRoom" class="ds-input" maxlength="12" autocomplete="off" placeholder="เช่น ม.6/2">
      </div>

      <div class="ds-form-err" id="jErr" hidden></div>

      <div class="ds-row" style="margin-top:22px; gap:10px">
        <button class="ds-btn ds-btn--ghost" id="jCancel" type="button" style="flex:1">ยกเลิก</button>
        <button class="ds-btn ds-btn--primary" id="jGo" type="button" style="flex:2">
          <span data-icon="play"></span> เข้าร่วม
        </button>
      </div>
    </div>`;
  document.body.appendChild(back);

  // hydrate the play icon inside the freshly-added modal
  import('./icons.js').then(({ hydrateIcons }) => hydrateIcons(back));

  const code = $('#jCode', back), nick = $('#jNick', back), room = $('#jRoom', back);
  const err = $('#jErr', back), go = $('#jGo', back);
  // Pre-fill the code when arriving via a QR link (index.html?code=XXXXX)
  const prefill = new URLSearchParams(location.search).get('code');
  if (prefill) { code.value = prefill.toUpperCase(); nick.focus(); } else { code.focus(); }
  const close = () => back.remove();
  $('#jCancel', back).addEventListener('click', close);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown', esc);} });

  async function submit() {
    err.hidden = true;
    go.disabled = true; go.textContent = 'กำลังเข้าร่วม…';
    try {
      await joinSession(code.value, nick.value, room.value);
      location.href = 'student.html';
    } catch (e) {
      err.hidden = false; err.textContent = e.message || 'เข้าร่วมไม่สำเร็จ';
      go.disabled = false; go.innerHTML = '<span></span> เข้าร่วม';
      import('./icons.js').then(({ hydrateIcons }) => { go.firstElementChild.dataset.icon='play'; hydrateIcons(go); });
    }
  }
  go.addEventListener('click', submit);
  [code, nick, room].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('enterBtn');
  if (btn) btn.addEventListener('click', openJoin);
  // Scanned a QR with ?code= → open the join dialog automatically.
  if (new URLSearchParams(location.search).get('code') && !getStoredPlayer()) openJoin();
});
