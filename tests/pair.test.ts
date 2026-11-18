// Phase 6 properties: comparison, pay, alignment, and simulated photo pairs.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { makeCard, encodePayload, type CardSpec } from '../src/core/card';
import { compareSets, payFor, threeViews } from '../src/core/wages';
import { alignment, verifyPair, type AlignHole } from '../src/vision/pair';
import { renderPair, stackTransform, type PairInput } from '../src/render/scene';
import { scanImage } from '../src/vision/detect';
import { targetsFor } from '../src/core/layout';
import { specArb, punchArb, runs, photoRuns, sorted, base32 } from './helpers';

describe('pair-and-pay: comparison (property 1)', () => {
  it('agreed = intersection, one-sided = symmetric difference; extra or missing holes are detected and never paid', () => {
    fc.assert(
      fc.property(specArb.chain((s) => fc.tuple(fc.constant(s), punchArb(s, 20), punchArb(s, 20))), ([spec, a, b]) => {
        const S = new Set(a), F = new Set(b);
        const cmp = compareSets(spec, S, F);
        expect(sorted(cmp.agreed)).toEqual(sorted(a.filter((k) => F.has(k))));
        expect(sorted([...cmp.stockOnly, ...cmp.foilOnly])).toEqual(sorted([...a.filter((k) => !F.has(k)), ...b.filter((k) => !S.has(k))]));
        expect(cmp.consistent).toBe(cmp.stockOnly.size + cmp.foilOnly.size === 0);
        const terms = { rateMinor: spec.rateMinor, advMinor: spec.advMinor, carryMinor: spec.carryMinor, halves: spec.halves };
        const v = threeViews(cmp, terms);
        // one-sided holes never reach the agreed pay
        expect(v.agreed.net).toBe(payFor([...cmp.agreed], terms).net);
        // an extra hole on one half is always detected
        const extra = targetsFor(spec).find((t) => !S.has(t.key) && !F.has(t.key));
        if (extra) {
          const c2 = compareSets(spec, new Set([...a, extra.key]), F);
          expect(c2.consistent).toBe(false);
          expect(c2.stockOnly.has(extra.key)).toBe(true);
          expect(payFor([...c2.agreed], terms).net).toBe(payFor([...compareSets(spec, S, F).agreed], terms).net);
        }
      }),
      runs(Math.max(60, 15 * 4)),
    );
  });
});

describe('pair-and-pay: pay (property 2, 5)', () => {
  it('net pay is exact in every view; with no change it equals days × rate', () => {
    fc.assert(
      fc.property(
        specArb.chain((s) => fc.tuple(fc.constant(s), punchArb(s, 31), punchArb(s, 31), fc.option(fc.record({ fromDay: fc.integer({ min: 1, max: 31 }), rateMinor: fc.integer({ min: 0, max: 200000 }) }), { nil: undefined }))),
        ([spec, a, b, rc]) => {
          const cmp = compareSets(spec, new Set(a), new Set(b));
          const terms = { rateMinor: spec.rateMinor, advMinor: spec.advMinor, carryMinor: spec.carryMinor, halves: spec.halves, rateChange: rc };
          const v = threeViews(cmp, terms);
          for (const [view, keys] of [[v.agreed, [...cmp.agreed]], [v.worker, [...cmp.agreed, ...cmp.stockOnly]], [v.employer, [...cmp.agreed, ...cmp.foilOnly]]] as const) {
            // brute force in half units with BigInt
            let before = 0n, after = 0n, adv = 0;
            for (const k of keys) {
              if (k.startsWith('a')) { adv++; continue; }
              const day = Number(/\d+/.exec(k)![0]);
              const u = spec.halves ? 1n : 2n;
              if (rc && day >= rc.fromDay) after += u; else before += u;
            }
            const num = before * BigInt(spec.rateMinor) + after * BigInt(rc ? rc.rateMinor : spec.rateMinor);
            const gross = Number((num + 1n) / 2n); // round half up of num / 2
            expect(view.gross).toBe(gross);
            expect(view.net).toBe(gross - adv * spec.advMinor + spec.carryMinor);
            expect(Number.isInteger(view.net)).toBe(true);
            if (!rc) expect(view.gross).toBe(Math.round(view.days * spec.rateMinor));
          }
          expect(v.disputed).toBe(Math.abs(v.worker.net - v.employer.net));
        },
      ),
      runs(Math.max(60, 15 * 4)),
    );
  });

  it('half-day cards: two circles = 1 day, one = ½ day, a one-sided circle is disputed', () => {
    fc.assert(
      fc.property(base32(8), fc.integer({ min: 1, max: 28 }), fc.integer({ min: 1, max: 200000 }), (id, day, rate) => {
        const spec = makeCard({ worker: 'W', employer: 'E', year: 2026, month: 2, halves: true, rateMinor: rate, advMinor: 0 }, id);
        const terms = { rateMinor: spec.rateMinor, advMinor: 0, carryMinor: 0, halves: true };
        expect(payFor([`d${day}a`, `d${day}b`], terms).days).toBe(1);
        expect(payFor([`d${day}a`, `d${day}b`], terms).fullDays).toBe(1);
        expect(payFor([`d${day}b`], terms).days).toBe(0.5);
        expect(payFor([`d${day}b`], terms).halfDays).toBe(1);
        expect(payFor([`d${day}a`], terms).gross).toBe(Math.round(rate / 2));
        const cmp = compareSets(spec, new Set([`d${day}a`, `d${day}b`]), new Set([`d${day}a`]));
        expect(cmp.consistent).toBe(false);
        const v = threeViews(cmp, terms);
        expect(v.agreed.days).toBe(0.5);
        expect(v.disputed).toBe(v.worker.gross - v.employer.gross);
      }),
      runs(),
    );
  });
});

