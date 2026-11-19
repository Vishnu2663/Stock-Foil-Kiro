// Comparison of the two halves and pay in three views (§6.6). Integer money only. Pure, no DOM.
import type { CardSpec } from './card';
import { targetsFor } from './layout';

export type CellState = 'both' | 'none' | 'stockOnly' | 'foilOnly';

export interface CellCompare {
  key: string;
  kind: 'day' | 'adv';
  n: number;
  half: 0 | 1 | null;
  state: CellState;
  unsure: boolean;
  manual: boolean;
}

export interface Comparison {
  cells: CellCompare[];
  consistent: boolean;
  unsureCount: number;
  agreed: Set<string>;
  stockOnly: Set<string>;
  foilOnly: Set<string>;
}

export function compareSets(
  spec: Pick<CardSpec, 'year' | 'month' | 'halves'>,
  stock: Set<string>,
  foil: Set<string>,
  unsure: Set<string> = new Set(),
  manual: Set<string> = new Set(),
): Comparison {
  const cells: CellCompare[] = [];
  const agreed = new Set<string>();
  const stockOnly = new Set<string>();
  const foilOnly = new Set<string>();
  for (const t of targetsFor(spec)) {
    const s = stock.has(t.key);
    const f = foil.has(t.key);
    const state: CellState = s && f ? 'both' : s ? 'stockOnly' : f ? 'foilOnly' : 'none';
    if (state === 'both') agreed.add(t.key);
    if (state === 'stockOnly') stockOnly.add(t.key);
    if (state === 'foilOnly') foilOnly.add(t.key);
    cells.push({ key: t.key, kind: t.kind, n: t.n, half: t.half, state, unsure: unsure.has(t.key), manual: manual.has(t.key) });
  }
  return {
    cells,
    consistent: stockOnly.size === 0 && foilOnly.size === 0,
    unsureCount: cells.filter((c) => c.unsure).length,
    agreed,
    stockOnly,
    foilOnly,
  };
}

export interface RateChange { fromDay: number; rateMinor: number }

/** One stretch of days in a month paid at one daily rate (days inclusive). */
export interface RateRange { fromDay: number; toDay: number; rateMinor: number }

export interface PayTerms {
  rateMinor: number;
  advMinor: number;
  carryMinor: number;
  halves?: boolean;
  /** single mid-month change (older API; turned into a schedule) */
  rateChange?: RateChange;
  /** day ranges with their rates; overrides rateMinor/rateChange when given */
  schedule?: RateRange[];
}

/** One line of the pay: days in a range × its rate. */
export interface PayLine { fromDay: number; toDay: number; rateMinor: number; halfUnits: number; days: number; gross: number }

export interface PayView {
  halfUnits: number; // each half unit = ½ day
  days: number; // halfUnits / 2
  fullDays: number;
  halfDays: number;
  dayList: number[]; // dates with any work
  unitsBefore: number;
  unitsAfter: number;
  gross: number;
  advCount: number;
  advances: number;
  carry: number;
  net: number;
  /** gross split by rate range (sums to gross) */
  lines: PayLine[];
}

/** The schedule a set of terms means: explicit, or built from rateMinor and an optional single change. */
export function scheduleOf(terms: Pick<PayTerms, 'rateMinor' | 'rateChange' | 'schedule'>, dim = 31): RateRange[] {
  if (terms.schedule && terms.schedule.length) return terms.schedule;
  const rc = terms.rateChange;
  if (!rc || rc.fromDay <= 1) return rc && rc.fromDay <= 1 ? [{ fromDay: 1, toDay: dim, rateMinor: rc.rateMinor }] : [{ fromDay: 1, toDay: dim, rateMinor: terms.rateMinor }];
  if (rc.fromDay > dim) return [{ fromDay: 1, toDay: dim, rateMinor: terms.rateMinor }];
  return [{ fromDay: 1, toDay: rc.fromDay - 1, rateMinor: terms.rateMinor }, { fromDay: rc.fromDay, toDay: dim, rateMinor: rc.rateMinor }];
}

