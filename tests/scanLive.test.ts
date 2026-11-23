// scanner-speed: the live camera path must read EXACTLY what the full path reads (same card, same punches, same
// unsure cells, same received mark), while tracking, after a card swap and with or without the browser's detector.
import { describe, expect, it } from 'vitest';
import { scanImage, scanLive, liveQRs, findQRs, type HalfScan, type CellReading } from '../src/vision/detect';
import { toGray } from '../src/vision/image';
import { newTrack, updateTrack, hintOf, TRACK_MAX_MISSES } from '../src/vision/track';
import { locateQRs, resetQrDetector } from '../src/vision/qr';
import { streakNeeded, CLEAR_MARGIN } from '../src/vision/quality';
import { cameraPhoto, recordedCard, sheetWithText, RECORDED_PUNCHES } from './cameraPhotos';
import { liveFrame, emptyFrame } from './liveFrames';
import { receiptPhoto, rSpec, rBmp } from './receiptSim';
import type { RGBAImage } from '../src/vision/image';

const reading = (h?: HalfScan) => (h ? [h.decoded.raw, h.cells.map((c) => `${c.key}${c.punched ? 'P' : ''}${c.unsure ? 'U' : ''}`).join(','), h.receipt?.status, h.receipt?.kind, h.pose.fiducialsFound].join('|') : 'none');
const spec = recordedCard({ pairing: false });
const bmp = sheetWithText(spec);

/** Move every pixel of a frame by (dx, dy), filling with the table colour: a hand-held card between two frames. */
function shift(img: RGBAImage, dx: number, dy: number): RGBAImage {
  const { width: w, height: h } = img, out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < w * h; i++) { out[i * 4] = 31; out[i * 4 + 1] = 30; out[i * 4 + 2] = 28; out[i * 4 + 3] = 255; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x + dx, Y = y + dy;
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    const s = (y * w + x) * 4, d = (Y * w + X) * 4;
    out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2];
  }
  return { width: w, height: h, data: out };
}

describe('scanner-speed: the live path reads exactly what the full path reads', () => {
  it('webcam-recording photos (dark table, ±6° tilt, fingers, blur): same reading, first find and tracked', () => {
    for (const rotationDeg of [-6, 0, 6]) for (const pxPerMm of [3, 3.6]) {
      const img = cameraPhoto(spec, 'S', RECORDED_PUNCHES, { rotationDeg, background: 0.12, pxPerMm, blur: 1.5 }, bmp);
      const full = scanImage(img), live = scanLive(img);
      expect(live.halves.length).toBe(1);
      expect(reading(live.halves[0])).toBe(reading(full.halves[0]));
      const tracked = scanLive(img, { hint: { qr: [live.halves[0].qr.corners] } });
      expect(reading(tracked.halves[0])).toBe(reading(full.halves[0]));
    }
  });
  it('1600×900 live frames (both halves, ±12°): same reading; a card moved 12 px between frames is still followed', () => {
    for (const role of ['S', 'F'] as const) for (const rot of [-8, 12]) {
      const img = liveFrame(role, { rot, ppm: 5, blur: 1.3, seed: 3 + rot, ox: 180, oy: 12 });
      const full = scanImage(img), live = scanLive(img);
      expect(reading(live.halves[0])).toBe(reading(full.halves[0]));
      const moved = shift(img, 12, -8);
      const next = scanLive(moved, { hint: { qr: [live.halves[0].qr.corners] } });
      expect(reading(next.halves[0])).toBe(reading(scanImage(moved).halves[0]));
    }
  });
  it('the received mark reads the same on the live path', () => {
    for (const kind of ['thumb', 'empty', 'smudge'] as const) {
      const { img } = receiptPhoto(rSpec(), rBmp(), { role: 'S', kind, ink: 'violet', seed: 5, rot: 5, ppm: 3.6, blur: 1.2, light: 0.2, jpeg: true });
      expect(reading(scanLive(img).halves[0])).toBe(reading(scanImage(img).halves[0]));
    }
  });
  it('no card: nothing found, and the square count is still reported', () => {
    const r = scanLive(emptyFrame(7));
    expect(r.halves).toEqual([]);
    expect(r.squaresSeen).toBeDefined();
  });
});

