// Original synthesized SFX (no external sound files). Gentle volumes, no harsh spikes.
let ctx = null, master = null;
export const getCtx = () => ctx;
export function initAudio() {
  if (ctx) return;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination); } catch (e) { ctx = null; }
}
function tone(freq, dur, type = 'sine', vol = 0.25, slideTo = 0) {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
export const SFX = {
  spark()   { tone(880, 0.12, 'triangle', 0.18); setTimeout(() => tone(1320, 0.14, 'triangle', 0.14), 60); },
  bolt()    { tone(1400, 0.22, 'sine', 0.16, 500); },
  freeze()  { tone(300, 0.5, 'triangle', 0.2, 1200); tone(2000, 0.35, 'sine', 0.06, 2600); },
  hurt()    { tone(220, 0.25, 'square', 0.08, 140); },
  ko()      { tone(500, 0.6, 'triangle', 0.18, 120); },
  container(){ [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.16), i * 110)); },
  select()  { tone(660, 0.08, 'sine', 0.14); }
};
