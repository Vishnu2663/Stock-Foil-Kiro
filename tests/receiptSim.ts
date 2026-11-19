// Synthetic received marks in the RECEIVED box, drawn into the real printed sheet and photographed by the
// simulator: an inked thumb (violet, blue or black), a signature, a smudge, nothing; plus glare and a finger.
import { renderHalf, type Scene } from '../src/render/scene';
import { inkFromBitmap, type Bitmap } from '../src/render/rasterSvg';
import { STOCK_ORIGIN, FOIL_ORIGIN, FRAME_W, FRAME_H, THUMB_GUIDE } from '../src/core/layout';
import { mulberry32 } from '../src/core/prng';
import type { CardSpec, Role } from '../src/core/card';
import { jpegLike, glareAt } from './phoneSim';
import type { RGBAImage } from '../src/vision/image';

export type MarkKind = 'thumb' | 'signature' | 'smudge' | 'empty';
export const INK: Record<'violet' | 'blue' | 'black', number> = { violet: 0.3, blue: 0.24, black: 0.1 };

/** A mark as a luminance factor (1 = paper) at frame mm. */
export function markFn(kind: MarkKind, seed: number, inkLum = INK.violet): (x: number, y: number) => number {
  const r = mulberry32(seed);
  const cx = THUMB_GUIDE.cx + (r() - 0.5) * 6, cy = THUMB_GUIDE.cy + (r() - 0.5) * 3;
  if (kind === 'empty') return () => 1;
  if (kind === 'thumb') {
    const rx = 7 + r() * 1.6, ry = 9 + r() * 1.4, a = (r() - 0.5) * 0.6, per = 0.45 + r() * 0.2, crease = 1.9 + r() * 0.6;
    const ca = Math.cos(a), sa = Math.sin(a);
    return (x, y) => {
      const u = ((x - cx) * ca + (y - cy) * sa) / rx, v = (-(x - cx) * sa + (y - cy) * ca) / ry;
      const d = Math.hypot(u, v);
      if (d > 1) return 1;
      const press = Math.min(1, (1 - d ** 4) * 2);
      // loop ridges (0.45–0.65 mm) and the coarser flow of the print (light creases every ~2 mm along the loops)
      const loop = Math.hypot(u * rx, (v + 0.35) * ry * 0.8);
      const ridge = Math.sin((2 * Math.PI * loop) / per) > -0.45 ? 1 : 0.55; // ink spreads: ridges wider than valleys
      const flow = Math.abs(Math.sin((Math.PI * loop) / crease)) > 0.82 ? 0.45 : 1;
      return 1 - (1 - inkLum) * press * ridge * flow;
    };
  }
  if (kind === 'smudge') {
    const rx = 8 + r() * 3, ry = 6 + r() * 3, a = r() * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    return (x, y) => {
      const u = ((x - cx) * ca + (y - cy) * sa) / rx, v = (-(x - cx) * sa + (y - cy) * ca) / ry;
      const d = Math.hypot(u, v);
      return d > 1 ? 1 : 1 - (1 - inkLum) * Math.min(1, (1 - d) * 5);
    };
  }
  // signature: two cursive strokes about 0.6 mm wide across ~26 mm
  const x0 = cx - 13, amp = 2 + r() * 1.5, f1 = 0.5 + r() * 0.3, ph = r() * 6;
  const pts: [number, number][] = [];
  for (let t = 0; t <= 1; t += 0.004) {
    const x = x0 + 26 * t;
    pts.push([x, cy - 1 + amp * Math.sin(f1 * x + ph) + 1.2 * Math.sin(3.1 * x)]);
  }
  for (let t = 0; t <= 1; t += 0.008) pts.push([x0 + 4 + 14 * t, cy + 4 + 0.8 * Math.sin(2.3 * (x0 + 14 * t))]);
  return (x, y) => {
    if (Math.abs(y - cy) > 8 || x < x0 - 1 || x > x0 + 27) return 1;
    for (const [px, py] of pts) if ((x - px) ** 2 + (y - py) ** 2 < 0.2) return inkLum; // a 0.9 mm gel-pen line
    return 1;
  };
}

export interface ReceiptCase {
  role: Role; kind: MarkKind; ink: keyof typeof INK; seed: number;
  rot: number; ppm: number; blur: number; light: number; jpeg: boolean;
  glare?: boolean; finger?: boolean; punched?: string[];
}

