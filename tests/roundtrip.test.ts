// Phase 4: the simulator is deterministic and returns the truth; print round-trip through the real SVG sheet.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { makeCard } from '../src/core/card';
import { renderHalf } from '../src/render/scene';
import { sheetSvg } from '../src/render/sheet';
import { rasterSheet, inkFromBitmap } from '../src/render/rasterSvg';
import { STOCK_ORIGIN, FOIL_ORIGIN } from '../src/core/layout';
import { scanImage } from '../src/vision/detect';
import { verifyPair } from '../src/vision/pair';
import { calibrationReport, suggestCalibration } from '../src/vision/calibrate';
import { makePdf } from '../src/render/pdf';
import { base32, photoRuns, runs, sorted } from './helpers';

describe('photo-simulator', () => {
  it('is deterministic per seed and returns the ground truth', () => {
    const spec = makeCard({ worker: 'A', employer: 'B', year: 2026, month: 4 }, 'AAAA2222');
    const a = renderHalf({ spec, role: 'S', punched: ['d1', 'd9'] }, { seed: 5, noise: 0.03, blur: 0.8, rotationDeg: 12 });
    const b = renderHalf({ spec, role: 'S', punched: ['d1', 'd9'] }, { seed: 5, noise: 0.03, blur: 0.8, rotationDeg: 12 });
    expect(a.width).toBe(b.width);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(sorted(a.truth.punched)).toEqual(['d1', 'd9']);
    const c = renderHalf({ spec, role: 'S', punched: ['d1', 'd9'] }, { seed: 6, noise: 0.03, blur: 0.8, rotationDeg: 12 });
    expect(Buffer.from(a.data).equals(Buffer.from(c.data))).toBe(false);
  });

  it('print round-trip: the real SVG sheet, rasterised, cut on its wave, punched, photographed and scanned', () => {
    fc.assert(
      fc.property(base32(8), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 1e6 }), (id, month, seed) => {
        const spec = makeCard({ worker: 'Asha Devi', employer: 'Kumar Builders', year: 2026, month }, id);
        const bmp = rasterSheet(sheetSvg(spec), 6);
        const punched = ['d2', 'd5', 'd8', 'd11', 'd14', 'a1'];
        const s = renderHalf({ spec, role: 'S', punched, ink: inkFromBitmap(bmp, STOCK_ORIGIN.x, STOCK_ORIGIN.y) }, { seed, rotationDeg: (seed % 30) - 15, blur: 0.7 });
        const f = renderHalf({ spec, role: 'F', punched, ink: inkFromBitmap(bmp, FOIL_ORIGIN.x, FOIL_ORIGIN.y) }, { seed: seed + 1, rotationDeg: (seed % 20) - 10, blur: 0.7 });
        const hs = scanImage(s).halves[0], hf = scanImage(f).halves[0];
        expect(hs && hf).toBeTruthy();
        expect(sorted(hs.cells.filter((c) => c.punched).map((c) => c.key))).toEqual(sorted(punched));
        const r = verifyPair(hs, hf);
        expect(r.verdict).toBe('genuine-consistent');
        expect(r.edge!.status).toBe('match');
      }),
      photoRuns(Math.max(3, Math.ceil(Number(process.env.SF_RUNS ?? 15) / 3))),
    );
  });
});

describe('calibrate', () => {
  it('the suggestion lies between punched and blank brightness, and it declines without data', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0.02, max: 0.5, noNaN: true }), { maxLength: 30 }), fc.array(fc.double({ min: 0.55, max: 1.1, noNaN: true }), { maxLength: 30 }), (p, b) => {
        const s = suggestCalibration(p, b, []);
        if (!p.length || !b.length) { expect(s).toBeNull(); return; }
        const med = (v: number[]) => { const x = [...v].sort((m, n) => m - n); const k = x.length >> 1; return x.length % 2 ? x[k] : (x[k - 1] + x[k]) / 2; };
        expect(s!.threshold!).toBeGreaterThan(med(p) - 1e-3);
        expect(s!.threshold!).toBeLessThan(med(b) + 1e-3);
      }),
      runs(200),
    );
    expect(calibrationReport([]).suggestion).toBeNull();
  });
});

describe('pdf', () => {
  it('writes a valid PDF skeleton with one page per image', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = new TextDecoder('latin1').decode(makePdf([{ jpeg, width: 10, height: 14 }, { jpeg, width: 10, height: 14 }]));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Count 2');
    expect(pdf.trim().endsWith('%%EOF')).toBe(true);
    const x = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(x, x + 4)).toBe('xref');
  });
});
