// Phase 6 properties: comparison, pay, alignment, and simulated photo pairs.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { makeCard } from '../src/core/card';
import { compareSets, payFor, threeViews } from '../src/core/wages';
import { alignment, type AlignHole } from '../src/vision/pair';
import { stackTransform } from '../src/render/scene';
import { targetsFor } from '../src/core/layout';
import { specArb, punchArb, runs, sorted, base32 } from './helpers';

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
