// The unique wavy cut (§6.3). Pure, no DOM.
import { hash53, mulberry32 } from './prng';

export const WAVE_AMP = 5;
export const FRAME_W = 186;

export interface WaveComp { f: number; p: number; a: number }
export interface Wave { id: string; comps: WaveComp[]; k: number; at: (x: number) => number }

function raw(comps: WaveComp[], x: number): number {
  let s = 0;
  for (const c of comps) s += c.a * Math.sin((2 * Math.PI * c.f * x) / FRAME_W + c.p);
  return s;
}

const cache = new Map<string, Wave>();

/** w(x) in mm for frame x in mm; peak over x∈[−14,200] (step 0.5) is exactly 5mm. */
export function makeWave(id: string): Wave {
  const hit = cache.get(id);
  if (hit) return hit;
  const rnd = mulberry32(hash53('wave:' + id) >>> 0);
  const comps: WaveComp[] = [];
  for (let i = 0; i < 4; i++) {
    const f = 1.2 + rnd() * 6.5;
    const p = rnd() * 2 * Math.PI;
    const a = 0.4 + rnd() * 0.6;
    comps.push({ f, p, a });
  }
  let peak = 0;
  for (let x = -14; x <= 200 + 1e-9; x += 0.5) peak = Math.max(peak, Math.abs(raw(comps, x)));
  const k = peak > 0 ? WAVE_AMP / peak : 0;
  const w: Wave = {
    id,
    comps,
    k,
    at: (x: number) => Math.max(-WAVE_AMP, Math.min(WAVE_AMP, k * raw(comps, x))),
  };
  if (cache.size > 500) cache.clear();
  cache.set(id, w);
  return w;
}

/** Stock edge y in stock-frame mm; foil edge y in foil-frame mm. */
export const stockEdgeY = (w: Wave, x: number): number => 120 + 12 + w.at(x);
export const foilEdgeY = (w: Wave, x: number): number => w.at(x) - 12;

/** SVG path of the cut on the sheet (sheet mm). */
export function wavePath(w: Wave, sheetY: number, x0 = -12, x1 = 198, step = 1): string {
  let d = '';
  for (let x = x0; x <= x1 + 1e-9; x += step) {
    d += (d ? ' L' : 'M') + (x + 12).toFixed(2) + ' ' + (sheetY + w.at(x)).toFixed(2);
  }
  return d;
}
