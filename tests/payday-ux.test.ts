// The payday scan's presentation: celebration level, whole-unit roll, overlay age, shared holes, motion scopes.
import { describe, expect, it } from 'vitest';
import { celebrationLevel, particleCount, rollValue, stampFor } from '../src/ui/celebrate';
import { createScope, revealPlan, confetti } from '../src/ui/anim';
import { drawablePose, POSE_MAX_AGE } from '../src/vision/capture';
import { verifyPair, type PairResult } from '../src/vision/pair';
import { scanImage } from '../src/vision/detect';
import { cameraPhoto, recordedCard, sheetWithText, RECORDED_PUNCHES } from './cameraPhotos';
import type { Verdict } from '../src/core/history';

const base = (verdict: Verdict, over: Partial<PairResult> = {}): PairResult => ({
  verdict,
  checks: ['stock', 'foil', 'id', 'code'].map((id) => ({ id, label: id, ok: true, detail: '' })),
  pairing: 'legacy', edge: null, align: null,
  comparison: { cells: [], consistent: true, unsureCount: 0, agreed: new Set(['d4']), stockOnly: new Set(), foilOnly: new Set() },
  pay: null, spec: null, poseOk: true, pairOk: true, minFiducials: 4, sharedPunched: 1, ...over,
});

describe('payday-ux: celebration level', () => {
  it('maps every verdict and the "cut not checked but everything matches" case', () => {
    expect(celebrationLevel(base('genuine-consistent'))).toBe('full');
    expect(celebrationLevel(base('paid'))).toBe('full');
    expect(celebrationLevel(base('inconclusive'))).toBe('match');
    expect(celebrationLevel(base('review'))).toBe('warn');
    expect(celebrationLevel(base('genuine-disputed'))).toBe('warn');
    expect(celebrationLevel(base('pair-mismatch'))).toBe('bad');
    expect(celebrationLevel(base('unreliable'))).toBe('none');
  });
  it('inconclusive is only MATCH when both halves, id, code and every punch agree and the pair is ok', () => {
    const off = (id: string) => base('inconclusive', { checks: base('inconclusive').checks.map((c) => (c.id === id ? { ...c, ok: false } : c)) });
    for (const id of ['stock', 'foil', 'id', 'code']) expect(celebrationLevel(off(id))).toBe('warn');
    expect(celebrationLevel(base('inconclusive', { comparison: { ...base('x' as Verdict).comparison!, consistent: false } }))).toBe('warn');
    expect(celebrationLevel(base('inconclusive', { comparison: null }))).toBe('warn');
    expect(celebrationLevel(base('inconclusive', { pairOk: false }))).toBe('warn');
  });
  it('MATCH stamps "Holes match · cut not checked" in amber; particles 90 / 40 / 0, halved on phones', () => {
    expect(stampFor(base('inconclusive'), 'match', 'Cut not clear')).toEqual({ text: 'Holes match · cut not checked', tone: 'warn' });
    const env = { reduced: false, lite: false };
    expect([particleCount('full', env), particleCount('match', env), particleCount('warn', env), particleCount('bad', env)]).toEqual([90, 40, 0, 0]);
    expect(particleCount('full', { reduced: false, lite: true })).toBe(45);
  });
});

describe('payday-ux: the amount rolls in whole rupees', () => {
  it('never shows paise during the roll and lands on the exact value', () => {
    for (const minor of [190000, 161140, 99, 0, 123456]) {
      for (let k = 0; k < 1; k += 0.01) expect(rollValue(minor, k) % 100).toBe(0);
      expect(rollValue(minor, 1)).toBe(minor);
    }
    const seq = Array.from({ length: 50 }, (_, i) => rollValue(190000, i / 50));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
  });
});

