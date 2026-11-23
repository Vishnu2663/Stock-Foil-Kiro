// One simulated phone frame of the real printed sheet, and how the scanner did on it. Shared by the phone tests.
import fc from 'fast-check';
import { scanImage, scanLive, T, type ScanResult } from '../src/vision/detect';
import { sharpness, BLUR_MIN } from '../src/vision/quality';
import { renderHalf } from '../src/render/scene';
import { inkFromBitmap, type Bitmap } from '../src/render/rasterSvg';
import { STOCK_ORIGIN, FOIL_ORIGIN, FRAME_W, FRAME_H, targetsFor } from '../src/core/layout';
import type { CardSpec, Role } from '../src/core/card';
import { FINGERS } from './cameraPhotos';
import { motionBlur, jpegLike, dim, glareAt } from './phoneSim';
import type { RGBAImage } from '../src/vision/image';

export interface PhoneCase {
  role: Role; punched: string[]; rot: number; tx: number; ty: number; ppm: number; blur: number; bg: number;
  jpeg: boolean; motion: boolean; dim: boolean; glare: number | null; seed: number;
}

export const phoneCaseArb = (spec: CardSpec): fc.Arbitrary<PhoneCase> => {
  const keys = targetsFor(spec).map((t) => t.key);
  return fc.record({
    role: fc.constantFrom<Role>('S', 'F'),
    punched: fc.subarray(keys, { maxLength: 12 }),
    rot: fc.integer({ min: -12, max: 12 }),
    tx: fc.integer({ min: -7, max: 7 }),
    ty: fc.integer({ min: -7, max: 7 }),
    ppm: fc.double({ min: 3, max: 4, noNaN: true }),
    blur: fc.double({ min: 1, max: 1.5, noNaN: true }),
    bg: fc.constantFrom(0.12, 0.2, 0.3),
    jpeg: fc.boolean(),
    motion: fc.boolean(),
    dim: fc.boolean(),
    glare: fc.option(fc.integer({ min: 0, max: keys.length - 1 }), { freq: 3 }),
    seed: fc.integer({ min: 1, max: 1e6 }),
  });
};

export interface PhoneOutcome { read: boolean; skippedBlur: boolean; wrongSure: string[]; unsure: string[]; glareKey?: string; glareOk: boolean; sharp: number }

export function phoneFrame(spec: CardSpec, bmp: Bitmap, c: PhoneCase): { img: RGBAImage; glareKey?: string } {
  const origin = c.role === 'S' ? STOCK_ORIGIN : FOIL_ORIGIN;
  const scene = renderHalf(
    { spec, role: c.role, punched: c.punched, ink: inkFromBitmap(bmp, origin.x, origin.y) },
    {
      seed: c.seed, pxPerMm: c.ppm, rotationDeg: c.rot, tiltXDeg: c.tx, tiltYDeg: c.ty, blur: c.blur, noise: 0.012,
      light: 0.25, lightAngleDeg: 45, background: c.bg, fingers: FINGERS,
      view: { x0: -6, y0: -6, x1: FRAME_W + 6, y1: FRAME_H + (c.role === 'S' ? 26 : 6) },
    },
  );
  let img: RGBAImage = { width: scene.width, height: scene.height, data: scene.data };
  let glareKey: string | undefined;
  if (c.dim) img = dim(img, 0.4); // dim light first: a reflection still saturates
  if (c.glare !== null) {
    const t = targetsFor(spec)[c.glare];
    glareKey = t.key;
    img = glareAt(img, scene, t.cx + 0.4, t.cy - 0.3, 3.2);
  }
  if (c.motion) img = motionBlur(img, 3, c.seed % 180);
  if (c.jpeg) img = jpegLike(img, 0.6);
  return { img, glareKey };
}

/** Run one case. `glareCheck: false` reads like the scanner did before the glare rule (for the before/after numbers).
 *  `path`: 'full' (photo import, Capture now), 'live' (live camera, first find) or 'tracked' (live, QR seen last frame). */