export const rateOnDay = (s: RateRange[], day: number): number => (s.find((r) => day >= r.fromDay && day <= r.toDay) ?? s[s.length - 1]).rateMinor;

/** Pay for one set of punched keys. gross = round(Σ rate(day) × halfUnits(day) / 2), integer minor units. */
export function payFor(punched: Iterable<string>, terms: PayTerms): PayView {
  const unitsByDay = new Map<number, number>();
  let advCount = 0;
  for (const key of punched) {
    const m = /^([da])(\d+)([ab]?)$/.exec(key);
    if (!m) continue;
    const n = Number(m[2]);
    if (m[1] === 'a') { advCount++; continue; }
    const u = terms.halves ? (m[3] ? 1 : 0) : m[3] ? 0 : 2;
    if (u) unitsByDay.set(n, (unitsByDay.get(n) ?? 0) + u);
  }
  const sched = scheduleOf(terms);
  let unitsBefore = 0, unitsAfter = 0, fullDays = 0, halfDays = 0, total2 = 0;
  const per = sched.map(() => ({ u: 0, sum2: 0 }));
  for (const [day, u0] of unitsByDay) {
    const u = Math.min(2, u0);
    if (u === 2) fullDays++;
    else halfDays++;
    let k = sched.findIndex((r) => day >= r.fromDay && day <= r.toDay);
    if (k < 0) k = sched.length - 1;
    per[k].u += u;
    per[k].sum2 += u * sched[k].rateMinor;
    total2 += u * sched[k].rateMinor;
    if (k === 0) unitsBefore += u; else unitsAfter += u;
  }
  const halfUnits = unitsBefore + unitsAfter;
  const gross = Math.round(total2 / 2);
  // per-line gross, rounded, with the last worked line absorbing the rounding so the lines sum to gross
  const lines: PayLine[] = sched.map((r, i) => ({ fromDay: r.fromDay, toDay: r.toDay, rateMinor: r.rateMinor, halfUnits: per[i].u, days: per[i].u / 2, gross: Math.round(per[i].sum2 / 2) }));
  const diff = gross - lines.reduce((s, l) => s + l.gross, 0);
  if (diff) { const last = [...lines].reverse().find((l) => l.halfUnits > 0) ?? lines[lines.length - 1]; last.gross += diff; }
  const advances = advCount * terms.advMinor;
  const net = gross - advances + terms.carryMinor;
  return {
    halfUnits, days: halfUnits / 2, fullDays, halfDays,
    dayList: [...unitsByDay.keys()].sort((a, b) => a - b),
    unitsBefore, unitsAfter, gross, advCount, advances, carry: terms.carryMinor, net, lines,
  };
}

export interface ThreeViews { agreed: PayView; worker: PayView; employer: PayView; disputed: number }

export function threeViews(cmp: Comparison, terms: PayTerms): ThreeViews {
  const agreed = payFor(cmp.agreed, terms);
  const worker = payFor([...cmp.agreed, ...cmp.stockOnly], terms);
  const employer = payFor([...cmp.agreed, ...cmp.foilOnly], terms);
  return { agreed, worker, employer, disputed: Math.abs(worker.net - employer.net) };
}

/** Days (dates) that have a one-sided circle. */
export function disputedDays(cmp: Comparison): { stock: number[]; foil: number[] } {
  const pick = (s: Set<string>) =>
    [...new Set([...s].filter((k) => k.startsWith('d')).map((k) => Number(/\d+/.exec(k)![0])))].sort((a, b) => a - b);
  return { stock: pick(cmp.stockOnly), foil: pick(cmp.foilOnly) };
}

// ---------------- wage history → the schedule for one card's month ----------------

/** One wage change of a member, effective from a date. */
export interface WageEntry { fromYear: number; fromMonth: number; fromDay: number; rateMinor: number; advMinor: number }
export type WageSource = 'card' | 'current' | 'custom';
export interface WageSchedule { source: WageSource; ranges: RateRange[]; advMinor: number; adjusted: boolean; changes: WageEntry[] }

