/* =================================================================
   Guide pages — JDKS ARENA
   Two small touches only: the callout icons, and a table of contents
   that follows where you are on the page.
   ================================================================= */
import { icon } from './icons.js';

/* Callouts declare their icon with data-icon-before so the markup stays
   readable; hydrate them here rather than repeating SVG in the HTML. */
document.querySelectorAll('[data-icon-before]').forEach((el) => {
  // The callout is a flex row, so the sentence has to live in ONE child —
  // otherwise every <b> inside it becomes its own flex item and the text
  // breaks into disconnected columns.
  el.innerHTML = `<span class="gd-note__ic">${icon(el.dataset.iconBefore)}</span>`
    + `<span class="gd-note__t">${el.innerHTML}</span>`;
});

/* Highlight the section currently in view. */
const links = [...document.querySelectorAll('.gd-toc a')];
const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
const sections = [...document.querySelectorAll('.gd-sec[id]')];

if (sections.length && 'IntersectionObserver' in window) {
  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) seen.add(e.target.id); else seen.delete(e.target.id); });
    const first = sections.find((s) => seen.has(s.id));
    links.forEach((a) => a.classList.remove('is-on'));
    if (first && byId.get(first.id)) byId.get(first.id).classList.add('is-on');
  }, { rootMargin: '-90px 0px -55% 0px' });
  sections.forEach((s) => io.observe(s));
}
