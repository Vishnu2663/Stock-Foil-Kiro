import fc from 'fast-check';
import { BASE32 } from '../src/core/prng';
import { makeCard, type CardSpec } from '../src/core/card';
import { daysInMonth } from '../src/core/layout';

export const SF_RUNS = Math.max(1, Number(process.env.SF_RUNS ?? 15) || 15);
export const runs = (n = SF_RUNS) => ({ numRuns: n });

export const base32 = (len: number) =>
  fc.array(fc.constantFrom(...BASE32.split('')), { minLength: len, maxLength: len }).map((a) => a.join(''));

const nameChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .-\'éñअसहक'.split(''));
export const name = fc.array(nameChar, { minLength: 1, maxLength: 18 }).map((a) => a.join('').trim() || 'A');

export const specArb: fc.Arbitrary<CardSpec> = fc
  .record({
    id: base32(8),
    year: fc.integer({ min: 2020, max: 2035 }),
    month: fc.integer({ min: 1, max: 12 }),
    rateMinor: fc.integer({ min: 0, max: 200000 }),
    advMinor: fc.integer({ min: 0, max: 200000 }),
    currency: fc.constantFrom('INR', 'USD', 'KES', 'EUR', 'BDT'),
    worker: name,
    employer: name,
    lang: fc.constantFrom('en', 'hi', 'bn', 'ta', 'es', 'sw', 'pt-BR'),
    carryMinor: fc.oneof(fc.constant(0), fc.integer({ min: -10_000_000, max: 10_000_000 })),
    paired: fc.boolean(),
    halves: fc.boolean(),
    discs: fc.boolean(),
  })
  .map((r) =>
    makeCard(
      { worker: r.worker, employer: r.employer, year: r.year, month: r.month, rateMinor: r.rateMinor, advMinor: r.advMinor,
        currency: r.currency, lang: r.lang, carryMinor: r.carryMinor, pairing: r.paired, halves: r.halves, discs: r.discs },
      r.id,
    ),
  );

/** A random subset of the day keys of a card plus some advance tokens. */
export function punchArb(spec: CardSpec, maxDays = 10): fc.Arbitrary<string[]> {
  const dim = daysInMonth(spec.year, spec.month);
  const dayKeys: string[] = [];
  for (let d = 1; d <= dim; d++) {
    if (spec.halves) dayKeys.push(`d${d}a`, `d${d}b`);
    else dayKeys.push(`d${d}`);
  }
  const advKeys = Array.from({ length: 10 }, (_, i) => `a${i + 1}`);
  return fc
    .tuple(fc.subarray(dayKeys, { maxLength: Math.min(maxDays, dayKeys.length) }), fc.subarray(advKeys, { maxLength: 3 }))
    .map(([a, b]) => [...a, ...b]);
}

export const sorted = (s: Iterable<string>) => [...s].sort();

/** Photo-based properties are slow: the same run count, but no long shrinking on failure. */
export const photoRuns = (n = SF_RUNS) => ({ numRuns: n, endOnFailure: true });
