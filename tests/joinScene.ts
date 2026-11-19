// "Check the cut" scenes: both halves of the REAL printed sheet in ONE photo, wavy edges facing each other
// with a gap (or touching), on a table, tilted, blurred, unevenly lit, maybe a finger over an edge.
// World mm: the stock frame as is; the foil frame starts 144 + gap mm lower (so gap 0 = edges touching).
import { renderHalf, gaussBlur } from '../src/render/scene';
import { inkFromBitmap, type Bitmap } from '../src/render/rasterSvg';
import { solveHomography, invertH, type Pt } from '../src/core/homography';
import { makeWave } from '../src/core/wave';
import { mulberry32, gaussian } from '../src/core/prng';
import { HOLE_R, PIECE_X0, PIECE_X1, STOCK_TOP, FOIL_BOTTOM, STOCK_ORIGIN, FOIL_ORIGIN, targetsFor } from '../src/core/layout';
import type { CardSpec } from '../src/core/card';
import type { RGBAImage } from '../src/vision/image';

export interface JoinCase {
  gapMm: number; rotDeg: number; tiltK?: number; ppm: number; blur: number; light: number; bg: number;
  /** finger over the stock edge covering this share of its length (from the left) */
  fingerShare?: number;
  /** the foil was cut on another wave (a forgery) */
  forgedFoil?: string;
  /** sloppy cut, mm */
  jitter?: number;
  punched: string[]; seed: number;
}

export function joinScene(spec: CardSpec, bmp: Bitmap, c: JoinCase): RGBAImage {
  const rnd = mulberry32(c.seed);
  const off = 144 + c.gapMm;
  const waveS = makeWave(spec.id), waveF = makeWave(c.forgedFoil ?? spec.id);
  const jit = (x: number, k: number) => (c.jitter ? c.jitter * Math.sin(x / 7 + k) * 0.7 + c.jitter * Math.sin(x / 2.3 + 2 * k) * 0.3 : 0);
  const inkS = inkFromBitmap(bmp, STOCK_ORIGIN.x, STOCK_ORIGIN.y), inkF = inkFromBitmap(bmp, FOIL_ORIGIN.x, FOIL_ORIGIN.y);
  const targets = targetsFor(spec);
  const holes = targets.filter((t) => c.punched.includes(t.key)).map((t) => [t.cx, t.cy] as Pt);
  // world → image: rotation about the middle, scale, and a perspective push of the corners
  const W0 = PIECE_X0 - 8, W1 = PIECE_X1 + 8, H0 = STOCK_TOP - 8, H1 = off + FOIL_BOTTOM + 8;
  const cx = (W0 + W1) / 2, cy = (H0 + H1) / 2;
  const a = (c.rotDeg * Math.PI) / 180, k = c.tiltK ?? 0.03;
  const world: Pt[] = [[W0, H0], [W1, H0], [W1, H1], [W0, H1]];
  const proj = world.map(([x, y], i) => {
    const X = (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), Y = (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a);
    const p = 1 + (i < 2 ? -k : k) * (0.5 + rnd() * 0.5);
    return [X * c.ppm * p, Y * c.ppm] as Pt;
  });
  const minX = Math.min(...proj.map((p) => p[0])), minY = Math.min(...proj.map((p) => p[1]));
  const dst = proj.map(([x, y]) => [x - minX + 4, y - minY + 4] as Pt);
  const w = Math.ceil(Math.max(...dst.map((p) => p[0])) + 4), h = Math.ceil(Math.max(...dst.map((p) => p[1])) + 4);
  const H = solveHomography(world, dst)!;
  const Hi = invertH(H);
  const edgeS = (x: number) => 132 + waveS.at(x) + jit(x, 1);
  const edgeF = (x: number) => -12 + waveF.at(x) + jit(x, 4);
  const fingerX = c.fingerShare ? PIECE_X0 + (PIECE_X1 - PIECE_X0) * c.fingerShare : -1e9;
  const lum = (x: number, y: number): number => {
    // a finger lying across the stock edge from the left
    if (c.fingerShare && x < fingerX && y > 118 && y < 146) return 0.62;
    if (x < PIECE_X0 || x > PIECE_X1) return c.bg;
    if (y >= STOCK_TOP && y <= edgeS(x)) {
      for (const [hx, hy] of holes) if ((x - hx) ** 2 + (y - hy) ** 2 <= HOLE_R * HOLE_R) return c.bg;
      return 0.93 * inkS(x, y);
    }
    const yf = y - off;
    if (yf >= edgeF(x) && yf <= FOIL_BOTTOM) {
      for (const [hx, hy] of holes) if ((x - hx) ** 2 + (yf - hy) ** 2 <= HOLE_R * HOLE_R) return c.bg;
      return 0.93 * inkF(x, yf);
    }
    return c.bg;
  };
  const L = new Float32Array(w * h);
  const la = Math.PI / 4, ca = Math.cos(la), sa = Math.sin(la), half = Math.max(w, h) / 2;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const u = px + 0.5, v = py + 0.5;
    const z = Hi[6] * u + Hi[7] * v + Hi[8];
    let l = lum((Hi[0] * u + Hi[1] * v + Hi[2]) / z, (Hi[3] * u + Hi[4] * v + Hi[5]) / z);
    const gg = ((px - w / 2) * ca + (py - h / 2) * sa) / half;
    l *= 1 - (c.light * (Math.max(-1, Math.min(1, gg)) + 1)) / 2;
    L[py * w + px] = l * 255;
  }
  const B = c.blur > 0.05 ? gaussBlur(L, w, h, c.blur) : L;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = B[i] + gaussian(rnd) * 2.5; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  return { width: w, height: h, data };
}

