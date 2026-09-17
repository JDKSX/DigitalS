/* =================================================================
   Shared UI chrome bootstrap — JDKS ARENA
   Wires theme toggle + hydrates [data-icon] placeholders on every page.
   (Anti-FOUC theme is set by an inline <head> script before paint.)
   ================================================================= */
import { hydrateIcons, applyStoredTheme, toggleTheme } from './icons.js';

export function initChrome(root = document) {
  applyStoredTheme();          // ensure attribute set (inline head script already did this)
  hydrateIcons(root);          // fill <span data-icon="shield"></span> etc.
  root.querySelectorAll('[data-role="theme-toggle"]').forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => toggleTheme());
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initChrome());
} else {
  initChrome();
}
