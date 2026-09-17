/* =================================================================
   Idle timer — JDKS ARENA
   Fires onIdle() after `minutes` with no user interaction. Persists the
   last-activity time so a page refresh does not reset a long idle period
   (e.g. staff auto-logout / student auto-leave after 1 hour of no movement).
   ================================================================= */
export function startIdleTimer({ key = 'ds-last-activity', minutes = 60, onIdle }) {
  const MS = minutes * 60 * 1000;
  const now = () => Date.now();
  const read = () => { try { return +localStorage.getItem(key) || 0; } catch (_e) { return 0; } };
  const write = (t) => { try { localStorage.setItem(key, String(t)); } catch (_e) {} };

  // Already idle longer than the window (across a refresh / reopen)? Fire now.
  const prev = read();
  if (prev && now() - prev >= MS) { onIdle(); return { stop() {}, bump() {} }; }

  let last = now(); write(last);
  let lastWrite = last;
  let timer = null;

  function check() { if (now() - last >= MS) { stop(); onIdle(); } else schedule(); }
  function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(check, Math.max(250, MS - (now() - last) + 250)); }
  function bump() {
    last = now();
    if (last - lastWrite > 15000) { lastWrite = last; write(last); } // throttle storage writes
    schedule();
  }
  const events = ['mousedown', 'keydown', 'touchstart', 'click', 'scroll', 'wheel'];
  events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });

  function stop() { if (timer) { clearTimeout(timer); timer = null; } events.forEach((e) => window.removeEventListener(e, bump)); }

  schedule();
  return { stop, bump };
}
