// Photo simulator (§6.5.7): renders one cut half the way a phone photo looks, as RGBA, deterministic per seed.
// Works in Node and the browser. It returns the ground truth and is the oracle for the scanner tests.
import type { CardSpec, Role } from '../core/card';
import { mulberry32, gaussian, hash53 } from '../core/prng';
import { solveHomography, invertH, applyH, type Hom, type Pt } from '../core/homography';
import { makeWave } from '../core/wave';
import { HOLE_R, PIECE_X0, PIECE_X1, STOCK_TOP, FOIL_BOTTOM, targetsFor, FRAME_W } from '../core/layout';
import { printModel } from './sheet';

export interface PhotoOpts {
  seed?: number;
  pxPerMm?: number; // ~3.6 is the reference
  rotationDeg?: number;
  tiltXDeg?: number;
  tiltYDeg?: number;
  blur?: number; // Gaussian sigma in px
  noise?: number; // std dev as a fraction of full scale
  light?: number; // 0..0.6 uneven light strength
  lightAngleDeg?: number;
  background?: number; // 0..1 luminance (dark cloth 0.12, pale 0.68, white table 0.97)
  paper?: number; // paper luminance, default 0.93
  crop?: number; // fraction of the image width removed on the right (partial capture)
  supersample?: number; // 1 or 2
  /** Frame only this region (frame mm), e.g. the card filling the photo with no paper margin. */
  view?: { x0: number; y0: number; x1: number; y1: number };
  /** Things over the card, e.g. fingers holding it (frame mm, luminance 0..1). */
  fingers?: { x: number; y: number; r: number; lum?: number }[];
  /** A hand-held sheet is not flat: the top-left corner region is pushed up-left by up to this many mm. */
  bend?: number;
}

export interface HalfInput {
  spec: CardSpec;
  role: Role;
  punched: Iterable<string>;
  holeCentres?: Record<string, Pt>; // frame mm; default = printed circle centre
  cutWaveId?: string; // a forged half cut on a different wave
  cutJitter?: number; // mm, a sloppy cut
  payloadOverride?: string;
  ink?: (x: number, y: number) => number; // printed luminance sampler (print round-trip)
}

export interface SceneTruth {
  role: Role;
  payload: string;
  H: Hom; // frame mm → image px
  punched: string[];
  holeCentres: Record<string, Pt>;
  edge: number[]; // edge offset from nominal at x = 0, 2, ..., 186
  pxPerMm: number;
}

export interface Scene { width: number; height: number; data: Uint8ClampedArray; truth: SceneTruth }

export const EDGE_XS: number[] = Array.from({ length: 179 }, (_, i) => 4 + i); // same x positions as the scanner (every 1 mm)

function jitterFn(seed: number, amp: number): (x: number) => number {
  if (!amp) return () => 0;
  const r = mulberry32(seed);
  const comps = Array.from({ length: 3 }, () => ({ l: 6 + r() * 24, p: r() * Math.PI * 2, a: 0.3 + r() * 0.7 }));
  const norm = comps.reduce((s, c) => s + c.a, 0);
  return (x) => (amp * comps.reduce((s, c) => s + c.a * Math.sin((2 * Math.PI * x) / c.l + c.p), 0)) / norm;
}

function poseFor(role: Role, o: PhotoOpts, rnd: () => number): { H: Hom; width: number; height: number; ppm: number } {
  const ppm = o.pxPerMm ?? 3.6;
  const y0 = role === 'S' ? STOCK_TOP : -18;
  const y1 = role === 'S' ? 138 : FOIL_BOTTOM;
  const cx = (PIECE_X0 + PIECE_X1) / 2;
  const cy = (y0 + y1) / 2;
  const rot = ((o.rotationDeg ?? 0) * Math.PI) / 180;
  const tx = ((o.tiltXDeg ?? 0) * Math.PI) / 180;
  const ty = ((o.tiltYDeg ?? 0) * Math.PI) / 180;
  const D = 420;
  const project = (x: number, y: number): Pt => {
    let X = x - cx, Y = y - cy, Z = 0;
    // tilt about the x axis, then the y axis, then rotate in the image plane
    const Y1 = Y * Math.cos(tx), Z1 = Y * Math.sin(tx);
    const X2 = X * Math.cos(ty) + Z1 * Math.sin(ty), Z2 = -X * Math.sin(ty) + Z1 * Math.cos(ty);
    X = X2; Y = Y1; Z = Z2;
    const Xr = X * Math.cos(rot) - Y * Math.sin(rot), Yr = X * Math.sin(rot) + Y * Math.cos(rot);
    const k = (ppm * D) / (D + Z);
    return [Xr * k, Yr * k];
  };
  const src: Pt[] = [[PIECE_X0, y0], [PIECE_X1, y0], [PIECE_X1, y1], [PIECE_X0, y1]];
  const pts = src.map(([x, y]) => project(x, y));
  const v = o.view;
  const bpts = v ? ([[v.x0, v.y0], [v.x1, v.y0], [v.x1, v.y1], [v.x0, v.y1]] as Pt[]).map(([x, y]) => project(x, y)) : pts;
  const minX = Math.min(...bpts.map((p) => p[0])), maxX = Math.max(...bpts.map((p) => p[0]));
  const minY = Math.min(...bpts.map((p) => p[1])), maxY = Math.max(...bpts.map((p) => p[1]));
  const mx = v ? 2 : 20 + (maxX - minX) * (0.05 + rnd() * 0.04);
  const my = v ? 2 : 20 + (maxY - minY) * (0.05 + rnd() * 0.04);
  const width = Math.ceil(maxX - minX + 2 * mx);
  const height = Math.ceil(maxY - minY + 2 * my);
  const dst = pts.map(([u, v]) => [u - minX + mx, v - minY + my] as Pt);
  const H = solveHomography(src, dst)!;
  return { H, width, height, ppm };
}

