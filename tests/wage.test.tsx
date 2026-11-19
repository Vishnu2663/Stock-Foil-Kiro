// Wage history, the pay schedule, cash, amount in words, the payday view model and who is who.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { payFor, wageScheduleFor, defaultWageSource, applyChanges, scheduleOf, rateOnDay, type WageEntry, type RateRange } from '../src/core/wages';
import { cashBreakdown, breakdownTotal, NOTES, notesFor } from '../src/core/cash';
import { wordsEn, amountInWords } from '../src/core/words';
import { migrateMember, appendWage, wagesOf, memberForCard, type Member } from '../src/core/members';
import { makeCard, formatMoney } from '../src/core/card';
import { paydayModel } from '../src/ui/payday';
import { partyColor, partyText, initials } from '../src/ui/components/Party';
import { Ctx, type AppCtx } from '../src/ui/ctx';
import { PaySlip } from '../src/ui/components/PaySlip';
import { NoteStacks } from '../src/ui/components/Banknote';
import { DEFAULT_SETTINGS } from '../src/store/index';
import { runs } from './helpers';

const spec = makeCard({ worker: 'Ramesh', employer: 'Vishnu', year: 2026, month: 11, rateMinor: 70000, advMinor: 10000, pairing: false }, 'WAGE0001');
const e = (y: number, m: number, d: number, rate: number, adv = 10000): WageEntry => ({ fromYear: y, fromMonth: m, fromDay: d, rateMinor: rate, advMinor: adv });
const t = (s: string, ...a: (string | number)[]) => s.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)]));

describe('wage-history: wageScheduleFor', () => {
  it('no change: one range at the card rate', () => {
    expect(wageScheduleFor(spec, [e(2026, 1, 1, 70000)], 'card').ranges).toEqual([{ fromDay: 1, toDay: 30, rateMinor: 70000 }]);
    expect(wageScheduleFor(spec, [e(2026, 1, 1, 70000)], 'current').ranges).toEqual([{ fromDay: 1, toDay: 30, rateMinor: 70000 }]);
    expect(defaultWageSource(spec, [e(2026, 1, 1, 70000)])).toBe('card');
  });
  it('a change on day 16: two ranges, pre-selected', () => {
    const h = [e(2026, 1, 1, 70000), e(2026, 11, 16, 75000)];
    const w = wageScheduleFor(spec, h, 'current');
    expect(w.ranges).toEqual([{ fromDay: 1, toDay: 15, rateMinor: 70000 }, { fromDay: 16, toDay: 30, rateMinor: 75000 }]);
    expect(w.adjusted).toBe(true);
    expect(defaultWageSource(spec, h)).toBe('current');
    expect(wageScheduleFor(spec, h, 'card').ranges).toEqual([{ fromDay: 1, toDay: 30, rateMinor: 70000 }]);
  });
  it('two changes in one month', () => {
    const h = [e(2026, 1, 1, 70000), e(2026, 11, 10, 72000), e(2026, 11, 20, 75000, 12000)];
    const w = wageScheduleFor(spec, h, 'current');
    expect(w.ranges).toEqual([{ fromDay: 1, toDay: 9, rateMinor: 70000 }, { fromDay: 10, toDay: 19, rateMinor: 72000 }, { fromDay: 20, toDay: 30, rateMinor: 75000 }]);
    expect(w.advMinor).toBe(12000);
  });
  it('a change before the month: the current rate all month, but only when "Current wage" is picked', () => {
    const h = [e(2026, 1, 1, 70000), e(2026, 10, 5, 80000)];
    expect(wageScheduleFor(spec, h, 'current').ranges).toEqual([{ fromDay: 1, toDay: 30, rateMinor: 80000 }]);
    expect(wageScheduleFor(spec, h, 'card').ranges).toEqual([{ fromDay: 1, toDay: 30, rateMinor: 70000 }]);
    expect(defaultWageSource(spec, h)).toBe('card');
  });
  it('a change after the month is ignored', () => {
    const h = [e(2026, 1, 1, 70000), e(2026, 12, 2, 90000)];
    expect(wageScheduleFor(spec, h, 'current').ranges).toEqual([{ fromDay: 1, toDay: 30, rateMinor: 70000 }]);
  });
  it('the single-change API is a wrapper over the schedule', () => {
    const view = payFor(['d4', 'd5', 'd20'], { rateMinor: 70000, advMinor: 10000, carryMinor: 0, rateChange: { fromDay: 16, rateMinor: 75000 } });
    expect(view.gross).toBe(2 * 70000 + 75000);
    expect(view.lines.map((l) => l.gross)).toEqual([140000, 75000]);
  });
});

