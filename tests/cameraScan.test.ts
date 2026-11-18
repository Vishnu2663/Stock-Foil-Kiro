// The laptop-webcam recording, reproduced: the REAL printed sheet, a worker half with days 4, 5, 6 and
// advances 1, 2 punched, photographed tilted, skewed, blurred, unevenly lit, filling the frame with fingers
// on the side margins, against a dark and a white background.
import { describe, expect, it } from 'vitest';
import { scanImage, type HalfScan } from '../src/vision/detect';
import { captureBlocker } from '../src/vision/capture';
import { verifyPair } from '../src/vision/pair';
import { encodePayload } from '../src/core/card';
import { qrMatrix } from '../src/render/sheet';
import { inkFromBitmap } from '../src/render/rasterSvg';
import { renderHalf } from '../src/render/scene';
import { FIDUCIALS, FID_SIZE, QR_BOX, STOCK_ORIGIN, targetsFor } from '../src/core/layout';
import { cameraPhoto, recordedCard, sheetWithText, textBands, FINGERS, RECORDED_PUNCHES } from './cameraPhotos';
import { sorted } from './helpers';

const TILTS = [-6, 0, 6];
const read = (h: HalfScan) => sorted(h.cells.filter((c) => c.punched).map((c) => c.key));
const unsure = (h: HalfScan) => h.cells.filter((c) => c.unsure).map((c) => c.key);

function scanOne(...args: Parameters<typeof cameraPhoto>): HalfScan {
  const res = scanImage(cameraPhoto(...args));
  expect(res.halves.length).toBe(1);
  return res.halves[0];
}

