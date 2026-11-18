// Phase 5 properties. The photo simulator is the oracle.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { makeCard, type CardSpec, type Role } from '../src/core/card';
import { renderHalf, type PhotoOpts } from '../src/render/scene';
import { scanImage } from '../src/vision/detect';
import { punchArb, photoRuns as runs, sorted, base32 } from './helpers';

const cardArb = (discs: boolean | null) =>
  fc.record({ id: base32(8), month: fc.integer({ min: 1, max: 12 }), halves: fc.boolean(), discs: fc.boolean(), paired: fc.boolean() })
    .map((r) => {
      const spec = makeCard({ worker: 'Asha Devi', employer: 'Kumar Builders', year: 2026, month: r.month, halves: r.halves, discs: discs ?? r.discs, pairing: r.paired }, r.id);
      if (spec.pairing) spec.pairing = { sa: '7K3QX9ZT2M4B', sf: 'P8D2W6HN5RCA' }; // deterministic photos
      return spec;
    });

const withPunches = (discs: boolean | null) =>
  cardArb(discs).chain((spec) => fc.tuple(fc.constant(spec), punchArb(spec, 12), fc.constantFrom<Role>('S', 'F'), fc.integer({ min: 1, max: 1e6 })));

const envelope: fc.Arbitrary<PhotoOpts> = fc.record({
  rotationDeg: fc.double({ min: -25, max: 25, noNaN: true }),
  tiltXDeg: fc.double({ min: -6, max: 6, noNaN: true }),
  tiltYDeg: fc.double({ min: -6, max: 6, noNaN: true }),
  blur: fc.double({ min: 0, max: 1.2, noNaN: true }),
  noise: fc.double({ min: 0, max: 0.02, noNaN: true }),
  light: fc.double({ min: 0, max: 0.3, noNaN: true }),
  lightAngleDeg: fc.double({ min: 0, max: 360, noNaN: true }),
  pxPerMm: fc.double({ min: 3.4, max: 4.2, noNaN: true }),
  background: fc.double({ min: 0.05, max: 0.2, noNaN: true }),
});

function scan(spec: CardSpec, role: Role, punched: string[], photo: PhotoOpts) {
  const sc = renderHalf({ spec, role, punched }, photo);
  return { sc, res: scanImage(sc) };
}

describe('vision-scanner', () => {
  it('(1) inside the envelope, the punched set is recovered exactly', () => {
    fc.assert(
      fc.property(withPunches(null), envelope, ([spec, punched, role, seed], photo) => {
        const bg = spec.discs && seed % 2 ? 0.97 : photo.background;
        const { res } = scan(spec, role, punched, { ...photo, background: bg, seed });
        expect(res.halves.length).toBe(1);
        const h = res.halves[0];
        expect(h.decoded.role).toBe(role);
        expect(h.pose.fiducialsFound).toBe(4);
        expect(sorted(h.cells.filter((c) => c.punched).map((c) => c.key))).toEqual(sorted(punched));
        expect(h.cells.filter((c) => c.unsure).map((c) => c.key)).toEqual([]);
      }),
      runs(),
    );
  });

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

  it('(3) disc cards read correctly on dark, pale and white surfaces; on an ambiguous surface every circle is unsure', () => {
    fc.assert(
      fc.property(withPunches(true), fc.constantFrom(0.1, 0.9, 0.97, 0.5), ([spec, punched, role, seed], background) => {
        const { res } = scan(spec, role, punched, { seed, background, rotationDeg: (seed % 30) - 15, blur: 0.6, noise: 0.01 });
        expect(res.halves.length).toBe(1);
        const h = res.halves[0];
        if (background === 0.5) {
          expect(h.ambiguousSurface).toBe(true);
          expect(h.cells.every((c) => c.unsure)).toBe(true);
          expect(h.warnings).toContain('ambiguous-surface');
        } else {
          expect(h.ambiguousSurface).toBe(false);
          expect(sorted(h.cells.filter((c) => c.punched).map((c) => c.key))).toEqual(sorted(punched));
          expect(h.cells.some((c) => c.unsure)).toBe(false);
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
