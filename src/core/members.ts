// Members roster logic (§6.7). Pure, no DOM.
import { cleanName, makeCard, newCardId, type CardSpec } from './card';

export interface Member {
  id: string;
  name: string;
  employer: string;
  rateMinor: number;
  advMinor: number;
  currency: string;
  lang: string;
  createdAt: string;
  halves?: boolean;
  discs?: boolean;
}

export const normName = (s: string): string => cleanName(s).toLowerCase();

/** A member owns a card when the names and employers match, ignoring case. */
export function ownsCard(m: Pick<Member, 'name' | 'employer'>, c: Pick<CardSpec, 'worker' | 'employer'>): boolean {
  return normName(m.name) === normName(c.worker) && normName(m.employer) === normName(c.employer);
}

export interface CardCounts { all: number; month: number }

export function cardCounts(members: Member[], cards: CardSpec[], year: number, month: number): Map<string, CardCounts> {
  const out = new Map<string, CardCounts>();
  for (const m of members) {
    const mine = cards.filter((c) => ownsCard(m, c));
    out.set(m.id, { all: mine.length, month: mine.filter((c) => c.year === year && c.month === month).length });
  }
  return out;
}

export function membersWithoutCard(members: Member[], cards: CardSpec[], year: number, month: number): Member[] {
  return members.filter((m) => !cards.some((c) => c.year === year && c.month === month && ownsCard(m, c)));
}

export interface BulkOptions {
  pairing?: boolean;
  carryFor?: (m: Member) => number;
  idGen?: () => string;
}

/** One new card for every member without a card that month. Re-running adds nothing. */
export function bulkCreate(members: Member[], cards: CardSpec[], year: number, month: number, opts: BulkOptions = {}): CardSpec[] {
  const used = new Set(cards.map((c) => c.id));
  const gen = opts.idGen ?? newCardId;
  const out: CardSpec[] = [];
  const seen = new Set<string>();
  for (const m of membersWithoutCard(members, cards, year, month)) {
    const k = normName(m.name) + '|' + normName(m.employer);
    if (seen.has(k)) continue; // two roster rows for the same person: one card
    seen.add(k);
    let id = gen();
    while (used.has(id)) id = gen();
    used.add(id);
    out.push(
      makeCard(
        {
          worker: m.name, employer: m.employer, year, month, rateMinor: m.rateMinor, advMinor: m.advMinor,
          currency: m.currency, lang: m.lang, carryMinor: opts.carryFor ? opts.carryFor(m) : 0,
          pairing: opts.pairing !== false, halves: m.halves, discs: m.discs,
        },
        id,
      ),
    );
  }
  return out;
}
