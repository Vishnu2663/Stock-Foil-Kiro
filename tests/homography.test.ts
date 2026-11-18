import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyH, invertH, solveHomography, type Hom, type Pt } from '../src/core/homography';
import { runs } from './helpers';

const poseArb = fc.record({
  rot: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
  s: fc.double({ min: 1.5, max: 8, noNaN: true }),
  tx: fc.double({ min: -500, max: 500, noNaN: true }),
  ty: fc.double({ min: -500, max: 500, noNaN: true }),
  p1: fc.double({ min: -0.0015, max: 0.0015, noNaN: true }),
  p2: fc.double({ min: -0.0015, max: 0.0015, noNaN: true }),
});

const makeH = (o: { rot: number; s: number; tx: number; ty: number; p1: number; p2: number }): Hom => {
  const c = Math.cos(o.rot) * o.s, sn = Math.sin(o.rot) * o.s;
  return [c, -sn, o.tx, sn, c, o.ty, o.p1, o.p2, 1];
};

describe('card-core: homography (property 7)', () => {
  it('recovers a random pose and inverts exactly', () => {
    fc.assert(
      fc.property(poseArb, fc.array(fc.tuple(fc.double({ min: 0, max: 186, noNaN: true }), fc.double({ min: 0, max: 120, noNaN: true })), { minLength: 3, maxLength: 3 }), (o, test) => {
        const H = makeH(o);
        const src: Pt[] = [[6.5, 6.5], [179.5, 6.5], [179.5, 113.5], [6.5, 113.5], [140, 14], [178, 52]];
        const dst = src.map(([x, y]) => applyH(H, x, y));
        const E = solveHomography(src, dst)!;
        expect(E).not.toBeNull();
        const inv = invertH(E);
        for (const [x, y] of test as Pt[]) {
          const [u, v] = applyH(H, x, y);
          const [u2, v2] = applyH(E, x, y);
          expect(Math.hypot(u - u2, v - v2)).toBeLessThan(1e-6 * Math.max(1, Math.hypot(u, v)));
          const [bx, by] = applyH(inv, u2, v2);
          expect(Math.hypot(bx - x, by - y)).toBeLessThan(1e-6);
        }
      }),
      runs(Math.max(60, 15 * 4)),
    );
  });
});
