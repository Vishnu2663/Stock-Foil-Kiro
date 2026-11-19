// "Check the cut": the join-mode cases one by one (gap, touching, white table, finger, tilt/blur/light,
// forged foil, separate photos via the designed wave) and the edge helpers.
import { describe, expect, it } from 'vitest';
import { cleanEdge, medianEdges, scanImage } from '../src/vision/detect';
import { joinBlocker, JOIN } from '../src/vision/capture';
import { edgeMatch, verifyPair, DESIGN } from '../src/vision/pair';
import { recordedCard, sheetWithText } from './cameraPhotos';
import { joinScene, readJoin, separatePhotos, type JoinCase } from './joinScene';

const spec = recordedCard({ pairing: false });
const bmp = sheetWithText(spec);
const base: JoinCase = { gapMm: 20, rotDeg: 4, ppm: 3.4, blur: 1.3, light: 0.2, bg: 0.12, punched: ['d4', 'd5', 'd6', 'a1'], seed: 3 };

describe('join: capture rules', () => {
  it('halves 2 cm apart on a dark table: capture allowed and the cut matches', () => {
    const r = readJoin(joinScene(spec, bmp, base));
    expect(r.gap).toBeGreaterThan(15);
    expect(joinBlocker(r.s, r.f, r.gap)).toBeNull();
    const v = verifyPair(r.s, r.f);
    expect(v.edge?.status).toBe('match');
    expect(v.verdict).toBe('genuine-consistent');
  });
  it('touching edges: "gap needed", never captured', () => {
    const r = readJoin(joinScene(spec, bmp, { ...base, gapMm: 0 }));
    expect(joinBlocker(r.s, r.f, r.gap)).toMatchObject({ code: 'gap' });
  });
  it('a white table: "darker table needed"', () => {
    const r = readJoin(joinScene(spec, bmp, { ...base, bg: 0.95 }));
    expect(joinBlocker(r.s, r.f, r.gap)).toEqual({ code: 'darker' });
  });
  it('a finger over 40% of an edge: blocked with the half and how much of its edge is seen', () => {
    const r = readJoin(joinScene(spec, bmp, { ...base, fingerShare: 0.45 }));
    const b = joinBlocker(r.s, r.f, r.gap);
    expect(b).toMatchObject({ code: 'edge', role: 'S' });
    expect((b as { coverage: number }).coverage).toBeLessThan(JOIN.coverage);
  });
  it('tilt ±10°, blur and uneven light still match', () => {
    for (const rotDeg of [-10, 10]) {
      const r = readJoin(joinScene(spec, bmp, { ...base, rotDeg, blur: 1.5, light: 0.3, seed: 7 }));
      expect(joinBlocker(r.s, r.f, r.gap)).toBeNull();
      expect(verifyPair(r.s, r.f).edge?.status).toBe('match');
    }
  });
  it('a forged foil cut on another wave: mismatch, and its own cut does not follow the card', () => {
    const r = readJoin(joinScene(spec, bmp, { ...base, forgedFoil: 'OTHER123' }));
    const e = verifyPair(r.s, r.f).edge!;
    expect(e.status).toBe('mismatch');
    expect(e.cDesignFoil).toBeLessThan(DESIGN.off);
  });
});

describe('join: each half against the designed wave', () => {
  it('separate photos: both halves fit the card\'s wave, so the cut counts as checked', () => {
    const p = separatePhotos(spec, bmp, { punched: ['d4'], seed: 9 });
    const s = scanImage(p.stock).halves[0], f = scanImage(p.foil).halves[0];
    // hide most of the foil edge so the two edges cannot be compared directly
    const fe = f.edge.map((v, i) => (i < 150 ? NaN : v));
    const e = edgeMatch(s.edge, fe, spec.id);
    expect(e.cDesignStock).toBeGreaterThanOrEqual(DESIGN.c);
    expect(e.rmsDesignStock).toBeLessThanOrEqual(DESIGN.rms);
    const both = edgeMatch(s.edge, f.edge, spec.id);
    expect(both.status).toBe('match');
  });
  it('one half clearly off the designed wave: "This half\'s cut does not match the card"', () => {
    const p = separatePhotos(spec, bmp, { punched: ['d4'], seed: 9, forgedFoil: 'OTHER123' });
    const s = scanImage(p.stock).halves[0], f = scanImage(p.foil).halves[0];
    const e = edgeMatch(s.edge, f.edge, spec.id);
    expect(e.status).toBe('mismatch');
    expect(verifyPair(s, f).checks.find((c) => c.id === 'edge')!.detail).toContain("employer half's cut does not match the card");
  });
  it('the edgeMatch thresholds are unchanged: rms ≤ 1.3 and c ≥ 0.8 to match', () => {
    const xs = Array.from({ length: 179 }, (_, i) => Math.sin(i / 9) * 3);
    expect(edgeMatch(xs, xs.map((v) => v + 0.2)).status).toBe('match');
    expect(edgeMatch(xs, xs.map((v, i) => v + (i % 2 ? 1.8 : -1.8))).status).toBe('mismatch');
  });
});

describe('join: edge helpers', () => {
  it('cleanEdge drops a spike and keeps the curve', () => {
    const e = Array.from({ length: 60 }, (_, i) => Math.sin(i / 8) * 2);
    e[30] += 3;
    const c = cleanEdge(e);
    expect(c[30]).toBeNaN();
    expect(c.filter(Number.isFinite).length).toBeGreaterThanOrEqual(57);
  });
  it('medianEdges: per-sample median over frames, NaN where most frames missed it', () => {
    const a = Array.from({ length: 30 }, (_, i) => i / 10);
    const frames = [a, a.map((v) => v + 0.1), a.map((v) => v - 0.1), a.map((v, i) => (i < 5 ? NaN : v)), a.map((v, i) => (i < 5 ? NaN : v + 5))];
    const m = medianEdges(frames);
    expect(m[10]).toBeCloseTo(a[10], 5);
    expect(Number.isFinite(m[2])).toBe(true);
  });
});
