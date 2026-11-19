// Phase 6 property 4 (part B): simulated photo pairs (moved from pair.test.ts so the slow tests run in parallel).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { photoRuns, base32 } from './helpers';
import { encodePayload } from '../src/core/card';
import { scanPair, photoCase, cardFor, days } from './pairPhotos';

describe('pair-and-pay: simulated photos (property 4, B)', () => {
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

});