export function renderHalf(input: HalfInput, photo: PhotoOpts = {}): Scene {
  const seed = photo.seed ?? 1;
  const rnd = mulberry32(seed);
  const { spec, role } = input;
  const model = printModel(spec, role, input.payloadOverride);
  const ink = input.ink ?? model.ink;
  const pose = poseFor(role, photo, rnd);
  const fullW = pose.width;
  const width = Math.max(40, Math.round(fullW * (1 - (photo.crop ?? 0))));
  const height = pose.height;
  const Hinv = invertH(pose.H);
  const wave = makeWave(input.cutWaveId ?? spec.id);
  const jit = jitterFn(hash53('jit' + seed), input.cutJitter ?? 0);
  const edgeAt = (x: number) => wave.at(x) + jit(x);
  const punched = [...new Set(input.punched)];
  const targets = new Map(targetsFor(spec).map((t) => [t.key, t]));
  const holeCentres: Record<string, Pt> = {};
  const holes: Pt[] = [];
  for (const k of punched) {
    const t = targets.get(k);
    if (!t) continue;
    const c = input.holeCentres?.[k] ?? ([t.cx, t.cy] as Pt);
    holeCentres[k] = c;
    holes.push(c);
  }
  const hb = new Map<string, Pt[]>();
  for (const h of holes) {
    const bx = Math.floor(h[0] / 8), by = Math.floor(h[1] / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const k = `${bx + i},${by + j}`;
      let l = hb.get(k);
      if (!l) { l = []; hb.set(k, l); }
      l.push(h);
    }
  }
  const paper = photo.paper ?? 0.93;
  const bg = photo.background ?? 0.12;
  const r2 = HOLE_R * HOLE_R;
  const fingers = photo.fingers ?? [];
  const bend = photo.bend ?? 0;
  const sampleLum = (x0: number, y0: number): number => {
    for (const f of fingers) if ((x0 - f.x) ** 2 + (y0 - f.y) ** 2 <= f.r * f.r) return f.lum ?? 0.5;
    let x = x0, y = y0;
    if (bend) {
      // Seen position p0 = paper point p + shift(p); one fixed-point step recovers p.
      const w = Math.max(0, 1 - Math.hypot(x0, y0) / 90) ** 2;
      x = x0 + bend * w * 0.7071; y = y0 + bend * w * 0.7071;
    }
    if (x < PIECE_X0 || x > PIECE_X1) return bg;
    if (role === 'S') {
      if (y < STOCK_TOP || y > 132 + edgeAt(x)) return bg;
    } else if (y < edgeAt(x) - 12 || y > FOIL_BOTTOM) return bg;
    const l = hb.get(`${Math.floor(x / 8)},${Math.floor(y / 8)}`);
    if (l) for (const [hx, hy] of l) if ((x - hx) * (x - hx) + (y - hy) * (y - hy) <= r2) return bg;
    return paper * ink(x, y);
  };
  const ss = Math.max(1, Math.min(3, photo.supersample ?? ((photo.blur ?? 0) >= 0.6 ? 1 : 2)));
  const L = new Float32Array(width * height);
  const la = ((photo.lightAngleDeg ?? 30) * Math.PI) / 180;
  const light = photo.light ?? 0;
  const ca = Math.cos(la), sa = Math.sin(la);
  const half = Math.max(fullW, height) / 2;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let s = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = px + (sx + 0.5) / ss, v = py + (sy + 0.5) / ss;
          const w = Hinv[6] * u + Hinv[7] * v + Hinv[8];
          const x = (Hinv[0] * u + Hinv[1] * v + Hinv[2]) / w;
          const y = (Hinv[3] * u + Hinv[4] * v + Hinv[5]) / w;
          s += sampleLum(x, y);
        }
      }
      let lum = s / (ss * ss);
      if (light) {
        const g = ((px - fullW / 2) * ca + (py - height / 2) * sa) / half;
        lum *= 1 - (light * (Math.max(-1, Math.min(1, g)) + 1)) / 2;
      }
      L[py * width + px] = lum * 255;
    }
  }
  const blurred = photo.blur && photo.blur > 0.05 ? gaussBlur(L, width, height, photo.blur) : L;
  const noise = (photo.noise ?? 0) * 255;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = blurred[i] + (noise ? gaussian(rnd) * noise : 0);
    data[i * 4] = v;
    data[i * 4 + 1] = v * 0.97;
    data[i * 4 + 2] = v * 0.9;
    data[i * 4 + 3] = 255;
  }
  return {
    width, height, data,
    truth: {
      role, payload: model.payload, H: pose.H, punched: Object.keys(holeCentres), holeCentres,
      edge: EDGE_XS.map(edgeAt), pxPerMm: pose.ppm,
    },
  };
}