export function receiptPhoto(spec: CardSpec, bmp: Bitmap, c: ReceiptCase): { img: RGBAImage; scene: Scene } {
  const o = c.role === 'S' ? STOCK_ORIGIN : FOIL_ORIGIN;
  const base = inkFromBitmap(bmp, o.x, o.y);
  const mark = markFn(c.kind, c.seed, INK[c.ink]);
  const scene = renderHalf(
    { spec, role: c.role, punched: c.punched ?? ['d3', 'd4', 'a1'], ink: (x, y) => base(x, y) * mark(x, y) },
    {
      seed: c.seed, pxPerMm: c.ppm, rotationDeg: c.rot, tiltXDeg: 3, tiltYDeg: -2, blur: c.blur, noise: 0.01, light: c.light, lightAngleDeg: 30,
      background: 0.12, view: { x0: -6, y0: -6, x1: FRAME_W + 6, y1: FRAME_H + (c.role === 'S' ? 26 : 6) },
      fingers: c.finger ? [{ x: 166, y: 96, r: 9, lum: 0.55 }] : undefined,
    },
  );
  let img: RGBAImage = { width: scene.width, height: scene.height, data: scene.data };
  if (c.glare) img = glareAt(img, scene, THUMB_GUIDE.cx + 2, THUMB_GUIDE.cy, 8);
  if (c.jpeg) img = jpegLike(img, 0.6);
  return { img, scene };
}

// ---------------- property shards ----------------
import fc from 'fast-check';
import { scanImage } from '../src/vision/detect';
import { recordedCard, sheetWithText } from './cameraPhotos';

export type Truth = 'thumb' | 'signature' | 'smudge' | 'empty' | 'glare' | 'finger';
let specC: CardSpec | null = null, bmpC: Bitmap | null = null;
export const rSpec = () => (specC ??= recordedCard({ pairing: false }));
export const rBmp = () => (bmpC ??= sheetWithText(rSpec()));

export function receiptShard(seed: number, numRuns = 50) {
  const spec = rSpec(), bmp = rBmp();
  const st: Record<Truth, { n: number; ok: number }> = { thumb: { n: 0, ok: 0 }, signature: { n: 0, ok: 0 }, smudge: { n: 0, ok: 0 }, empty: { n: 0, ok: 0 }, glare: { n: 0, ok: 0 }, finger: { n: 0, ok: 0 } };
  let falsePresent = 0;
  const truthArb = fc.oneof(
    { weight: 8, arbitrary: fc.constant<Truth>('thumb') }, { weight: 3, arbitrary: fc.constant<Truth>('signature') },
    { weight: 4, arbitrary: fc.constant<Truth>('empty') }, { weight: 2, arbitrary: fc.constant<Truth>('smudge') },
    { weight: 2, arbitrary: fc.constant<Truth>('glare') }, { weight: 1, arbitrary: fc.constant<Truth>('finger') },
  );
  fc.assert(fc.property(fc.record({
    truth: truthArb, ink: fc.constantFrom<keyof typeof INK>('violet', 'blue', 'black'), role: fc.constantFrom<Role>('S', 'F'),
    rot: fc.integer({ min: -10, max: 10 }), ppm: fc.double({ min: 3, max: 4, noNaN: true }), light: fc.double({ min: 0, max: 0.35, noNaN: true }),
    seed: fc.integer({ min: 1, max: 1e6 }),
  }), (c) => {
    const kind: MarkKind = c.truth === 'glare' ? 'thumb' : c.truth === 'finger' ? 'empty' : c.truth;
    const { img } = receiptPhoto(spec, bmp, { role: c.role, kind, ink: c.ink, seed: c.seed, rot: c.rot, ppm: c.ppm, blur: 1.5, light: c.light, jpeg: true, glare: c.truth === 'glare', finger: c.truth === 'finger' });
    const r = scanImage(img).halves[0]?.receipt;
    st[c.truth].n++;
    const ok = c.truth === 'empty' ? r?.status === 'absent'
      : c.truth === 'glare' || c.truth === 'finger' ? r?.status === 'unclear'
      : r?.status === 'present' && r.kind === c.truth;
    if (ok) st[c.truth].ok++;
    if (c.truth === 'empty' && r?.status === 'present') { falsePresent++; throw new Error('an empty box read as present'); }
  }), { numRuns, seed });
  return { ...st, falsePresent };
}
