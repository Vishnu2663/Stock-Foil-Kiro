import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

export const SF_RUNS = Number(process.env.SF_RUNS ?? 15);

describe('scaffold', () => {
  it('runs vitest and fast-check with SF_RUNS', () => {
    expect(Number.isInteger(SF_RUNS) && SF_RUNS > 0).toBe(true);
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
      { numRuns: SF_RUNS },
    );
  });
});
