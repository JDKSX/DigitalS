/* =================================================================
   JDKS ARENA — Mascot & 3D icon set
   Hand-built inline SVG "claymorphic" characters: a light source at the
   top-left, a darker rim at the bottom, a specular highlight and a soft
   contact shadow underneath. Everything animates with CSS (see arena.css)
   so there is no runtime cost and prefers-reduced-motion is respected.

   Use from markup:   <span data-mascot="owl" data-size="140"></span>
   Use from JS:       el.innerHTML = mascot('rocket', { size: 72 });
   ================================================================= */

let _seq = 0;

/* A 3-stop radial gradient that reads as a lit sphere. */
function grad(id, light, base, dark) {
  return `<radialGradient id="${id}" cx="34%" cy="24%" r="82%">
    <stop offset="0%" stop-color="${light}"/><stop offset="52%" stop-color="${base}"/>
    <stop offset="100%" stop-color="${dark}"/></radialGradient>`;
}

/* palette: [light, base, dark] */
const P = {
  violet: ['#D8B4FE', '#A855F7', '#6B21A8'],
  pink:   ['#FBCFE8', '#EC4899', '#9D174D'],
  teal:   ['#99F6E4', '#14B8A6', '#0F766E'],
  gold:   ['#FDE68A', '#F59E0B', '#B45309'],
  sky:    ['#BAE6FD', '#0EA5E9', '#075985'],
  lime:   ['#D9F99D', '#84CC16', '#4D7C0F'],
  rose:   ['#FECDD3', '#F43F5E', '#9F1239'],
  slate:  ['#E2E8F0', '#94A3B8', '#475569'],
};

/* Big cartoon eyes — the single feature that makes a shape feel alive. */
function eyes(cx1, cx2, cy, r = 11) {
  const p = r * 0.46;
  return `
  <g class="mx-eyes">
    <ellipse class="mx-eye" cx="${cx1}" cy="${cy}" rx="${r}" ry="${r * 1.08}" fill="#fff"/>
    <ellipse class="mx-eye" cx="${cx2}" cy="${cy}" rx="${r}" ry="${r * 1.08}" fill="#fff"/>
    <circle cx="${cx1 + 1}" cy="${cy + 1.5}" r="${p}" fill="#2A1B4D"/>
    <circle cx="${cx2 + 1}" cy="${cy + 1.5}" r="${p}" fill="#2A1B4D"/>
    <circle cx="${cx1 - 0.8}" cy="${cy - 1.6}" r="${p * 0.42}" fill="#fff"/>
    <circle cx="${cx2 - 0.8}" cy="${cy - 1.6}" r="${p * 0.42}" fill="#fff"/>
  </g>`;
}

const smile = (cx, cy, w = 13) =>
  `<path d="M${cx - w / 2} ${cy} q${w / 2} ${w * 0.62} ${w} 0" fill="none" stroke="#2A1B4D"
     stroke-width="3.4" stroke-linecap="round" opacity=".82"/>`;

const shine = (d) => `<path d="${d}" fill="#fff" opacity=".34"/>`;

