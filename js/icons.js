/* =================================================================
   Tech / AI line-icon set — JDKS ARENA
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


  /* --- Console / platform (replaces the emoji set) --- */
  bulb:      '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .9 1.6h5.2c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3z"/>',
  flag:      '<path d="M6 21V4"/><path d="M6 5h11l-2 3.5L17 12H6z"/>',
  monitor:   '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
  dots:      '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  globe:     '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 2.6 15 0 18-2.6-3-2.6-15.4 0-18z"/>',
  copy:      '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  check:     '<path d="M4.5 12.5l5 5 10-11"/>',
  close:     '<path d="M6 6l12 12M18 6L6 18"/>',
  camera:    '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7l1.5-3h4l1.5 3"/><circle cx="12" cy="13.5" r="3.4"/>',
  crown:     '<path d="M4 18h16"/><path d="M4 16l-1-9 5.5 4L12 5l3.5 6L21 7l-1 9z"/>',
  book:      '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5v15"/><path d="M8 7.5h7M8 11h5"/>',
  question:  '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2-2.5 3.5"/><path d="M12 17h.01"/>',
  teacher:   '<circle cx="12" cy="6.5" r="2.8"/><path d="M6 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M3 11l9-4 9 4-9 4z" opacity=".6"/>',
  target:    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  clock:     '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  robot:     '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5"/><path d="M2 12v3M22 12v3"/>',
  room:      '<path d="M3 10.5L12 4l9 6.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5h5v5"/>',
  mic:       '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3M9 21h6"/>',
  point:     '<path d="M9 11V5.5a1.6 1.6 0 0 1 3.2 0V11"/><path d="M12.2 11V9.2a1.5 1.5 0 0 1 3 0V11"/><path d="M15.2 11.4a1.5 1.5 0 0 1 3 0v3.2a6 6 0 0 1-6 6h-1a5 5 0 0 1-3.6-1.5L5 16.4a1.6 1.6 0 0 1 2.3-2.3L9 15.6"/>',
  star:      '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
  speaker:   '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"/>',
  music:     '<circle cx="7" cy="17.5" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/><path d="M9.5 17.5V7l10-2v10.5"/><path d="M9.5 9.5l10-2"/>',
  bell:      '<path d="M6.5 16V11a5.5 5.5 0 0 1 11 0v5l1.5 2.5H5z"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/>',
  eyeOff:    '<path d="M3 3l18 18"/><path d="M10.2 6.2A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.9M6.6 7.9A17.5 17.5 0 0 0 2.5 12S6 18 12 18c1.3 0 2.4-.2 3.5-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  party:     '<path d="M4.5 20.5l4.2-11 6.8 6.8z"/><path d="M14 4.5v2M18.5 7l1.5-1.5M19 12h2M16 9.5a2.5 2.5 0 0 1 3.5-3"/>',
  leave:     '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  refresh:   '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
  plus:      '<path d="M12 5v14M5 12h14"/>',
  trash:     '<path d="M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/><path d="M6.5 7l1 12.2A1.8 1.8 0 0 0 9.3 21h5.4a1.8 1.8 0 0 0 1.8-1.8L17.5 7"/>',
  edit:      '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 6.5l3 3"/>',

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

