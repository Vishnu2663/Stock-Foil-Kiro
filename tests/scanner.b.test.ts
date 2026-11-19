// Vision scanner properties, part B (split from scanner.test.ts so the slow properties run in parallel).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { makeCard, type CardSpec, type Role } from '../src/core/card';
import { renderHalf, type PhotoOpts } from '../src/render/scene';
import { scanImage } from '../src/vision/detect';
import { punchArb, photoRuns as runs, base32 } from './helpers';

const cardArb = (discs: boolean | null) =>
  fc.record({ id: base32(8), month: fc.integer({ min: 1, max: 12 }), halves: fc.boolean(), discs: fc.boolean(), paired: fc.boolean() })
    .map((r) => {
      const spec = makeCard({ worker: 'Asha Devi', employer: 'Kumar Builders', year: 2026, month: r.month, halves: r.halves, discs: discs ?? r.discs, pairing: r.paired }, r.id);
      if (spec.pairing) spec.pairing = { sa: '7K3QX9ZT2M4B', sf: 'P8D2W6HN5RCA' }; // deterministic photos
      return spec;
    });

const withPunches = (discs: boolean | null) =>
  cardArb(discs).chain((spec) => fc.tuple(fc.constant(spec), punchArb(spec, 12), fc.constantFrom<Role>('S', 'F'), fc.integer({ min: 1, max: 1e6 })));


function scan(spec: CardSpec, role: Role, punched: string[], photo: PhotoOpts) {
  const sc = renderHalf({ spec, role, punched }, photo);
  return { sc, res: scanImage(sc) };
}

describe('vision-scanner (B)', () => {
  it('(2) outside the envelope, every wrong reading carries a warning or "unsure"', () => {
    const outside: fc.Arbitrary<PhotoOpts> = fc.oneof(
      fc.record({ blur: fc.double({ min: 1.8, max: 3.2, noNaN: true }) }),
      fc.record({ noise: fc.double({ min: 0.05, max: 0.1, noNaN: true }) }),
      fc.record({ background: fc.double({ min: 0.5, max: 0.97, noNaN: true }) }),
      fc.record({ crop: fc.double({ min: 0.12, max: 0.4, noNaN: true }) }),
      fc.record({ pxPerMm: fc.double({ min: 1.8, max: 2.6, noNaN: true }) }),
      fc.record({ light: fc.double({ min: 0.5, max: 0.75, noNaN: true }) }),
      fc.record({ tiltXDeg: fc.double({ min: 14, max: 22, noNaN: true }), blur: fc.double({ min: 0.8, max: 1.5, noNaN: true }) }),
    );
    fc.assert(
      fc.property(withPunches(null), outside, ([spec, punched, role, seed], photo) => {
        const { res } = scan(spec, role, punched, { seed, ...photo });
        const truth = new Set(punched);
        for (const h of res.halves) {
          for (const c of h.cells) {
            const wrong = c.punched !== truth.has(c.key);
            if (wrong) expect(c.unsure || h.warnings.length > 0).toBe(true);
          }
        }
      }),
      runs(),
    );
  });

  it('(4) far corner squares are found under strong perspective', () => {
    fc.assert(
      fc.property(
        withPunches(false),
        fc.double({ min: 12, max: 18, noNaN: true }),
        fc.constantFrom(-1, 1),
        fc.constantFrom('x', 'y'),
        ([spec, punched, role, seed], tilt, sign, axis) => {
          const photo: PhotoOpts = { seed, pxPerMm: 4, blur: 0.5, ...(axis === 'x' ? { tiltXDeg: sign * tilt } : { tiltYDeg: sign * tilt }) };
          const { res } = scan(spec, role, punched, photo);
          expect(res.halves.length).toBe(1);
          expect(res.halves[0].pose.fiducialsFound).toBe(4);
        },
      ),
      runs(),
    );
  });

  it('non Stock & Foil QR codes go to foreign', async () => {
    const spec = makeCard({ worker: 'A', employer: 'B', year: 2026, month: 2 }, 'AAAABBBB');
    const sc = renderHalf({ spec, role: 'S', punched: [], payloadOverride: 'https://example.org/not-a-card' }, { seed: 5 });
    const res = scanImage(sc);
    expect(res.halves.length).toBe(0);
    expect(res.foreign).toEqual(['https://example.org/not-a-card']);
  });
});
