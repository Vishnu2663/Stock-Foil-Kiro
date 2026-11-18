import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { makeWave, stockEdgeY, foilEdgeY } from '../src/core/wave';
import { base32, runs } from './helpers';

describe('card-core: wave (property 3)', () => {
  it('is deterministic, within ±5mm, peaks at exactly 5mm on the grid, and is distinct per id', () => {
    fc.assert(
      fc.property(base32(8), base32(8), fc.double({ min: -14, max: 200, noNaN: true }), (a, b, x) => {
        const w1 = makeWave(a);
        const w2 = makeWave(a);
        expect(w1.at(x)).toBe(w2.at(x));
        expect(Math.abs(w1.at(x))).toBeLessThanOrEqual(5);
        let peak = 0;
        for (let t = -14; t <= 200; t += 0.5) peak = Math.max(peak, Math.abs(w1.at(t)));
        expect(peak).toBeCloseTo(5, 9);
        if (a !== b) {
          const wb = makeWave(b);
          let diff = 0;
          for (let t = 0; t <= 186; t += 2) diff = Math.max(diff, Math.abs(w1.at(t) - wb.at(t)));
          expect(diff).toBeGreaterThan(0.5);
        }
        expect(stockEdgeY(w1, x) - 132).toBeCloseTo(foilEdgeY(w1, x) + 12, 9);
      }),
      runs(Math.max(30, 15 * 2)),
    );
  });
});