describe('wage-history: payFor with a schedule (property)', () => {
  const sched = fc.array(fc.record({ day: fc.integer({ min: 2, max: 28 }), rate: fc.integer({ min: 0, max: 200000 }) }), { maxLength: 3 })
    .chain((cs) => fc.integer({ min: 0, max: 200000 }).map((base) => applyChanges(30, base, cs.map((c) => ({ fromDay: c.day, rateMinor: c.rate })))));
  const punches = fc.record({ halves: fc.boolean(), days: fc.uniqueArray(fc.integer({ min: 1, max: 30 }), { maxLength: 20 }), half: fc.array(fc.boolean(), { minLength: 30, maxLength: 30 }), adv: fc.integer({ min: 0, max: 10 }) });
  it('gross = round(Σ rate(day) × halfUnits(day) / 2); net = gross − adv × advMinor + carry; lines sum to gross', () => {
    fc.assert(fc.property(sched, punches, fc.integer({ min: 0, max: 200000 }), fc.integer({ min: -1_000_000, max: 1_000_000 }), (s: RateRange[], p, advMinor, carry) => {
      const keys: string[] = [];
      let sum2 = 0;
      for (const d of p.days) {
        if (p.halves) { keys.push(`d${d}a`); sum2 += rateOnDay(s, d); if (p.half[d - 1]) { keys.push(`d${d}b`); sum2 += rateOnDay(s, d); } }
        else { keys.push(`d${d}`); sum2 += 2 * rateOnDay(s, d); }
      }
      for (let i = 1; i <= p.adv; i++) keys.push(`a${i}`);
      const v = payFor(keys, { rateMinor: 1, advMinor, carryMinor: carry, halves: p.halves, schedule: s });
      expect(Number.isInteger(v.gross) && Number.isInteger(v.net)).toBe(true);
      expect(v.gross).toBe(Math.round(sum2 / 2));
      expect(v.net).toBe(v.gross - p.adv * advMinor + carry);
      expect(v.lines.reduce((a, l) => a + l.gross, 0)).toBe(v.gross);
      expect(scheduleOf({ rateMinor: 1, schedule: s })).toBe(s);
    }), runs(200));
  });
});

describe('wage-history: cash', () => {
  it('Σ notes + remainder = net for every currency, also with notes left out', () => {
    fc.assert(fc.property(fc.constantFrom(...Object.keys(NOTES)), fc.integer({ min: -5_000_000, max: 50_000_000 }), fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }), (cur, amount, offMask) => {
      const full = cashBreakdown(amount, cur);
      expect(breakdownTotal(full)).toBe(amount);
      const off = notesFor(cur).filter((_, i) => offMask[i]);
      const sub = cashBreakdown(amount, cur, off);
      expect(breakdownTotal(sub)).toBe(amount);
      for (const n of sub.notes) expect(off).not.toContain(n.value);
    }), runs(300));
  });
  it('₹1,900 is 500 × 3 + 200 × 2; without 200s it is 500 × 3 + 100 × 4 and says so', () => {
    expect(cashBreakdown(190000, 'INR').notes).toEqual([{ value: 500, count: 3 }, { value: 200, count: 2 }]);
    const b = cashBreakdown(190000, 'INR', [200]);
    expect(b.notes).toEqual([{ value: 500, count: 3 }, { value: 100, count: 4 }]);
    expect(b.skipped).toEqual([200]);
  });
});

describe('wage-history: amount in words', () => {
  it('reads 0, 1, 19, 100, 1,900 and 1,00,000 (Indian grouping for INR)', () => {
    expect(wordsEn(0)).toBe('zero');
    expect(wordsEn(1)).toBe('one');
    expect(wordsEn(19)).toBe('nineteen');
    expect(wordsEn(100)).toBe('one hundred');
    expect(wordsEn(1900, true)).toBe('one thousand nine hundred');
    expect(wordsEn(100000, true)).toBe('one lakh');
    expect(wordsEn(100000)).toBe('one hundred thousand');
    expect(amountInWords(190000, 'INR')).toBe('One thousand nine hundred rupees only');
    expect(amountInWords(150, 'INR')).toBe('One rupee and fifty paise only');
    expect(amountInWords(190000, 'INR', 'hi')).toBeNull();
  });
});

