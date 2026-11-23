// FlashGuard — every bright/full-view effect must ask permission here.
// Limits: <= 2 flashes per rolling second (WCAG 2.3.1 allows 3; VR is stricter),
// no saturated-red flashes, capped intensity, and Reduce Effects disables most.
import { settings } from './core.js';

const WINDOW = 1.0, MAX_PER_WINDOW = 2;
const stamps = new Float64Array(8); let head = 0;

function recent(now) { let n = 0; for (let i = 0; i < stamps.length; i++) if (now - stamps[i] < WINDOW) n++; return n; }

export const FlashGuard = {
  // color: {r,g,b} 0..1. Returns allowed intensity (0 = denied).
  request(intensity, color, now = performance.now() / 1000) {
    if (settings.reduceEffects) intensity *= 0.25;
    if (color && color.r > 0.8 && color.g < 0.35 && color.b < 0.35) return 0; // saturated red: never flash
    if (recent(now) >= MAX_PER_WINDOW) return 0;
    stamps[head] = now; head = (head + 1) % stamps.length;
    return Math.min(intensity, 0.35); // never a full-field white-out
  }
};