const dateKey = (y: number, m: number, d: number) => y * 10000 + m * 100 + d;
const entryKey = (e: WageEntry) => dateKey(e.fromYear, e.fromMonth, e.fromDay);
export const sortWages = (w: WageEntry[]): WageEntry[] => [...w].sort((a, b) => entryKey(a) - entryKey(b));

/** Merge neighbouring ranges with the same rate and drop empty ones. */
function tidy(r: RateRange[]): RateRange[] {
  const out: RateRange[] = [];
  for (const x of r) {
    if (x.toDay < x.fromDay) continue;
    const p = out[out.length - 1];
    if (p && p.rateMinor === x.rateMinor && p.toDay + 1 === x.fromDay) p.toDay = x.toDay;
    else out.push({ ...x });
  }
  return out;
}

/** Start from a base rate on day 1 and apply each change (day, rate) in order. Supports several changes. */
export function applyChanges(dim: number, base: number, changes: { fromDay: number; rateMinor: number }[]): RateRange[] {
  const cs = [...changes].filter((c) => c.fromDay >= 1 && c.fromDay <= dim).sort((a, b) => a.fromDay - b.fromDay);
  const out: RateRange[] = [];
  let from = 1, rate = base;
  for (const c of cs) {
    if (c.fromDay > from) out.push({ fromDay: from, toDay: c.fromDay - 1, rateMinor: rate });
    from = c.fromDay; rate = c.rateMinor;
  }
  out.push({ fromDay: from, toDay: dim, rateMinor: rate });
  return tidy(out);
}

/**
 * The rate schedule for a card's month.
 * - 'card': the printed rate all month (the agreement on paper).
 * - 'current': the member's history — the rate in force on the 1st (the printed rate when no entry is that old),
 *   then every change dated inside the month. Advance value = the latest entry on or before the month's last day.
 * - 'custom': given ranges and advance value.
 */
export function wageScheduleFor(
  spec: { year: number; month: number; rateMinor: number; advMinor: number },
  history: WageEntry[] | undefined,
  source: WageSource = 'card',
  custom?: { ranges: RateRange[]; advMinor: number },
  dim = new Date(Date.UTC(spec.year, spec.month, 0)).getUTCDate(),
): WageSchedule {
  const card: RateRange[] = [{ fromDay: 1, toDay: dim, rateMinor: spec.rateMinor }];
  const h = sortWages(history ?? []);
  const start = dateKey(spec.year, spec.month, 1), end = dateKey(spec.year, spec.month, dim);
  const inMonth = h.filter((e) => entryKey(e) >= start && entryKey(e) <= end);
  if (source === 'custom' && custom) {
    const ranges = tidy(custom.ranges);
    return { source, ranges, advMinor: custom.advMinor, adjusted: !sameSchedule(ranges, card) || custom.advMinor !== spec.advMinor, changes: [] };
  }
  if (source === 'current') {
    const before = h.filter((e) => entryKey(e) < start);
    const base = before.length ? before[before.length - 1].rateMinor : spec.rateMinor;
    const ranges = applyChanges(dim, base, inMonth.map((e) => ({ fromDay: e.fromDay, rateMinor: e.rateMinor })));
    const upto = h.filter((e) => entryKey(e) <= end);
    const advMinor = upto.length ? upto[upto.length - 1].advMinor : spec.advMinor;
    return { source, ranges, advMinor, adjusted: !sameSchedule(ranges, card) || advMinor !== spec.advMinor, changes: inMonth };
  }
  return { source: 'card', ranges: card, advMinor: spec.advMinor, adjusted: false, changes: inMonth };
}

export const sameSchedule = (a: RateRange[], b: RateRange[]) =>
  a.length === b.length && a.every((r, i) => r.fromDay === b[i].fromDay && r.toDay === b[i].toDay && r.rateMinor === b[i].rateMinor);

/** Which source to pre-select: the member's history when it has a change dated inside this card's month. */
export const defaultWageSource = (spec: { year: number; month: number; rateMinor: number; advMinor: number }, history?: WageEntry[]): WageSource =>
  wageScheduleFor(spec, history, 'current').changes.length ? 'current' : 'card';
