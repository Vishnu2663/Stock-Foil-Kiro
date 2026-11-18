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

export interface PayTerms {
  rateMinor: number;
  advMinor: number;
  carryMinor: number;
  halves?: boolean;
  rateChange?: RateChange;
}

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
}

/** Pay for one set of punched keys. */
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
  let unitsBefore = 0;
  let unitsAfter = 0;
  let fullDays = 0;
  let halfDays = 0;
  const rc = terms.rateChange;
  for (const [day, u0] of unitsByDay) {
    const u = Math.min(2, u0);
    if (u === 2) fullDays++;
    else halfDays++;
    if (rc && day >= rc.fromDay) unitsAfter += u;
    else unitsBefore += u;
  }
  const halfUnits = unitsBefore + unitsAfter;
  const newRate = rc ? rc.rateMinor : terms.rateMinor;
  // gross = round(daysBefore × rate + daysAfter × newRate), computed in half units to stay in integers
  const gross = Math.round((unitsBefore * terms.rateMinor + unitsAfter * newRate) / 2);
  const advances = advCount * terms.advMinor;
  const net = gross - advances + terms.carryMinor;
  return {
    halfUnits, days: halfUnits / 2, fullDays, halfDays,
    dayList: [...unitsByDay.keys()].sort((a, b) => a - b),
    unitsBefore, unitsAfter, gross, advCount, advances, carry: terms.carryMinor, net,
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