/* ---------------- the cast ---------------- */
const CAST = {
  /* ครูนกฮูก — the guide who shows up on empty states and the login page */
  owl: (g) => ({
    palette: 'violet',
    body: `
    <ellipse cx="50" cy="61" rx="30" ry="31" fill="url(#${g})"/>
    ${shine('M30 44a22 22 0 0 1 17-16c-9 4-14 11-15 19z')}
    <path d="M23 36l-4-14 15 7z" fill="url(#${g})"/>
    <path d="M77 36l4-14-15 7z" fill="url(#${g})"/>
    <ellipse cx="50" cy="74" rx="17" ry="14" fill="#fff" opacity=".2"/>
    ${eyes(40, 60, 55, 12)}
    <path d="M50 66l-6 6h12z" fill="#F59E0B" stroke="#B45309" stroke-width="1.5" stroke-linejoin="round"/>
    <g class="mx-wing mx-wing--l"><ellipse cx="22" cy="63" rx="7" ry="15" fill="#6B21A8" opacity=".55"/></g>
    <g class="mx-wing mx-wing--r"><ellipse cx="78" cy="63" rx="7" ry="15" fill="#6B21A8" opacity=".55"/></g>
    <g class="mx-cap">
      <path d="M50 20l-22 8 22 8 22-8z" fill="#2A1B4D"/>
      <path d="M36 33v9c0 5 28 5 28 0v-9l-14 5z" fill="#3B2A63"/>
      <path d="M72 28v12" stroke="#F59E0B" stroke-width="2.6" stroke-linecap="round"/>
      <circle class="mx-tassel" cx="72" cy="42" r="3.4" fill="#F59E0B"/>
    </g>`,
  }),

  /* จรวด — start / launch */
  rocket: (g) => ({
    palette: 'sky',
    body: `
    <g class="mx-flame">
      <path d="M50 78c-7 6-9 12-9 15 0 4 4 6 9 6s9-2 9-6c0-3-2-9-9-15z" fill="#F59E0B"/>
      <path d="M50 82c-4 4-5 8-5 10s2 4 5 4 5-2 5-4-1-6-5-10z" fill="#FDE68A"/>
    </g>
    <path d="M50 8c11 9 17 24 17 40v22H33V48C33 32 39 17 50 8z" fill="url(#${g})"/>
    ${shine('M44 20c-5 8-7 18-7 28V60h5V48c0-10 2-20 6-28z')}
    <path d="M33 52L20 74h13z" fill="#EC4899"/>
    <path d="M67 52l13 22H67z" fill="#EC4899"/>
    <circle cx="50" cy="40" r="11" fill="#0F172A" opacity=".2"/>
    <circle cx="50" cy="40" r="9" fill="#BAE6FD"/>
    ${eyes(46, 54, 40, 3.6)}
    <path d="M33 70h34v6H33z" fill="#075985" opacity=".45"/>`,
  }),

  /* ถ้วยรางวัล — champion */
  trophy: (g) => ({
    palette: 'gold',
    body: `
    <path d="M30 20h40v20c0 12-9 21-20 21S30 52 30 40z" fill="url(#${g})"/>
    ${shine('M38 24v16c0 6 3 12 8 15-8-2-13-9-13-17V24z')}
    <path d="M30 24h-9c0 10 4 15 11 17" fill="none" stroke="#B45309" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M70 24h9c0 10-4 15-11 17" fill="none" stroke="#B45309" stroke-width="4.5" stroke-linecap="round"/>
    <rect x="45" y="60" width="10" height="12" fill="#B45309"/>
    <rect x="33" y="72" width="34" height="9" rx="3.5" fill="#B45309"/>
    <rect x="28" y="81" width="44" height="9" rx="4" fill="#92400E"/>
    ${eyes(43, 57, 36, 6.5)}
    ${smile(50, 46, 12)}
    <g class="mx-spark"><path d="M20 12l2.4 5.6L28 20l-5.6 2.4L20 28l-2.4-5.6L12 20l5.6-2.4z" fill="#FDE68A"/></g>
    <g class="mx-spark mx-spark--b"><path d="M82 34l1.8 4.2L88 40l-4.2 1.8L82 46l-1.8-4.2L76 40l4.2-1.8z" fill="#FDE68A"/></g>`,
  }),

  /* สมอง — think / quiz */
  brain: (g) => ({
    palette: 'pink',
    body: `
    <path d="M50 18c-14 0-24 8-24 18-6 3-8 9-6 14s8 8 8 8c0 8 9 14 22 14s22-6 22-14c0 0 6-3 8-8s0-11-6-14c0-10-10-18-24-18z" fill="url(#${g})"/>
    ${shine('M38 26c-6 3-9 8-9 13h4c0-5 2-9 8-12z')}
    <path d="M50 24v46M38 34c5 3 5 9 0 12M62 34c-5 3-5 9 0 12M40 56c4 2 6 6 5 10M60 56c-4 2-6 6-5 10"
      fill="none" stroke="#9D174D" stroke-width="2.6" stroke-linecap="round" opacity=".5"/>
    ${eyes(41, 59, 50, 8)}
    <g class="mx-bulb">
      <path d="M50 6a7 7 0 0 1 4 12.7V21h-8v-2.3A7 7 0 0 1 50 6z" fill="#FDE68A" stroke="#F59E0B" stroke-width="1.6"/>
      <rect x="46" y="21" width="8" height="3" rx="1.5" fill="#B45309"/>
    </g>`,
  }),

  /* ดาว — XP */
  star: (g) => ({
    palette: 'gold',
    body: `
    <path d="M50 12l11.8 23.9 26.4 3.8-19.1 18.6 4.5 26.3L50 72.2 26.4 84.6l4.5-26.3L11.8 39.7l26.4-3.8z" fill="url(#${g})"/>
    ${shine('M50 20L42 36l-16 2.4 8 8c1-11 8-20 16-26.4z')}
    ${eyes(42, 58, 46, 7)}
    ${smile(50, 58, 13)}`,
  }),

  /* สายฟ้า — speed bonus */
  bolt: (g) => ({
    palette: 'gold',
    body: `
    <path d="M58 6L26 54h18l-6 40 34-50H54z" fill="url(#${g})"/>
    ${shine('M52 14L34 42h6L54 18z')}
    ${eyes(42, 55, 44, 5.5)}`,
  }),

  /* หนังสือ — question pack */
  book: (g) => ({
    palette: 'teal',
    body: `
    <path d="M14 22c10-5 24-5 34 2v56c-10-7-24-7-34-2z" fill="url(#${g})"/>
    <path d="M86 22c-10-5-24-5-34 2v56c10-7 24-7 34-2z" fill="url(#${g})" opacity=".82"/>
    ${shine('M20 26c7-3 15-3 22 1v5c-7-4-15-4-22-1z')}
    <path d="M22 36c6-2 13-2 19 1M22 46c6-2 13-2 19 1M59 36c6-2 13-2 19 1M59 46c6-2 13-2 19 1"
      fill="none" stroke="#0F766E" stroke-width="2.6" stroke-linecap="round" opacity=".45"/>
    <rect x="47" y="20" width="6" height="60" rx="3" fill="#0F766E"/>
    <g class="mx-spark"><circle cx="78" cy="18" r="4" fill="#FDE68A"/></g>`,
  }),

  /* โล่ — safety */
  shield: (g) => ({
    palette: 'lime',
    body: `
    <path d="M50 8l32 11v28c0 21-14 36-32 45-18-9-32-24-32-45V19z" fill="url(#${g})"/>
    ${shine('M30 24l14-5v10L30 34z')}
    <path d="M34 50l11 11 21-23" fill="none" stroke="#fff" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  }),

  /* เหรียญ — badge */
  medal: (g) => ({
    palette: 'rose',
    body: `
    <path d="M32 8l12 30H26L16 12z" fill="#0EA5E9"/>
    <path d="M68 8L56 38h18l10-26z" fill="#0EA5E9" opacity=".78"/>
    <circle cx="50" cy="62" r="29" fill="url(#${g})"/>
    <circle cx="50" cy="62" r="21" fill="#fff" opacity=".18"/>
    ${shine('M32 50a22 22 0 0 1 16-14c-8 4-13 9-14 16z')}
    ${eyes(42, 58, 58, 7)}
    ${smile(50, 70, 12)}`,
  }),

  /* กลุ่มคน — community */
  people: (g) => ({
    palette: 'violet',
    body: `
    <circle cx="26" cy="36" r="13" fill="#14B8A6"/>
    <path d="M6 82c0-11 9-20 20-20s20 9 20 20z" fill="#14B8A6" opacity=".85"/>
    <circle cx="74" cy="36" r="13" fill="#EC4899"/>
    <path d="M54 82c0-11 9-20 20-20s20 9 20 20z" fill="#EC4899" opacity=".85"/>
    <circle cx="50" cy="32" r="17" fill="url(#${g})"/>
    ${shine('M38 24a15 15 0 0 1 11-7c-6 3-10 7-11 12z')}
    <path d="M24 86c0-14 12-25 26-25s26 11 26 25z" fill="url(#${g})"/>
    ${eyes(44, 56, 31, 5.5)}`,
  }),

  /* นาฬิกา — timer */
  clock: (g) => ({
    palette: 'sky',
    body: `
    <circle cx="50" cy="54" r="33" fill="url(#${g})"/>
    <circle cx="50" cy="54" r="25" fill="#fff" opacity=".92"/>
    ${shine('M28 40a30 30 0 0 1 18-14c-9 4-15 9-18 16z')}
    <path d="M50 36v18l12 8" fill="none" stroke="#0F172A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="42" y="11" width="16" height="8" rx="4" fill="#075985"/>
    <path d="M44 19h12v4H44z" fill="#0EA5E9"/>`,
  }),
};

/** Build one mascot as an SVG string. */
export function mascot(kind = 'owl', { size = 96, tone = '', spin = false, className = '' } = {}) {
  const make = CAST[kind] || CAST.owl;
  const gid = `mxg${++_seq}`;
  const spec = make(gid);
  const pal = P[tone || spec.palette] || P.violet;
  return `<span class="mx ${spin ? 'mx--spin' : ''} ${className}" style="--mx-size:${size}px" aria-hidden="true">
  <svg viewBox="0 0 100 108" width="${size}" height="${Math.round(size * 1.08)}" fill="none" role="presentation">
    <defs>${grad(gid, pal[0], pal[1], pal[2])}</defs>
    <ellipse class="mx-shadow" cx="50" cy="100" rx="26" ry="6" fill="#2A1B4D" opacity=".18"/>
    <g class="mx-body">${spec.body}</g>
  </svg></span>`;
}

/** Replace every <span data-mascot="…"> in a root with the real drawing. */
export function hydrateMascots(root = document) {
  root.querySelectorAll('[data-mascot]').forEach((el) => {
    if (el.dataset.mxDone) return;
    el.dataset.mxDone = '1';
    el.innerHTML = mascot(el.dataset.mascot, {
      size: Number(el.dataset.size) || 96,
      tone: el.dataset.tone || '',
      spin: el.hasAttribute('data-spin'),
    });
  });
}

export const MASCOTS = Object.keys(CAST);

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrateMascots());
  else hydrateMascots();
}