describe('payday-ux: overlay', () => {
  it('draws nothing when a scan returns no card, or from a pose older than 600 ms', () => {
    expect(drawablePose(null, 1000)).toBeNull();
    expect(drawablePose({ halves: [], at: 1000 }, 1000)).toBeNull();
    expect(drawablePose({ halves: [1], at: 1000 }, 1000 + POSE_MAX_AGE)).not.toBeNull();
    expect(drawablePose({ halves: [1], at: 1000 }, 1001 + POSE_MAX_AGE)).toBeNull();
    expect(POSE_MAX_AGE).toBe(600);
  });
});

describe('payday-ux: holes punched together', () => {
  it('counts 5 shared holes for days 4, 5, 6 + advances 1, 2 and says why positions could not be checked', () => {
    // a light grey wall: holes read by brightness, but they are not darker than 0.4 × paper, so no hole centres
    const spec = recordedCard({ pairing: false });
    const bmp = sheetWithText(spec);
    const s = scanImage(cameraPhoto(spec, 'S', RECORDED_PUNCHES, { rotationDeg: 0, background: 0.42, pxPerMm: 3.6, blur: 1.5 }, bmp)).halves[0];
    const f = scanImage(cameraPhoto(spec, 'F', RECORDED_PUNCHES, { rotationDeg: 3, background: 0.42, pxPerMm: 3.6, blur: 1.5, seed: 12 }, bmp)).halves[0];
    const r = verifyPair(s, f);
    expect(r.sharedPunched).toBe(5);
    const c = r.checks.find((x) => x.id === 'align')!;
    if (!r.align?.checked) expect(c.detail).toContain('5 holes are on both halves');
    // on a dark table the positions ARE measured and all 5 line up
    const s2 = scanImage(cameraPhoto(spec, 'S', RECORDED_PUNCHES, { rotationDeg: 0, background: 0.12, pxPerMm: 3.6, blur: 1.5 }, bmp)).halves[0];
    const f2 = scanImage(cameraPhoto(spec, 'F', RECORDED_PUNCHES, { rotationDeg: 3, background: 0.12, pxPerMm: 3.6, blur: 1.5, seed: 12 }, bmp)).halves[0];
    const r2 = verifyPair(s2, f2);
    expect(r2.align?.checked).toBe(true);
    expect(r2.align?.shared).toBe(5);
    expect(r2.align?.flagged).toEqual([]);
  });
});

describe('payday-ux: motion', () => {
  it('reduced motion: no particles and the final state at once', () => {
    const env = { reduced: true, lite: false, hidden: false };
    const p = revealPlan('full', env);
    expect(p).toMatchObject({ instant: true, particles: 0, splatter: false, shake: false, sheen: false, stampAt: 0, amountAt: 0, gridAt: 0 });
    const sc = createScope();
    expect(confetti(sc, 0, 0, 90, env)).toBe(0);
  });
  it('closing the camera mid-animation cancels every timer, frame and animation', () => {
    let nextId = 0;
    const live = new Map<number, string>();
    const api = {
      setTimeout: () => { const id = ++nextId; live.set(id, 't'); return id; },
      clearTimeout: (id: unknown) => { live.delete(id as number); },
      requestAnimationFrame: () => { const id = ++nextId; live.set(id, 'r'); return id; },
      cancelAnimationFrame: (id: unknown) => { live.delete(id as number); },
    };
    const sc = createScope(api);
    let stopped = 0;
    sc.timeout(() => {}, 500); sc.timeout(() => {}, 1400); sc.raf(() => {}); sc.raf(() => {});
    sc.add(() => stopped++); sc.add(() => stopped++);
    expect(sc.pending).toEqual({ timeouts: 2, rafs: 2, other: 2 });
    sc.dispose();
    expect(live.size).toBe(0);
    expect(stopped).toBe(2);
    expect(sc.pending).toEqual({ timeouts: 0, rafs: 0, other: 0 });
    sc.timeout(() => {}, 10); sc.raf(() => {});
    expect(live.size).toBe(0); // nothing new is scheduled after dispose
  });
});