export function runPhoneCase(spec: CardSpec, bmp: Bitmap, c: PhoneCase, glareCheck = true, path: 'full' | 'live' | 'tracked' = 'full'): PhoneOutcome {
  const { img, glareKey } = phoneFrame(spec, bmp, c);
  const scan = (): ScanResult => {
    if (path === 'full') return scanImage(img);
    const first = scanLive(img);
    return path === 'live' || !first.halves.length ? first : scanLive(img, { hint: { qr: first.halves.map((h) => h.qr.corners) } });
  };
  const sharp = sharpness(img);
  const keep = T.glareShare;
  if (!glareCheck) (T as { glareShare: number }).glareShare = 2;
  let res;
  try { res = scan(); } finally { (T as { glareShare: number }).glareShare = keep; }
  const h = res.halves.find((x) => x.decoded.role === c.role);
  if (!h) return { read: false, skippedBlur: sharp < BLUR_MIN, wrongSure: [], unsure: [], glareKey, glareOk: true, sharp };
  const truth = new Set(c.punched);
  const wrongSure = h.cells.filter((x) => !x.unsure && x.punched !== truth.has(x.key)).map((x) => x.key);
  const unsure = h.cells.filter((x) => x.unsure).map((x) => x.key);
  const gc = glareKey ? h.cells.find((x) => x.key === glareKey) : undefined;
  const glareOk = !gc || gc.unsure || gc.punched === truth.has(gc.key);
  return { read: true, skippedBlur: sharp < BLUR_MIN, wrongSure, unsure, glareKey, glareOk, sharp };
}

/** 50 property runs of simulated phone frames (one shard; four shards make the 200 runs and run in parallel). */
export function phoneShard(seed: number, numRuns = 50): { reads: number; frames: number; wrong: number; glareCases: number; beforeWrong: number; liveReads: number; liveWrong: number } {
  const spec = phoneSpec();
  const bmp = phoneBmp();
  const before = typeof process !== 'undefined' && process.env.PHONE_BEFORE === '1';
  const stats = { reads: 0, frames: 0, wrong: 0, glareCases: 0, beforeWrong: 0, liveReads: 0, liveWrong: 0 };
  fc.assert(fc.property(phoneCaseArb(spec), (c) => {
    const o = runPhoneCase(spec, bmp, c);
    stats.frames++;
    if (o.read) stats.reads++;
    if (o.glareKey) stats.glareCases++;
    if (o.wrongSure.length) stats.wrong++;
    if (before && runPhoneCase(spec, bmp, c, false).wrongSure.length) stats.beforeWrong++;
    // never a false or a missed punch: every spot is right or marked unsure
    if (o.wrongSure.length) throw new Error(`wrong and sure: ${o.wrongSure.join(',')}`);
    if (!o.glareOk) throw new Error(`glare on ${o.glareKey} not unsure`);
    // a frame that reads is never thrown away as blurred
    if (o.read && o.skippedBlur) throw new Error(`readable frame skipped as blurred (sharpness ${o.sharp.toFixed(1)})`);
    // the live camera path: never a wrong-and-sure spot, glare still unsure (first find and tracked)
    for (const path of ['live', 'tracked'] as const) {
      const l = runPhoneCase(spec, bmp, c, true, path);
      if (path === 'live' && l.read) stats.liveReads++;
      if (l.wrongSure.length) { stats.liveWrong++; throw new Error(`${path} path: wrong and sure: ${l.wrongSure.join(',')}`); }
      if (!l.glareOk) throw new Error(`${path} path: glare on ${l.glareKey} not unsure`);
    }
  }), { numRuns, seed });
  return stats;
}

let specC: CardSpec | null = null, bmpC: Bitmap | null = null;
import { recordedCard, sheetWithText } from './cameraPhotos';
export const phoneSpec = () => (specC ??= recordedCard({ pairing: false }));
export const phoneBmp = () => (bmpC ??= sheetWithText(phoneSpec()));
