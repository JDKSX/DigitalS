/* =================================================================
   JDKS ARENA — shared top bar
   One header for every platform page. Renders the logo, the main nav
   and the account zone, and keeps the account zone in sync with the
   Firebase auth state (visitor → "เข้าสู่ระบบ / สมัครฟรี", teacher →
   avatar menu). Pages only need:

     <header class="jx-top" data-topbar data-tag="แผงของฉัน"
             data-active="teacher"></header>
     <script type="module" src="js/topbar.js"></script>
   ================================================================= */
import { onAuth, getTeacher, signOutUser } from './auth.js';
import { initChrome } from './ui.js';
import { icon } from './icons.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NAV = [
  { key: 'home',      href: 'index.html',     label: 'หน้าแรก' },
  { key: 'community', href: 'community.html', label: 'คลังเกม' },
  { key: 'guide',     href: 'guide.html',     label: 'คู่มือ' },
];

/** Where to come back to after signing in. */
export function loginUrl(mode = 'login', next = '') {
  const back = next || (location.pathname.split('/').pop() || 'index.html') + location.search;
  const p = new URLSearchParams();
  if (mode && mode !== 'login') p.set('mode', mode);
  if (back && !/^login\.html/.test(back)) p.set('next', back);
  const qs = p.toString();
  return 'login.html' + (qs ? '?' + qs : '');
}

function shell(host) {
  const active = host.dataset.active || '';
  const tag = host.dataset.tag || 'สนามแข่งแห่งการเรียนรู้';
  host.innerHTML = `
    <a class="jx-logo" href="index.html">
      <span class="jx-logo__mark">JA</span>
      <span class="jx-logo__name">JDKS <b>Arena</b><span class="jx-logo__tag">${esc(tag)}</span></span>
    </a>
    <nav class="jx-nav" aria-label="เมนูหลัก">
      ${NAV.map((n) => `<a href="${n.href}" class="${n.key === active ? 'is-on' : ''}">${n.label}</a>`).join('')}
    </nav>
    <div class="jx-top__spacer"></div>
    <button class="ds-iconbtn" data-role="theme-toggle" type="button" aria-label="สลับธีมสว่าง/มืด" title="สลับธีม">
      <span class="icon-sun" data-icon="sun"></span><span class="icon-moon" data-icon="moon"></span>
    </button>
    <div class="jx-acct" id="jxAcct"></div>`;
}

function paintVisitor(zone) {
  zone.innerHTML = `
    <a class="ds-btn ds-btn--ghost jx-hide-sm" href="${loginUrl('login')}">เข้าสู่ระบบ</a>
    <a class="ds-btn ds-btn--primary" href="${loginUrl('signup')}">สมัครฟรี</a>`;
}

function paintTeacher(zone, name, sub) {
  const initial = (name[0] || '?').toUpperCase();
  zone.innerHTML = `
    <div class="jx-menu-wrap">
      <button class="jx-userbtn" id="jxUserBtn" type="button" aria-haspopup="menu" aria-expanded="false">
        <span class="jx-user__av">${esc(initial)}</span>
        <span class="jx-hide-sm">
          <span class="jx-user__name">${esc(name)}</span>
          <span class="jx-user__org">${esc(sub)}</span>
        </span>
        <span class="jx-caret" aria-hidden="true">▾</span>
      </button>
      <div class="jx-menu" id="jxMenu" role="menu" hidden>
        <a role="menuitem" href="teacher.html">${icon('room')} แผงของฉัน</a>
        <a role="menuitem" href="community.html">${icon('globe')} คลังเกมสาธารณะ</a>
        <a role="menuitem" href="guide.html">${icon('book')} คู่มือการใช้งาน</a>
        <button role="menuitem" type="button" id="jxSignOut">${icon('leave')} ออกจากระบบ</button>
      </div>
    </div>`;

  const btn = zone.querySelector('#jxUserBtn');
  const menu = zone.querySelector('#jxMenu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  // Bound once for the page: paintTeacher() can run again on every auth change.
  if (!document.body.dataset.jxMenuWired) {
    document.body.dataset.jxMenuWired = '1';
    document.addEventListener('click', () => {
      const m = document.getElementById('jxMenu'); const b = document.getElementById('jxUserBtn');
      if (m) m.hidden = true; if (b) b.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const m = document.getElementById('jxMenu'); const b = document.getElementById('jxUserBtn');
      if (m) m.hidden = true; if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  zone.querySelector('#jxSignOut').addEventListener('click', async () => {
    try { localStorage.removeItem('ds-idle-staff'); } catch (_e) {}
    try { await signOutUser(); } catch (_e) {}
    location.href = 'index.html';
  });
}

/** Build the bar and start tracking auth. Safe to call more than once. */
export function mountTopbar(host = document.querySelector('[data-topbar]')) {
  if (!host || host.dataset.mounted) return;
  host.dataset.mounted = '1';
  shell(host);
  // The bar is built AFTER ui.js has already wired the page, so hydrate its
  // icons and its theme toggle here — otherwise the toggle would be dead.
  initChrome(host);
  const zone = host.querySelector('#jxAcct');
  // The login page IS the account zone — no point repeating its buttons there.
  const quiet = host.hasAttribute('data-noauth');
  if (!quiet) paintVisitor(zone);

  onAuth(async (user) => {
    if (!user || user.isAnonymous) { if (!quiet) paintVisitor(zone); return; }
    const t = await getTeacher(user.uid);
    const name = (t && t.displayName) || user.displayName || (user.email || '').split('@')[0] || 'ผู้สอน';
    paintTeacher(zone, name, (t && t.org) || user.email || '');
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountTopbar());
else mountTopbar();
