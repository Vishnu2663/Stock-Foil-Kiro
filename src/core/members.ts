// Members roster logic (§6.7). Pure, no DOM.
import { cleanName, makeCard, newCardId, type CardSpec } from './card';
import { sortWages, type WageEntry } from './wages';

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
  /** wage history, oldest first; rateMinor/advMinor above are the CURRENT values (kept for older code) */
  wages?: WageEntry[];
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
          pairing: opts.pairing !== false, halves: m.halves, discs: m.discs, memberId: m.id,
        },
        id,
      ),
    );
  }
  return out;
}

// ---------------- wage history ----------------

const ymd = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? { y: 2000, m: 1, d: 1 } : { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };

/** The member's wage history; older members get one entry from createdAt with their current wage. */
export function wagesOf(m: Member): WageEntry[] {
  if (m.wages && m.wages.length) return sortWages(m.wages);
  const c = ymd(m.createdAt);
  return [{ fromYear: c.y, fromMonth: c.m, fromDay: c.d, rateMinor: m.rateMinor, advMinor: m.advMinor }];
}

/** Migrate on load: every member gets a history; nothing else changes. */
export const migrateMember = (m: Member): Member => ({ ...m, wages: wagesOf(m) });

/** The entry in force on a date (the oldest one when history starts later). */
export function wageOn(m: Member, y: number, mo: number, d: number): WageEntry {
  const h = wagesOf(m);
  const k = y * 10000 + mo * 100 + d;
  let cur = h[0];
  for (const e of h) if (e.fromYear * 10000 + e.fromMonth * 100 + e.fromDay <= k) cur = e;
  return cur;
}

/**
 * Append a wage change. History is never overwritten (an entry on the same date is replaced). The member's
 * current rateMinor/advMinor follow the entry in force today.
 */
export function appendWage(m: Member, e: WageEntry, today = new Date()): Member {
  const h = wagesOf(m).filter((x) => !(x.fromYear === e.fromYear && x.fromMonth === e.fromMonth && x.fromDay === e.fromDay));
  const next = { ...m, wages: sortWages([...h, e]) };
  const now = wageOn(next, today.getFullYear(), today.getMonth() + 1, today.getDate());
  return { ...next, rateMinor: now.rateMinor, advMinor: now.advMinor };
}

/** The member a scanned card belongs to: by the issued card's memberId first, then by worker + employer name. */
export function memberForCard(members: Member[], cards: CardSpec[], spec: Pick<CardSpec, 'id' | 'worker' | 'employer'>): Member | undefined {
  const issued = cards.find((c) => c.id === spec.id);
  if (issued?.memberId) { const m = members.find((x) => x.id === issued.memberId); if (m) return m; }
  return members.find((m) => ownsCard(m, spec));
}
