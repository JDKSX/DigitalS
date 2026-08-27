/* =================================================================
   Audio engine — DIGITAL SURVIVAL (presenter only)
   • BG music: a gentle looping chord progression (vi–IV–I–V) played as
     soft plucks + bass — musical MOVEMENT, not a flat drone.
   • SFX: short cues for key moments.
   BG and SFX have INDEPENDENT on/off toggles. 100% synthesized (Web
   Audio) — no files, no copyright, offline. Needs a user gesture.
   ================================================================= */

const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, C6: 1046.5 };

// vi–IV–I–V in C major (Am – F – C – G): warm, familiar, non-fatiguing loop.
const PROG = [
  { bass: 110.00, tones: [220.00, 261.63, 329.63] }, // Am
  { bass: 87.31,  tones: [174.61, 220.00, 261.63] }, // F
  { bass: 130.81, tones: [196.00, 261.63, 329.63] }, // C
  { bass: 98.00,  tones: [196.00, 246.94, 293.66] }, // G
];

const MOOD = {
  lobby:    { barMs: 2200, cutoff: 1300, dense: 3, vol: 0.11, sparkle: false },
  question: { barMs: 1700, cutoff: 1600, dense: 4, vol: 0.12, sparkle: false },
  locked:   { barMs: 2600, cutoff: 850,  dense: 1, vol: 0.10, sparkle: false },
  reveal:   { barMs: 1500, cutoff: 2100, dense: 4, vol: 0.11, sparkle: true },
  off:      { barMs: 2200, cutoff: 1200, dense: 3, vol: 0.10, sparkle: false },
};

class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.bgGain = null; this.bgFilter = null; this.sfxGain = null;
    this.bgOn = false; this.sfxOn = false; this.mood = 'lobby'; this.barTimer = null; this.barIdx = 0;
  }

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 1.0; this.sfxGain.connect(this.master);
      this.bgFilter = this.ctx.createBiquadFilter(); this.bgFilter.type = 'lowpass'; this.bgFilter.frequency.value = 1300;
      this.bgGain = this.ctx.createGain(); this.bgGain.gain.value = 0.0;
      this.bgFilter.connect(this.bgGain); this.bgGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setBg(on) {
    this.bgOn = on;
    try { localStorage.setItem('ds-bg', on ? '1' : '0'); } catch (_e) {}
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const m = MOOD[this.mood] || MOOD.off;
    this.bgGain.gain.setTargetAtTime(on ? m.vol : 0.0, this.ctx.currentTime, 0.4);
    if (on) this.startBg(); else this.stopBg();
  }
  setSfx(on) {
    this.sfxOn = on;
    try { localStorage.setItem('ds-sfx', on ? '1' : '0'); } catch (_e) {}
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMood(mood) {
    if (!MOOD[mood] || mood === this.mood) return;
    this.mood = mood;
    if (!this.ctx) return;
    const m = MOOD[mood];
    this.bgFilter.frequency.setTargetAtTime(m.cutoff, this.ctx.currentTime, 0.6);
    if (this.bgOn) this.bgGain.gain.setTargetAtTime(m.vol, this.ctx.currentTime, 0.6);
  }

  /* ---- BG loop ---- */
  startBg() { if (this.barTimer) return; this.scheduleBar(); }
  stopBg() { if (this.barTimer) { clearTimeout(this.barTimer); this.barTimer = null; } }
  scheduleBar() {
    if (!this.ctx || !this.bgOn) { this.barTimer = null; return; }
    const m = MOOD[this.mood] || MOOD.off;
    const chord = PROG[this.barIdx % PROG.length];
    const beat = m.barMs / 4 / 1000;
    // bass on the down-beat (soft, longer)
    this.bgNote(chord.bass, 1.3, 'sine', 0.5, 0);
    // plucked chord tones spread across the bar
    for (let i = 0; i < m.dense; i++) {
      const f = chord.tones[i % chord.tones.length] * (i >= chord.tones.length ? 2 : 1);
      this.bgNote(f, 0.4, 'triangle', 0.32, beat * (i + 0.5));
    }
    if (m.sparkle) this.bgNote(chord.tones[2] * 2, 0.5, 'triangle', 0.22, beat * 2.5);
    this.barIdx++;
    this.barTimer = setTimeout(() => this.scheduleBar(), m.barMs);
  }
  bgNote(freq, dur, type, vol, when) {
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.bgFilter); o.start(t); o.stop(t + dur + 0.03);
  }

  /* ---- SFX ---- */
  blip(freq, dur = 0.15, type = 'triangle', vol = 0.3, when = 0) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.03);
  }
  seq(notes, gap, type, vol, dur) { notes.forEach((f, i) => this.blip(f, dur, type, vol, i * gap)); }

  sfx(name) {
    if (!this.sfxOn || !this.ctx) return;
    switch (name) {
      case 'tickLow': this.blip(N.A4, 0.05, 'square', 0.14); break;
      case 'tick':    this.blip(N.E5, 0.05, 'square', 0.20); break;
      case 'timeup':  this.seq([N.G5, N.E5, N.C5], 0.10, 'triangle', 0.26, 0.16); break;
      case 'allin':   this.seq([N.C5, N.E5, N.G5, N.C6], 0.075, 'triangle', 0.28, 0.18); break;
      case 'reveal':  this.seq([N.C5, N.E5, N.G5, N.C6, N.G5, N.C6], 0.09, 'triangle', 0.30, 0.22); break;
      case 'start':   this.seq([N.C5, N.G5], 0.09, 'triangle', 0.24, 0.16); break;
      case 'join':    this.blip(N.E5, 0.10, 'sine', 0.16); break;
      case 'select':  this.blip(N.A4, 0.05, 'square', 0.12); break;
      default: break;
    }
  }
}

export const audio = new AudioEngine();