describe('wage-history: one view model for everything', () => {
  it('switching the source updates amount, formula, slip total, notes and the spoken text together', () => {
    const keys = ['d4', 'd5', 'd6', 'd17', 'a1', 'a2'];
    const h = [e(2026, 1, 1, 70000), e(2026, 11, 16, 75000)];
    const pay = (src: 'card' | 'current') => {
      const w = wageScheduleFor(spec, h, src);
      const v = payFor(keys, { rateMinor: spec.rateMinor, advMinor: w.advMinor, carryMinor: 0, schedule: w.ranges });
      return { v, m: paydayModel(v, spec, w, t) };
    };
    const a = pay('card'), b = pay('current');
    expect(a.v.net).toBe(4 * 70000 - 2 * 10000);
    expect(b.v.net).toBe(3 * 70000 + 75000 - 2 * 10000);
    for (const { v, m } of [a, b]) {
      expect(m.amountText).toBe(formatMoney(v.net, 'INR'));
      expect(m.formula.endsWith(`= ${formatMoney(v.net, 'INR')}`)).toBe(true);
      expect(m.lines.reduce((s, l) => s + l.minor, 0)).toBe(v.net);
      expect(breakdownTotal(m.cash)).toBe(v.net);
      expect(m.checkSum.endsWith(formatMoney(v.net, 'INR'))).toBe(true);
      expect(m.listen).toContain(formatMoney(v.net, 'INR'));
      expect(m.listen).toContain('Vishnu, the employer, pays Ramesh, the worker');
    }
    expect(b.m.formula).toBe('3 days × ₹700 (1–15) + 1 days × ₹750 (16–30) = ₹2,850 − 2 × ₹100 = ₹2,650');
    expect(b.m.wageNote).toContain("Ramesh's wage changed to ₹750 from 16");
    expect(a.m.wageNote).toBeNull();
  });
  it('net ≤ 0: the worker owes, no notes', () => {
    const w = wageScheduleFor(spec, undefined, 'card');
    const v = payFor(['a1', 'a2'], { rateMinor: spec.rateMinor, advMinor: w.advMinor, carryMinor: 0, schedule: w.ranges });
    const m = paydayModel(v, spec, w, t);
    expect(m.owes).toBe(true);
    expect(m.cash.notes).toEqual([]);
    expect(m.listen).toContain('Ramesh, the worker, owes Vishnu, the employer');
  });
});

describe('wage-history: members', () => {
  const old: Member = { id: 'm1', name: 'Ramesh', employer: 'Vishnu', rateMinor: 70000, advMinor: 10000, currency: 'INR', lang: 'en', createdAt: '2026-03-04T10:00:00.000Z' };
  it('old members load with one history entry and nothing is lost', () => {
    const m = migrateMember(old);
    expect(m.wages).toEqual([e(2026, 3, 4, 70000)]);
    expect({ ...m, wages: undefined }).toEqual({ ...old, wages: undefined });
  });
  it('a raise is appended, never overwrites, and the current wage follows today', () => {
    const m = appendWage(migrateMember(old), e(2026, 11, 16, 75000), new Date(2026, 11, 1));
    expect(wagesOf(m)).toEqual([e(2026, 3, 4, 70000), e(2026, 11, 16, 75000)]);
    expect(m.rateMinor).toBe(75000);
    const before = appendWage(migrateMember(old), e(2026, 11, 16, 75000), new Date(2026, 10, 1));
    expect(before.rateMinor).toBe(70000);
  });
  it('finds the member by the issued card first, then by name', () => {
    const a = migrateMember(old), b = { ...migrateMember(old), id: 'm2', name: 'Other' };
    const card = { ...spec, memberId: 'm2' };
    expect(memberForCard([a, b], [card], spec)?.id).toBe('m2');
    expect(memberForCard([a, b], [], spec)?.id).toBe('m1');
  });
});

describe('who is who', () => {
  it('colours are stable per name and differ between names', () => {
    expect(partyColor('Ramesh')).toEqual(partyColor('ramesh '));
    const hues = new Set(['Ramesh', 'Vishnu', 'Asha', 'Kumar', 'Sharma Builders', 'Lakshmi'].map((n) => partyColor(n).hue));
    expect(hues.size).toBe(6);
  });
  it('labels and aria text', () => {
    expect(partyText('worker', 'Ramesh', t)).toMatchObject({ label: 'WORKER', aria: 'Worker: Ramesh', caption: 'gets paid · keeps STOCK half', owner: 'Ramesh (worker)' });
    expect(partyText('employer', 'Vishnu', t)).toMatchObject({ label: 'EMPLOYER', aria: 'Employer: Vishnu', caption: 'pays · keeps FOIL half', owner: 'Vishnu (employer)' });
    expect(initials('Sharma Builders')).toBe('SB');
    expect(initials('Ramesh')).toBe('RA');
  });
});

describe('wage-history: reduced motion', () => {
  it('the slip and the notes render in their final state, with no animation classes', () => {
    const ctx = { settings: DEFAULT_SETTINGS, setSettings: () => {}, lang: 'en', t, toast: () => {}, startCard: () => {}, packVersion: 0 } as unknown as AppCtx;
    const w = wageScheduleFor(spec, undefined, 'card');
    const v = payFor(['d4', 'd5', 'd6', 'a1', 'a2'], { rateMinor: spec.rateMinor, advMinor: w.advMinor, carryMinor: 0, schedule: w.ranges });
    const m = paydayModel(v, spec, w, t);
    // Node has no document: motionEnv() reports reduced motion
    const html = renderToStaticMarkup(createElement(Ctx.Provider, { value: ctx },
      createElement(PaySlip, { spec, view: v, model: m, wage: w, level: 'full', disputed: false, dealKey: 'k' }),
      createElement(NoteStacks, { cash: m.cash, currency: 'INR', dealKey: 'k' })));
    expect(html).toContain('wage-packet still');
    expect(html).toContain('note-stacks still');
    expect(html).not.toContain('data-new="1"');
    expect(html).not.toContain('typer-caret');
    expect(html).not.toContain(' slam');
    expect(html).toContain('₹1,900');
    expect(html).toContain('One thousand nine hundred rupees only');
  });
});
