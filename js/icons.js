/* =================================================================
   Tech / AI line-icon set — DIGITAL SURVIVAL
   All icons: 24x24 viewBox, stroke=currentColor, inherit color/size.
   Usage:  el.innerHTML = icon('shield', 'ds-ico--lg');
           document.querySelectorAll('[data-icon]').forEach(hydrateIcons);
   ================================================================= */

const P = {
  /* --- Mission / topic icons --- */
  id:        '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.6 2-2.4 3-2.4s2.4.8 3 2.4"/><path d="M14.5 9.5h4M14.5 12.5h4M14.5 15.5h2.5"/>',
  shadow:    '<circle cx="12" cy="8" r="3.2"/><path d="M6 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M18.5 8.5c1.6.4 2.8 1.4 2.8 2.6M2.7 11.1c0-1.2 1.2-2.2 2.8-2.6" opacity=".55"/>',
  shield:    '<path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  search:    '<circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5"/><path d="M11 8.5v5M8.5 11h5" opacity=".5"/>',
  chat:      '<path d="M4 5h16v10H9l-4 3v-3H4z"/><path d="M8 9h8M8 12h5"/>',
  lock:      '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1.4"/>',
  cpu:       '<rect x="7" y="7" width="10" height="10" rx="2"/><rect x="10" y="10" width="4" height="4" rx="1"/><path d="M10 3v2M14 3v2M10 19v2M14 19v2M3 10h2M3 14h2M19 10h2M19 14h2"/>',
  balance:   '<path d="M12 4v16M6 20h12"/><path d="M12 6l-6 2 6-2 6 2-6-2z"/><path d="M6 8l-2.5 5h5L6 8zM18 8l-2.5 5h5L18 8z"/>',
  trophy:    '<path d="M7 5h10v3a5 5 0 0 1-10 0V5z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/><path d="M12 13v3M9 20h6M10 20l.5-3M14 20l-.5-3"/>',

  /* --- AI / network flavour --- */
  ai:        '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19"/>',
  network:   '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M10.7 6.7L6.3 16M13.3 6.7L17.7 16M7 18h10"/>',
  sparkles:  '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z"/>',
  fingerprint:'<path d="M12 5a7 7 0 0 0-7 7v3M19 12a7 7 0 0 0-4-6.3M8.5 12a3.5 3.5 0 0 1 7 0v4M12 12v5M15.5 16v2"/>',
  eye:       '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',

  /* --- Host / UI controls --- */
  play:      '<path d="M8 5.5v13l11-6.5z"/>',
  pause:     '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
  next:      '<path d="M5 12h13M13 6l6 6-6 6"/>',
  reveal:    '<path d="M12 3v2M5 6l1.5 1.5M19 6l-1.5 1.5"/><path d="M9 15a3 3 0 1 1 6 0c0 1.5-1 2-1.2 3H10.2C10 17 9 16.5 9 15z"/><path d="M10 21h4"/>',
  chart:     '<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="14" width="3" height="3"/>',
  users:     '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 6.5a3 3 0 0 1 0 5.5M20.5 19c0-2.3-1.4-4-3.5-4.6" opacity=".7"/>',
  wifiOff:   '<path d="M3 3l18 18"/><path d="M5 12.5a11 11 0 0 1 4-2.4M2 8.8A16 16 0 0 1 8 6"/><path d="M8.5 16a5 5 0 0 1 5.5-1.2M16 9.2A16 16 0 0 1 22 8.8" opacity=".7"/><circle cx="12" cy="19" r="1"/>',
  alert:     '<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/>',

  /* --- Theme --- */
  sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
  moon:      '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
};

/** Return an SVG string for the given icon name. */
export function icon(name, extraClass = '') {
  const body = P[name];
  if (!body) return '';
  return `<svg class="ds-ico ${extraClass}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Replace any element with data-icon="name" by its SVG (data-icon-class optional). */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, el.dataset.iconClass || '');
  });
}

/* ---------------- Theme (dark default, light toggle) ---------------- */
const THEME_KEY = 'ds-theme';

export function applyStoredTheme() {
  let t = 'dark';
  try { t = localStorage.getItem(THEME_KEY) || 'dark'; } catch (_e) {}
  document.documentElement.setAttribute('data-theme', t);
  return t;
}

export function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_KEY, next); } catch (_e) {}
  return next;
}

/** Build a ready-to-use theme toggle button element. */
export function makeThemeToggle() {
  const btn = document.createElement('button');
  btn.className = 'ds-iconbtn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'สลับธีมสว่าง/มืด');
  btn.title = 'สลับธีม';
  btn.innerHTML = `<span class="icon-sun">${icon('sun')}</span><span class="icon-moon">${icon('moon')}</span>`;
  btn.addEventListener('click', () => toggleTheme());
  return btn;
}