describe('scanner-speed: tracking never assumes the card', () => {
  it('a different card shown where the tracked one was is decoded as the different card', () => {
    const a = liveFrame('S', { rot: 0, ppm: 5, blur: 1.2, seed: 1, ox: 180, oy: 12 });
    const other = recordedCard({ pairing: false });
    const otherSpec = { ...other, id: 'B0THER12' };
    const b = cameraPhoto(otherSpec, 'S', ['d1', 'd2'], { rotationDeg: 0, background: 0.12, pxPerMm: 3.6, blur: 1.2 }, sheetWithText(otherSpec));
    const first = scanLive(a);
    // the hint says "card A was here"; the frame now shows card B
    const next = scanLive(b, { hint: { qr: [first.halves[0].qr.corners] } });
    expect(next.halves[0].decoded.spec.id).toBe('B0THER12');
    expect(next.halves[0].cells.filter((c) => c.punched).map((c) => c.key).sort()).toEqual(['d1', 'd2']);
  });
  it('the tracker follows, keeps the window for one miss, then drops it and the whole frame is searched', () => {
    let s = newTrack();
    expect(hintOf(s)).toBeUndefined();
    s = updateTrack(s, [[[0, 0], [10, 0], [10, 10], [0, 10]]]);
    expect(hintOf(s)!.qr).toHaveLength(1);
    s = updateTrack(s, []);
    expect(hintOf(s)).toBeDefined();
    for (let i = 1; i < TRACK_MAX_MISSES; i++) s = updateTrack(s, []);
    expect(hintOf(s)).toBeUndefined();
    s = updateTrack(s, [[[5, 5], [15, 5], [15, 15], [5, 15]]]);
    expect(s.misses).toBe(0);
  });
  it('a stale hint far from the card does not stop the card from being found', () => {
    const img = liveFrame('F', { rot: 4, ppm: 5, blur: 1.2, seed: 2, ox: 200, oy: 12 });
    const r = scanLive(img, { hint: { qr: [[[1500, 800], [1560, 800], [1560, 860], [1500, 860]]] } });
    expect(reading(r.halves[0])).toBe(reading(scanImage(img).halves[0]));
  });
});

describe('scanner-speed: the browser QR detector only locates', () => {
  const img = liveFrame('S', { rot: 6, ppm: 5, blur: 1.3, seed: 4, ox: 170, oy: 10 });
  const qr = findQRs(toGray(img), 1)[0];
  const xs = qr.corners.map((p) => p[0]), ys = qr.corners.map((p) => p[1]);
  const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  class FakeDetector {
    static getSupportedFormats = async () => ['qr_code', 'ean_13'];
    constructor(public o: { formats: string[] }) {}
    async detect() { return [{ rawValue: qr.data, boundingBox: box }]; }
  }
  it('with BarcodeDetector: the located box gives the same reading as jsQR alone', async () => {
    resetQrDetector();
    const located = await locateQRs({}, 1, { BarcodeDetector: FakeDetector as never });
    expect(located).toHaveLength(1);
    expect(located[0].data).toBe(qr.data);
    const withNative = scanLive(img, { located });
    expect(reading(withNative.halves[0])).toBe(reading(scanImage(img).halves[0]));
    // the corners still come from jsQR inside that box
    expect(liveQRs(toGray(img), { located })[0].level).toBeGreaterThanOrEqual(0);
  });
  it('without BarcodeDetector, without qr_code support, or when it throws: nothing located, jsQR finds the card', async () => {
    resetQrDetector();
    expect(await locateQRs({}, 1, {})).toEqual([]);
    resetQrDetector();
    class NoQR { static getSupportedFormats = async () => ['ean_13']; async detect() { return []; } }
    expect(await locateQRs({}, 1, { BarcodeDetector: NoQR as never })).toEqual([]);
    resetQrDetector();
    class Broken { static getSupportedFormats = async () => ['qr_code']; async detect(): Promise<never> { throw new Error('busy'); } }
    expect(await locateQRs({}, 1, { BarcodeDetector: Broken as never })).toEqual([]);
    resetQrDetector();
    expect(reading(scanLive(img, {}).halves[0])).toBe(reading(scanImage(img).halves[0]));
  });
});

describe('scanner-speed: adaptive capture streak', () => {
  const half = (ratios: number[], unsure: number[] = []): HalfScan => ({
    decoded: { spec: { discs: false } }, grey: undefined,
    cells: ratios.map((ratio, i): CellReading => ({ key: 'd' + (i + 1), kind: 'day', n: i + 1, half: null, ratio, punched: ratio <= 0.62, unsure: unsure.includes(i) })),
  } as unknown as HalfScan);
  it('a clear card captures on 2 reads; a borderline or unsure cell still needs 3', () => {
    expect(streakNeeded(half([0.2, 0.95, 0.9, 0.3]), 3)).toBe(2);
    expect(streakNeeded(half([0.2, 0.62 + CLEAR_MARGIN - 0.01, 0.9]), 3)).toBe(3);
    expect(streakNeeded(half([0.2, 0.62 - CLEAR_MARGIN + 0.01]), 3)).toBe(3);
    expect(streakNeeded(half([0.2, 0.95], [1]), 3)).toBe(3);
    expect(streakNeeded(half([0.2, NaN]), 3)).toBe(3);
  });
  it('desktop (2) is unchanged and the calibrated threshold is used', () => {
    expect(streakNeeded(half([0.2, 0.7]), 2)).toBe(2);
    expect(streakNeeded(half([0.2, 0.95]), 3, 0.9)).toBe(3);
  });
  it('disc cards measure the distance from the hole line around the printed grey', () => {
    const disc = (ratios: number[]) => ({ ...half(ratios), decoded: { spec: { discs: true } }, grey: 0.62 } as unknown as HalfScan);
    expect(streakNeeded(disc([0.62, 0.2, 0.61]), 3)).toBe(2);
    expect(streakNeeded(disc([0.62, 0.62 + 0.15 + 0.03]), 3)).toBe(3);
  });
});
