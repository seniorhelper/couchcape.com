// Core: tiny event bus + persisted settings. No allocations in hot paths.
export class Bus {
  constructor() { this.m = new Map(); }
  on(ev, fn) { if (!this.m.has(ev)) this.m.set(ev, []); this.m.get(ev).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const a = this.m.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(ev, d) { const a = this.m.get(ev); if (a) for (let i = 0; i < a.length; i++) a[i](d); }
}
export const bus = new Bus();

const KEY = 'couchcape.settings.v1';
const DEFAULTS = { comfort: 'moderate', difficulty: 'medium', reduceEffects: false, voiceMuted: true, pushToTalk: true };

export const settings = (() => {
  let s = { ...DEFAULTS };
  try { const raw = localStorage.getItem(KEY); if (raw) s = { ...DEFAULTS, ...JSON.parse(raw) }; } catch (e) { /* storage may be blocked */ }
  return s;
})();
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } }

// Difficulty tuning table — one place to balance the game.
export const DIFF = {
  easy:   { maxHearts: 5, enemyDmg: 0.5, enemyFireEvery: 4.0, hintDelay: 8,  lives: 5 },
  medium: { maxHearts: 4, enemyDmg: 0.5, enemyFireEvery: 2.8, hintDelay: 20, lives: 3 },
  hard:   { maxHearts: 3, enemyDmg: 1.0, enemyFireEvery: 2.0, hintDelay: 45, lives: 3 },
  expert: { maxHearts: 3, enemyDmg: 1.0, enemyFireEvery: 1.4, hintDelay: 0,  lives: 1 }
};

// Comfort presets — vignette strength and motion caps for seated flight.
export const COMFORT = {
  comfortable: { vignette: 0.85, maxSpeed: 9,  accel: 4,  turnRate: 0.6 },
  moderate:    { vignette: 0.55, maxSpeed: 14, accel: 6,  turnRate: 0.9 },
  intense:     { vignette: 0.0,  maxSpeed: 20, accel: 10, turnRate: 1.3 }
};
