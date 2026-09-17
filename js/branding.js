/* =================================================================
   School branding — JDKS ARENA
   A teacher can put their own name, colour and mark on the screens
   their class sees. Two rules shape the design:

   1. Students cannot read teachers/{uid} (the rules keep that private),
      so a room carries a SNAPSHOT of the brand taken when it was
      created. Changing your brand later never rewrites finished rooms.
   2. The mark is drawn, not uploaded — a mascot or two characters — so
      there is nothing to host, nothing to break, and no CORS. A logo
      URL is still accepted for schools that already have one online.
   ================================================================= */
import { mascot, MASCOTS } from './mascot.js';

/** Accent choices, each with the darker "lip" its pressed buttons need. */
export const ACCENTS = [
  { id: 'violet', nameTh: 'ม่วง',     c: '#7C3AED', d: '#5B21B6' },
  { id: 'indigo', nameTh: 'คราม',     c: '#4F46E5', d: '#3730A3' },
  { id: 'blue',   nameTh: 'น้ำเงิน',  c: '#2563EB', d: '#1E40AF' },
  { id: 'teal',   nameTh: 'เขียวน้ำทะเล', c: '#0D9488', d: '#115E59' },
  { id: 'green',  nameTh: 'เขียว',    c: '#16A34A', d: '#166534' },
  { id: 'orange', nameTh: 'ส้ม',      c: '#EA580C', d: '#9A3412' },
  { id: 'red',    nameTh: 'แดง',      c: '#DC2626', d: '#991B1B' },
  { id: 'pink',   nameTh: 'ชมพู',     c: '#DB2777', d: '#9D174D' },
];

export const MARKS = MASCOTS;

export function blankBrand() {
  return { appName: '', accent: '', mark: '', logoUrl: '' };
}

/** Only the fields we understand, trimmed and length-capped. */
export function cleanBrand(b = {}) {
  const accent = ACCENTS.find((a) => a.id === b.accent) ? b.accent : '';
  const url = String(b.logoUrl || '').trim();
  return {
    appName: String(b.appName || '').trim().slice(0, 40),
    accent,
    mark: MARKS.includes(b.mark) ? b.mark : '',
    // http(s) only — a data: or javascript: URL has no business here
    logoUrl: /^https:\/\/\S+$/i.test(url) ? url.slice(0, 500) : '',
  };
}

export function hasBrand(b) {
  const c = cleanBrand(b || {});
  return !!(c.appName || c.accent || c.mark || c.logoUrl);
}

/** The logo mark as HTML: an uploaded logo, a mascot, or the initials. */
export function markHtml(brand, size = 46) {
  const b = cleanBrand(brand || {});
  if (b.logoUrl) {
    return `<img class="jx-brandimg" src="${b.logoUrl}" alt="" width="${size}" height="${size}"
      onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'jx-brandtxt',textContent:'JA'}))">`;
  }
  if (b.mark) return mascot(b.mark, { size: Math.round(size * 0.92) });
  return '';
}

/**
 * Paint a brand onto the current page. Safe to call with an empty brand
 * (it simply leaves the JDKS Arena defaults alone).
 */
export function applyBrand(brand) {
  const b = cleanBrand(brand || {});
  const root = document.documentElement;

  const accent = ACCENTS.find((a) => a.id === b.accent);
  if (accent) {
    root.style.setProperty('--electric', accent.c);
    root.style.setProperty('--electric-hi', accent.c);
    root.style.setProperty('--link', accent.c);
    root.style.setProperty('--glow-electric', `0 4px 0 ${accent.d}`);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = accent.c;
  }

  if (b.appName) {
    document.querySelectorAll('.jx-logo__name, .hx-brand__txt').forEach((el) => {
      const tag = el.querySelector('.jx-logo__tag, small');
      el.textContent = b.appName;
      if (tag) el.appendChild(tag);
    });
    document.title = document.title.replace(/JDKS Arena/g, b.appName);
  }

  const mark = markHtml(b, 44);
  if (mark) {
    document.querySelectorAll('.jx-logo__mark, .hx-brand__mark').forEach((el) => {
      el.innerHTML = mark;
      el.classList.add('jx-logo__mark--custom');
    });
  }
}