export function gaussBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += src[row + Math.min(w - 1, Math.max(0, x + i))] * k[i + r];
      tmp[row + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r];
      out[y * w + x] = s;
    }
  }
  return out;
}

// ---------------- Pairs: both halves punched together ----------------

export interface StackError { dx: number; dy: number; rotDeg: number }

export interface PairInput {
  spec: CardSpec;
  stockPunched: string[];
  foilPunched: string[];
  seed: number;
  stack?: StackError; // misalignment of the halves while punching together
  punchJitter?: number; // mm, how far each hole lands from the printed circle centre
  separate?: string[]; // foil holes made separately (not through the stack)
  separateOffset?: number; // mm, default 2.5
  forgeCutFoil?: boolean; // foil cut on a different wave (a forgery or a different card's foil)
  stockCutJitter?: number;
  foilCutJitter?: number;
  stockPayload?: string;
  foilPayload?: string;
  photoStock?: PhotoOpts;
  photoFoil?: PhotoOpts;
}

export interface PairScene { stock: Scene; foil: Scene; stockCentres: Record<string, Pt>; foilCentres: Record<string, Pt> }

export function stackTransform(s: StackError): (p: Pt) => Pt {
  const a = (s.rotDeg * Math.PI) / 180;
  const c = Math.cos(a), sn = Math.sin(a);
  const cx = FRAME_W / 2, cy = 60;
  return ([x, y]) => [cx + (x - cx) * c - (y - cy) * sn + s.dx, cy + (x - cx) * sn + (y - cy) * c + s.dy];
}

export function pairHoles(input: PairInput): { stockCentres: Record<string, Pt>; foilCentres: Record<string, Pt> } {
  const rnd = mulberry32(hash53('holes' + input.seed));
  const jit = input.punchJitter ?? 0.3;
  const targets = new Map(targetsFor(input.spec).map((t) => [t.key, t]));
  const T = stackTransform(input.stack ?? { dx: 0, dy: 0, rotDeg: 0 });
  const rndOff = (m: number): Pt => {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * m;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const stockCentres: Record<string, Pt> = {};
  const foilCentres: Record<string, Pt> = {};
  const sep = new Set(input.separate ?? []);
  for (const k of input.stockPunched) {
    const t = targets.get(k);
    if (!t) continue;
    const o = rndOff(jit);
    stockCentres[k] = [t.cx + o[0], t.cy + o[1]];
  }
  for (const k of input.foilPunched) {
    const t = targets.get(k);
    if (!t) continue;
    if (stockCentres[k] && !sep.has(k)) {
      foilCentres[k] = T(stockCentres[k]);
    } else if (stockCentres[k] && sep.has(k)) {
      const base = T(stockCentres[k]);
      const a = rnd() * Math.PI * 2;
      const m = input.separateOffset ?? 2.5;
      foilCentres[k] = [base[0] + Math.cos(a) * m, base[1] + Math.sin(a) * m];
    } else {
      const o = rndOff(jit);
      foilCentres[k] = [t.cx + o[0], t.cy + o[1]];
    }
  }
  return { stockCentres, foilCentres };
}

export function renderPair(input: PairInput): PairScene {
  const { stockCentres, foilCentres } = pairHoles(input);
  const forged = input.forgeCutFoil ? 'FORGED' + (input.seed % 1000) : undefined;
  const stock = renderHalf(
    {
      spec: input.spec, role: 'S', punched: Object.keys(stockCentres), holeCentres: stockCentres,
      cutJitter: input.stockCutJitter, payloadOverride: input.stockPayload,
    },
    { seed: input.seed * 2 + 1, ...input.photoStock },
  );
  const foil = renderHalf(
    {
      spec: input.spec, role: 'F', punched: Object.keys(foilCentres), holeCentres: foilCentres,
      cutWaveId: forged, cutJitter: input.foilCutJitter, payloadOverride: input.foilPayload,
    },
    { seed: input.seed * 2 + 2, ...input.photoFoil },
  );
  return { stock, foil, stockCentres, foilCentres };
}

export { applyH };