describe('pair-and-pay: alignment (property 3)', () => {
  const holesArb = fc.uniqueArray(fc.integer({ min: 0, max: 40 }), { minLength: 4, maxLength: 16 }).map((idx) => {
    const t = targetsFor({ year: 2026, month: 3, halves: false }).filter((x) => x.kind === 'day');
    return idx.filter((i) => i < t.length).map((i) => t[i]);
  });
  const stackArb = fc.record({
    dx: fc.double({ min: -1.2, max: 1.2, noNaN: true }), dy: fc.double({ min: -1.2, max: 1.2, noNaN: true }),
    rotDeg: fc.double({ min: -0.5, max: 0.5, noNaN: true }),
  });

  it('holes punched together are never flagged, even with a 1.2mm / 0.5° stacking error', () => {
    fc.assert(
      fc.property(holesArb, stackArb, fc.integer(), (targets, st, seed) => {
        if (targets.length < 4) return;
        const T = stackTransform(st);
        let r = seed;
        const jitter = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 0.6;
        const holes: AlignHole[] = targets.map((t) => {
          const s: [number, number] = [t.cx + jitter(), t.cy + jitter()];
          const f = T(s);
          // measurement noise ≤ 0.1mm on each
          return { key: t.key, s: [s[0] + jitter() / 6, s[1] + jitter() / 6], f: [f[0] + jitter() / 6, f[1] + jitter() / 6] };
        });
        const a = alignment(holes);
        expect(a.checked).toBe(true);
        expect(a.flagged).toEqual([]);
      }),
      runs(Math.max(60, 15 * 4)),
    );
  });

  it('a separately made hole never passes; fewer than 4 shared holes means no judgement', () => {
    fc.assert(
      fc.property(holesArb, stackArb, fc.double({ min: 1.6, max: 4, noNaN: true }), fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }), (targets, st, off, ang) => {
        if (targets.length < 4) return;
        const T = stackTransform(st);
        const holes: AlignHole[] = targets.map((t) => ({ key: t.key, s: [t.cx, t.cy], f: T([t.cx, t.cy]) }));
        holes[0].f = [holes[0].f[0] + Math.cos(ang) * off, holes[0].f[1] + Math.sin(ang) * off];
        const a = alignment(holes);
        expect(a.flagged).toContain(holes[0].key);
        expect(alignment(holes.slice(0, 3)).checked).toBe(false);
        expect(alignment(holes.slice(0, 3)).flagged).toEqual([]);
      }),
      runs(Math.max(60, 15 * 4)),
    );
  });
});

// ---------------- simulated photos (property 4) ----------------

function scanPair(input: PairInput) {
  const p = renderPair(input);
  const s = scanImage(p.stock).halves[0];
  const f = scanImage(p.foil).halves[0];
  return { s, f, result: verifyPair(s, f) };
}

const photoCase = fc.record({
  id: base32(8), month: fc.integer({ min: 1, max: 12 }), seed: fc.integer({ min: 1, max: 1e6 }),
  rot1: fc.double({ min: -20, max: 20, noNaN: true }), rot2: fc.double({ min: -20, max: 20, noNaN: true }),
  blur: fc.double({ min: 0, max: 1, noNaN: true }),
  stack: fc.record({ dx: fc.double({ min: -0.5, max: 0.5, noNaN: true }), dy: fc.double({ min: -0.5, max: 0.5, noNaN: true }), rotDeg: fc.double({ min: -0.3, max: 0.3, noNaN: true }) }),
});