/** The same two halves photographed separately (one photo each), for the designed-wave check. */
export function separatePhotos(spec: CardSpec, bmp: Bitmap, c: Pick<JoinCase, 'punched' | 'seed' | 'forgedFoil'>): { stock: RGBAImage; foil: RGBAImage } {
  const one = (role: 'S' | 'F') => {
    const o = role === 'S' ? STOCK_ORIGIN : FOIL_ORIGIN;
    const sc = renderHalf({ spec, role, punched: c.punched, ink: inkFromBitmap(bmp, o.x, o.y), cutWaveId: role === 'F' ? c.forgedFoil : undefined },
      { seed: c.seed + (role === 'S' ? 1 : 2), pxPerMm: 3.6, rotationDeg: role === 'S' ? 5 : -4, tiltXDeg: 3, tiltYDeg: -2, blur: 1.2, noise: 0.01, light: 0.2, background: 0.12 });
    return { width: sc.width, height: sc.height, data: sc.data };
  };
  return { stock: one('S'), foil: one('F') };
}

// ---------------- property shards: real pairs match, forged foils never do ----------------
import fc from 'fast-check';
import { scanImage, type HalfScan } from '../src/vision/detect';
import { joinBlocker, joinGap } from '../src/vision/capture';
import { verifyPair } from '../src/vision/pair';

export function readJoin(img: RGBAImage): { s?: HalfScan; f?: HalfScan; gap: number } {
  const res = scanImage(img, { pair: true });
  const s = res.halves.find((h) => h.decoded.role === 'S'), f = res.halves.find((h) => h.decoded.role === 'F');
  return { s, f, gap: s && f ? joinGap(s, f) : NaN };
}

export function joinShard(spec: CardSpec, bmp: Bitmap, seed: number, numRuns = 50) {
  const keys = targetsFor(spec).map((t) => t.key);
  const st = { runs: 0, captured: 0, matched: 0, forged: 0, falseMatch: 0 };
  fc.assert(fc.property(fc.record({
    gapMm: fc.integer({ min: 10, max: 30 }), rotDeg: fc.integer({ min: -10, max: 10 }), tiltK: fc.double({ min: 0, max: 0.05, noNaN: true }),
    ppm: fc.double({ min: 3.1, max: 3.8, noNaN: true }), blur: fc.double({ min: 0.9, max: 1.8, noNaN: true }), light: fc.double({ min: 0, max: 0.35, noNaN: true }),
    bg: fc.constantFrom(0.08, 0.12, 0.18), jitter: fc.double({ min: 0, max: 0.25, noNaN: true }), punched: fc.subarray(keys, { maxLength: 8 }), seed: fc.integer({ min: 1, max: 1e6 }),
  }), (c) => {
    st.runs++;
    const r = readJoin(joinScene(spec, bmp, c));
    if (!joinBlocker(r.s, r.f, r.gap)) st.captured++;
    if (r.s && r.f && verifyPair(r.s, r.f).edge?.status === 'match') st.matched++;
    if (c.seed % 3 === 0) {
      st.forged++;
      const g = readJoin(joinScene(spec, bmp, { ...c, forgedFoil: 'FORGE' + (c.seed % 997) }));
      if (g.s && g.f && verifyPair(g.s, g.f).edge?.status === 'match') { st.falseMatch++; throw new Error('a forged foil matched'); }
    }
  }), { numRuns, seed });
  return st;
}
