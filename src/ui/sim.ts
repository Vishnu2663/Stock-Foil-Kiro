// Demo, Story and Test lab scenarios: real scanner on simulated photos.
import { makeCard, encodePayload, type CardSpec } from '../core/card';
import type { Calibration } from '../vision/detect';
import { randomBase32 } from '../core/prng';
import type { PairInput, PhotoOpts } from '../render/scene';
import { verifyPair, pickHalves, type PairResult } from '../vision/pair';
import type { HalfScan } from '../vision/detect';
import { simulate } from './scanAsync';
import type { SimOutput } from '../vision/worker';

export type ScenarioId = 'claim' | 'extra' | 'sloppy' | 'forged' | 'forgedFit' | 'halfday' | 'paid' | 'legacyForged';

export function demoCard(extra: Partial<Parameters<typeof makeCard>[0]> = {}, id = 'DEM0CARD'): CardSpec {
  const spec = makeCard({ worker: 'Meena', employer: 'Ravi Contractor', year: 2026, month: 11, rateMinor: 50000, advMinor: 10000, ...extra }, id);
  // a fixed pairing so the demo is reproducible
  if (spec.pairing) spec.pairing = { sa: '7K3QX9ZT2M4B', sf: 'P8D2W6HN5RCA' };
  return spec;
}

const FIVE = ['d3', 'd4', 'd5', 'd6', 'd7'];
const photoA: PhotoOpts = { rotationDeg: -9, blur: 0.6, noise: 0.01, light: 0.15, background: 0.1 };
const photoB: PhotoOpts = { rotationDeg: 12, tiltXDeg: 4, blur: 0.7, noise: 0.012, light: 0.2, lightAngleDeg: 200, background: 0.12 };

export interface Scenario { id: ScenarioId; title: string; text: string; input: PairInput; expect: string }

export function scenario(id: ScenarioId, seed = 7): Scenario {
  switch (id) {
    case 'claim': {
      const spec = demoCard();
      return {
        id, title: '1 · 4 vs 5 days', text: 'The contractor says 4 days. Both halves show 5 holes.', expect: 'genuine-consistent',
        input: { spec, stockPunched: [...FIVE, 'a1'], foilPunched: [...FIVE, 'a1'], seed, stack: { dx: 0.3, dy: -0.2, rotDeg: 0.2 }, photoStock: photoA, photoFoil: photoB },
      };
    }
    case 'extra': {
      const spec = demoCard();
      return {
        id, title: '2 · An extra hole', text: 'Someone punched one extra hole into the worker half only.', expect: 'genuine-disputed',
        input: { spec, stockPunched: [...FIVE, 'd10'], foilPunched: FIVE, seed, photoStock: photoA, photoFoil: photoB },
      };
    }
    case 'sloppy': {
      const spec = demoCard();
      return {
        id, title: '3 · A sloppy cut', text: 'The scissors slipped. The pairing code still proves the pair.', expect: 'genuine-consistent',
        input: { spec, stockPunched: FIVE, foilPunched: FIVE, seed, stockCutJitter: 3, foilCutJitter: 3, photoStock: photoA, photoFoil: photoB },
      };
    }
    case 'forged': {
      const spec = demoCard({ pairing: false });
      return {
        id, title: 'A forged cut', text: 'A card without a pairing code, with a foil cut on a different wave.', expect: 'pair-mismatch',
        input: { spec, stockPunched: FIVE, foilPunched: ['d3', 'd4', 'd5', 'd6'], seed, forgeCutFoil: true, photoStock: photoA, photoFoil: photoB },
      };
    }
    case 'legacyForged': return { ...scenario('forged', seed), id };
    case 'forgedFit': {
      const spec = demoCard();
      const f = encodePayload(spec, 'F').split('|');
      f[9] = 'F4KEF4KE9999'; // the forger cannot know the real foil secret
      return {
        id, title: 'The perfect-fit forgery', text: 'The cut fits perfectly, but the secret is wrong.', expect: 'pair-mismatch',
        input: { spec, stockPunched: FIVE, foilPunched: ['d3', 'd4', 'd5', 'd6'], seed, foilPayload: f.join('|'), photoStock: photoA, photoFoil: photoB },
      };
    }
    case 'halfday': {
      const spec = demoCard({ halves: true });
      const k = ['d3a', 'd3b', 'd4a', 'd4b', 'd5a', 'd5b', 'd6a', 'd6b', 'd7a'];
      return {
        id, title: '4 · A half day', text: 'Four full days and one half day: 4½ days.', expect: 'genuine-consistent',
        input: { spec, stockPunched: k, foilPunched: k, seed, photoStock: photoA, photoFoil: photoB },
      };
    }
    case 'paid': return { ...scenario('claim', seed), id };
  }
}

export interface ScenarioRun { sim: SimOutput; stock?: HalfScan; foil?: HalfScan; result: PairResult }

export async function runPair(input: PairInput, calibration: Calibration = {}): Promise<ScenarioRun> {
  const sim = await simulate(input, { calibration });
  const { stock, foil } = pickHalves(sim.scans.flatMap((s) => s.halves));
  return { sim, stock, foil, result: verifyPair(stock, foil, { alignTolMm: calibration.alignTolMm }) };
}

/** A random photo case for the stress test. */
export function randomCase(rnd: () => number): PairInput {
  const spec = makeCard({ worker: 'Test', employer: 'Lab', year: 2026, month: 1 + Math.floor(rnd() * 12), halves: rnd() < 0.25, discs: rnd() < 0.2 }, randomBase32(8));
  const keys: string[] = [];
  for (let d = 1; d <= 28; d++) if (rnd() < 0.3) { if (spec.halves) { keys.push(`d${d}a`); if (rnd() < 0.8) keys.push(`d${d}b`); } else keys.push(`d${d}`); }
  if (rnd() < 0.5) keys.push('a1');
  const photo = (): PhotoOpts => ({
    rotationDeg: (rnd() - 0.5) * 50, tiltXDeg: (rnd() - 0.5) * 10, tiltYDeg: (rnd() - 0.5) * 10, blur: rnd() * 1.1, noise: rnd() * 0.02,
    light: rnd() * 0.3, lightAngleDeg: rnd() * 360, pxPerMm: 3.4 + rnd() * 0.8, background: spec.discs && rnd() < 0.5 ? 0.97 : 0.05 + rnd() * 0.15,
  });
  return { spec, stockPunched: keys, foilPunched: keys, seed: Math.floor(rnd() * 1e6), stack: { dx: (rnd() - 0.5) * 0.8, dy: (rnd() - 0.5) * 0.8, rotDeg: (rnd() - 0.5) * 0.4 }, photoStock: photo(), photoFoil: photo() };
}