describe('payday-scan: the webcam recording', () => {
  const spec = recordedCard({ pairing: false });
  const bmp = sheetWithText(spec);

  for (const rotationDeg of TILTS) {
    it(`dark background, tilt ${rotationDeg}°: 4/4 corners (top-left too), days 4,5,6 + advances 1,2 exactly, nothing unsure, capture allowed`, () => {
      for (const [pxPerMm, blur] of [[3, 1.5], [3.6, 1.5]]) {
        const h = scanOne(spec, 'S', RECORDED_PUNCHES, { rotationDeg, background: 0.12, pxPerMm, blur }, bmp);
        expect(h.pose.fiducialsFound).toBe(4);
        expect(h.pose.fiducials[0]).not.toBeNull(); // top-left
        expect(read(h)).toEqual(sorted(RECORDED_PUNCHES));
        expect(unsure(h)).toEqual([]);
        expect(captureBlocker(h)).toBeNull();
      }
    });
  }

  it('a sheet bent by up to 7 mm at the top-left still gives 4/4 and an exact reading', () => {
    for (const bend of [3, 7]) {
      const h = scanOne(spec, 'S', RECORDED_PUNCHES, { rotationDeg: -6, background: 0.12, pxPerMm: 3.6, blur: 1.5, bend }, bmp);
      expect(h.pose.fiducialsFound).toBe(4);
      expect(read(h)).toEqual(sorted(RECORDED_PUNCHES));
      expect(captureBlocker(h)).toBeNull();
    }
  });

  it("filling the frame gives the 'partial' warning, and it never blocks capture", () => {
    const h = scanOne(spec, 'S', RECORDED_PUNCHES, { rotationDeg: 0, background: 0.12, pxPerMm: 3.6, blur: 1.5 }, bmp);
    expect(h.warnings).toContain('partial');
    expect(captureBlocker(h)).toBeNull();
  });

  for (const rotationDeg of TILTS) {
    it(`white background, tilt ${rotationDeg}°: no "everything unsure"; the app asks for a dark surface`, () => {
      const h = scanOne(spec, 'S', RECORDED_PUNCHES, { rotationDeg, background: 0.97, pxPerMm: 3.6, blur: 1.5 }, bmp);
      expect(h.pose.fiducialsFound).toBe(4);
      // A white wall seen through a hole is as bright as the paper, so the hole cannot be seen at all.
      // The cells are still read normally (no blanket "unsure"), and the warning says what to do.
      expect(unsure(h).length).toBeLessThan(h.cells.length);
      expect(h.warnings).toContain('dark-surface');
    });
  }

  it('a mid-grey table does not make every cell unsure', () => {
    const h = scanOne(spec, 'S', RECORDED_PUNCHES, { rotationDeg: 3, background: 0.5, pxPerMm: 3.6, blur: 1.5 }, bmp);
    expect(unsure(h).length).toBeLessThan(h.cells.length / 2);
  });

  it('a grey-disc card on a WHITE background reads exactly (the disc is gone where punched)', () => {
    const d = recordedCard({ pairing: false, discs: true });
    for (const rotationDeg of TILTS) {
      const h = scanOne(d, 'S', RECORDED_PUNCHES, { rotationDeg, background: 0.97, pxPerMm: 3.6, blur: 1.5 });
      expect(h.pose.fiducialsFound).toBe(4);
      expect(read(h)).toEqual(sorted(RECORDED_PUNCHES));
      expect(unsure(h)).toEqual([]);
      expect(captureBlocker(h)).toBeNull();
    }
  });

  it('a half-day card reads both circles of each date exactly', () => {
    const hd = recordedCard({ pairing: false, halves: true });
    const punched = ['d4a', 'd4b', 'd5a', 'd6b', 'a1', 'a2'];
    for (const rotationDeg of TILTS) {
      const h = scanOne(hd, 'S', punched, { rotationDeg, background: 0.12, pxPerMm: 3.6, blur: 1.5 });
      expect(h.pose.fiducialsFound).toBe(4);
      expect(read(h)).toEqual(sorted(punched));
      expect(unsure(h)).toEqual([]);
    }
  });

  it('a paired card: both halves captured in the camera case give a genuine pair worth 3 days − 2 advances', () => {
    const p = recordedCard({ pairing: true });
    const pb = sheetWithText(p);
    const s = scanOne(p, 'S', RECORDED_PUNCHES, { rotationDeg: -6, background: 0.12, pxPerMm: 3.6, blur: 1.5 }, pb);
    const f = scanOne(p, 'F', RECORDED_PUNCHES, { rotationDeg: 6, background: 0.12, pxPerMm: 3.6, blur: 1.5, seed: 12 }, pb);
    expect(captureBlocker(s)).toBeNull();
    expect(captureBlocker(f)).toBeNull();
    const r = verifyPair(s, f);
    expect(r.verdict).toBe('genuine-consistent');
    expect(r.pay!.agreed.net).toBe(3 * 70000 - 2 * 10000);
  });

  it('when the QR is too blurred to decode, the app still sees the card and says to move closer', () => {
    const res = scanImage(cameraPhoto(spec, 'S', RECORDED_PUNCHES, { rotationDeg: 0, background: 0.12, pxPerMm: 3, blur: 2.4 }, bmp));
    expect(res.halves.length).toBe(0);
    expect(res.squaresSeen ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('cards printed before the QR filled its box (1-module margin) still scan exactly', () => {
    const n = qrMatrix(encodePayload(spec, 'S')).size;
    const ink = inkFromBitmap(bmp, STOCK_ORIGIN.x, STOCK_ORIGIN.y);
    const cx = QR_BOX.x + QR_BOX.size / 2, cy = QR_BOX.y + QR_BOX.size / 2, k = (n + 2) / n;
    const mo = QR_BOX.size / (n + 2);
    const oldInk = (x: number, y: number) => {
      const inBox = x >= QR_BOX.x && x <= QR_BOX.x + QR_BOX.size && y >= QR_BOX.y && y <= QR_BOX.y + QR_BOX.size;
      if (!inBox) return ink(x, y);
      const inSym = x >= QR_BOX.x + mo && x <= QR_BOX.x + QR_BOX.size - mo && y >= QR_BOX.y + mo && y <= QR_BOX.y + QR_BOX.size - mo;
      return inSym ? ink(cx + (x - cx) * k, cy + (y - cy) * k) : 1;
    };
    for (const rotationDeg of TILTS) {
      const sc = renderHalf({ spec, role: 'S', punched: RECORDED_PUNCHES, ink: oldInk }, { seed: 4, pxPerMm: 3.6, blur: 1.2, rotationDeg, tiltXDeg: 4, background: 0.12, fingers: FINGERS, view: { x0: -5, y0: -5, x1: 191, y1: 146 } });
      const h = scanImage(sc).halves[0];
      expect(h.pose.fiducialsFound).toBe(4);
      expect(read(h)).toEqual(sorted(RECORDED_PUNCHES));
    }
  });

  it('every printed text line keeps at least 4 mm of clear paper from every corner square', () => {
    for (const role of ['S', 'F'] as const) for (const b of textBands(spec, role)) for (const [fx, fy] of FIDUCIALS) {
      const h = FID_SIZE / 2;
      const gapX = Math.max(b.x - (fx + h), fx - h - (b.x + b.w), 0);
      const gapY = Math.max(b.y - (fy + h), fy - h - (b.y + b.h), 0);
      expect(Math.hypot(gapX, gapY)).toBeGreaterThanOrEqual(4 - 1e-9);
    }
    // the day grid and the advance row too
    for (const tg of targetsFor(spec)) for (const [fx, fy] of FIDUCIALS) {
      const c = tg.cell, h = FID_SIZE / 2;
      const gapX = Math.max(c.x - (fx + h), fx - h - (c.x + c.w), 0);
      const gapY = Math.max(c.y - (fy + h), fy - h - (c.y + c.h), 0);
      expect(Math.hypot(gapX, gapY)).toBeGreaterThanOrEqual(4 - 1e-9);
    }
  });
});

describe('payday-scan: the capture rule', () => {
  const spec = recordedCard({ pairing: false });
  const base = scanOne(spec, 'S', RECORDED_PUNCHES, { rotationDeg: 0, background: 0.12, pxPerMm: 3.6, blur: 1.5 });
  const mod = (f: (h: HalfScan) => void) => { const h: HalfScan = structuredClone(base); f(h); return captureBlocker(h); };

  it('blocks only for: surface, corners < 4, a hidden spot, < 2.5 px/mm, paper ≤ 0.15 — in that order', () => {
    expect(captureBlocker(base)).toBeNull();
    expect(mod((h) => { h.ambiguousSurface = true; h.pose.fiducialsFound = 2; })?.code).toBe('surface');
    expect(mod((h) => { h.pose.fiducialsFound = 3; h.pose.fiducials[0] = null; h.cells[0].ratio = NaN; })).toMatchObject({ code: 'corners', found: 3, missed: ['top-left'] });
    expect(mod((h) => { h.cells[0].ratio = NaN; h.pose.pxPerMm = 2; })?.code).toBe('hidden');
    expect(mod((h) => { h.pose.pxPerMm = 2.49; h.paperRef = 10; })?.code).toBe('far');
    expect(mod((h) => { h.paperRef = 0.15 * 255; })?.code).toBe('dark');
    expect(mod((h) => { h.paperRef = 0.151 * 255; })).toBeNull();
  });

  it('never blocks on partial, a hidden cut edge, a background or surface warning, or unsure cells', () => {
    expect(mod((h) => { h.warnings = ['partial', 'edge-hidden', 'dark-surface', 'edge-surface', 'low-contrast', 'blurry', 'far']; h.cells[3].unsure = true; })).toBeNull();
  });
});
