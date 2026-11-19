// Phase 6 property 4 (part A): simulated photo pairs (moved from pair.test.ts so the slow tests run in parallel).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { photoRuns } from './helpers';
import { scanPair, photoCase, cardFor, days } from './pairPhotos';

describe('pair-and-pay: simulated photos (property 4, A)', () => {
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
