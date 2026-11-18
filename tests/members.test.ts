import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ownsCard, bulkCreate, cardCounts, membersWithoutCard, type Member } from '../src/core/members';
import { makeCard } from '../src/core/card';
import { name, runs } from './helpers';

const memberArb = fc.record({
  name, employer: fc.constantFrom('Kumar Builders', 'Green Farm', 'City Hotel'),
  rateMinor: fc.integer({ min: 0, max: 200000 }), advMinor: fc.integer({ min: 0, max: 200000 }),
  halves: fc.boolean(), discs: fc.boolean(),
});

const toMembers = (rows: { name: string; employer: string; rateMinor: number; advMinor: number; halves: boolean; discs: boolean }[]): Member[] =>
  rows.map((r, i) => ({ id: 'm' + i, ...r, currency: 'INR', lang: 'en', createdAt: '2026-01-01' }));

describe('printable-card: members', () => {
  it('matching ignores case and never crosses employers', () => {
    fc.assert(
      fc.property(name, fc.constantFrom('A Co', 'B Co'), fc.constantFrom('A Co', 'B Co'), (n, e1, e2) => {
        const card = makeCard({ worker: n.toUpperCase(), employer: e2.toLowerCase(), year: 2026, month: 1 });
        const m = { name: n.toLowerCase(), employer: e1 };
        expect(ownsCard(m, card)).toBe(e1 === e2);
      }),
      runs(100),
    );
  });

  it('bulk creation makes exactly one card per missing member with unique ids; re-running adds nothing; counts add up', () => {
    fc.assert(
      fc.property(fc.array(memberArb, { maxLength: 12 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 0, max: 4 }), (rows, month, pre) => {
        const members = toMembers(rows);
        const existing = members.slice(0, pre).map((m) => makeCard({ worker: m.name, employer: m.employer, year: 2026, month }));
        const missing = membersWithoutCard(members, existing, 2026, month);
        const created = bulkCreate(members, existing, 2026, month, { carryFor: () => -500 });
        const distinctMissing = new Set(missing.map((m) => m.name.toLowerCase().trim() + '|' + m.employer.toLowerCase())).size;
        expect(created.length).toBe(distinctMissing);
        const ids = [...existing, ...created].map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const c of created) {
          const m = members.find((x) => ownsCard(x, c))!;
          expect(c.carryMinor).toBe(-500);
          expect(!!c.halves).toBe(!!m.halves);
          expect(!!c.discs).toBe(!!m.discs);
        }
        const again = bulkCreate(members, [...existing, ...created], 2026, month);
        expect(again.length).toBe(0);
        const counts = cardCounts(members, [...existing, ...created], 2026, month);
        for (const m of members) expect(counts.get(m.id)!.month).toBeGreaterThanOrEqual(1);
        expect(Math.max(...[...counts.values()].map((c) => c.all - c.month), 0)).toBe(0);
      }),
      runs(Math.max(40, 15 * 3)),
    );
  });
});
