import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cashBreakdown, breakdownTotal, combineCash, NOTES, notesFor } from '../src/core/cash';
import { runs } from './helpers';

const currency = fc.constantFrom(...Object.keys(NOTES), 'XYZ');

describe('pair-and-pay: cash (property 6)', () => {
  it('notes plus the remainder equal the amount exactly (greedy)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000_000, max: 50_000_000 }), currency, (amt, cur) => {
        const b = cashBreakdown(amt, cur);
        expect(breakdownTotal(b)).toBe(amt);
        if (amt > 0) {
          expect(b.remainderMinor).toBeGreaterThanOrEqual(0);
          expect(b.remainderMinor).toBeLessThan(Math.min(...notesFor(cur)) * 100);
          for (const n of b.notes) expect(notesFor(cur)).toContain(n.value);
        }
      }),
      runs(300),
    );
  });

  it('combined crew cash is exact', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5_000_000 }), { maxLength: 30 }), currency, (amts, cur) => {
        const c = combineCash(amts.map((a) => cashBreakdown(a, cur)), cur);
        expect(breakdownTotal(c)).toBe(amts.reduce((s, a) => s + a, 0));
      }),
      runs(200),
    );
  });

  it('uses the §6.6 denominations', () => {
    expect(NOTES.INR).toEqual([500, 200, 100, 50, 20, 10, 5, 2, 1]);
    expect(notesFor('XYZ')).toEqual([100, 50, 20, 10, 5, 1]);
    expect(cashBreakdown(278550, 'INR').notes).toEqual([
      { value: 500, count: 5 }, { value: 200, count: 1 }, { value: 50, count: 1 }, { value: 20, count: 1 }, { value: 10, count: 1 },
      { value: 5, count: 1 },
    ]);
    expect(cashBreakdown(278550, 'INR').remainderMinor).toBe(50);
  });
});