function cardFor(c: { id: string; month: number }, paired = true, extra: Partial<CardSpec> = {}): CardSpec {
  const spec = { ...makeCard({ worker: 'Asha Devi', employer: 'Kumar Builders', year: 2026, month: c.month, pairing: paired }, c.id), ...extra };
  if (spec.pairing) spec.pairing = { sa: '7K3QX9ZT2M4B', sf: 'P8D2W6HN5RCA' }; // deterministic photos
  return spec;
}

const days = (n: number, seed: number) => Array.from({ length: n }, (_, i) => `d${1 + ((seed + i * 3) % 27)}`).filter((v, i, a) => a.indexOf(v) === i);

describe('pair-and-pay: simulated photos (property 4)', () => {
  it('a paired card verifies as genuine-consistent', () => {
    fc.assert(
      fc.property(photoCase, (c) => {
        const spec = cardFor(c);
        const punched = [...days(6, c.seed), 'a1'];
        const { result } = scanPair({ spec, stockPunched: punched, foilPunched: punched, seed: c.seed, stack: c.stack, photoStock: { rotationDeg: c.rot1, blur: c.blur }, photoFoil: { rotationDeg: c.rot2, blur: c.blur } });
        expect(result.pairing).toBe('verified');
        expect(result.verdict).toBe('genuine-consistent');
        expect(result.pay!.agreed.days).toBe(days(6, c.seed).length);
      }),
      photoRuns(),
    );
  });

  it('a different cut does not matter when pairing is verified', () => {
    fc.assert(
      fc.property(photoCase, (c) => {
        const spec = cardFor(c);
        const punched = days(5, c.seed);
        const { result } = scanPair({ spec, stockPunched: punched, foilPunched: punched, seed: c.seed, stack: c.stack, forgeCutFoil: true, photoStock: { rotationDeg: c.rot1 }, photoFoil: { rotationDeg: c.rot2 } });
        expect(result.pairing).toBe('verified');
        expect(result.checks.find((k) => k.id === 'edge')!.ok).not.toBe(false);
        expect(result.verdict).toBe('genuine-consistent');
      }),
      photoRuns(),
    );
  });

  it('a half with the right id, code and cut but the wrong secret is rejected', () => {
    fc.assert(
      fc.property(photoCase, base32(12), (c, fake) => {
        const spec = cardFor(c);
        if (fake === spec.pairing!.sf) return;
        const f = encodePayload(spec, 'F').split('|');
        f[9] = fake; // SF1p|F|id|ym|rate|adv|cur|lang|code|SECRET|tag|worker|employer
        const punched = days(5, c.seed);
        const { result } = scanPair({ spec, stockPunched: punched, foilPunched: punched, seed: c.seed, foilPayload: f.join('|'), photoStock: { rotationDeg: c.rot1 }, photoFoil: { rotationDeg: c.rot2 } });
        expect(result.pairing).toBe('failed');
        expect(result.verdict).toBe('pair-mismatch');
      }),
      photoRuns(),
    );
  });

  it('legacy cards rely on the cut', () => {
    fc.assert(
      fc.property(photoCase, fc.boolean(), (c, forged) => {
        const spec = cardFor(c, false);
        const punched = days(5, c.seed);
        const { result } = scanPair({ spec, stockPunched: punched, foilPunched: punched, seed: c.seed, stack: c.stack, forgeCutFoil: forged, photoStock: { rotationDeg: c.rot1 }, photoFoil: { rotationDeg: c.rot2 } });
        expect(result.pairing).toBe('legacy');
        expect(result.verdict).toBe(forged ? 'pair-mismatch' : 'genuine-consistent');
      }),
      photoRuns(),
    );
  });

  it('an extra hole on one half is shown and never paid; a separately punched hole is flagged for review', () => {
    fc.assert(
      fc.property(photoCase, (c) => {
        const spec = cardFor(c);
        const d = days(6, c.seed);
        const { result } = scanPair({ spec, stockPunched: [...d, 'd28'], foilPunched: d.filter((k) => k !== 'd28'), seed: c.seed, stack: c.stack });
        expect(result.verdict).toBe('genuine-disputed');
        expect([...result.comparison!.stockOnly]).toContain('d28');
        expect(result.pay!.agreed.days).toBe(d.filter((k) => k !== 'd28').length);
        const sep = scanPair({ spec, stockPunched: d, foilPunched: d, separate: [d[0]], separateOffset: 2.2, seed: c.seed + 7, stack: c.stack });
        expect(sep.result.verdict).toBe('review');
        expect(sep.result.align!.flagged).toContain(d[0]);
      }),
      photoRuns(),
    );
  });
});
