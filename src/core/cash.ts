// Cash breakdown into notes (§6.6). Integer minor units. Pure, no DOM.

export const NOTES: Record<string, number[]> = {
  INR: [500, 200, 100, 50, 20, 10, 5, 2, 1],
  USD: [100, 50, 20, 10, 5, 1],
  EUR: [200, 100, 50, 20, 10, 5, 2, 1],
  GBP: [50, 20, 10, 5, 2, 1],
  KES: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
  NGN: [1000, 500, 200, 100, 50, 20, 10, 5],
  BDT: [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1],
  PKR: [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1],
  NPR: [1000, 500, 100, 50, 20, 10, 5, 2, 1],
  PHP: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
  IDR: [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100],
  MXN: [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1],
  BRL: [200, 100, 50, 20, 10, 5, 2, 1],
  ZAR: [200, 100, 50, 20, 10, 5, 2, 1],
};
export const FALLBACK_NOTES = [100, 50, 20, 10, 5, 1];
export const MINOR_PER_MAJOR = 100;

export const notesFor = (currency: string): number[] => NOTES[currency] ?? FALLBACK_NOTES;

export interface NoteCount { value: number; count: number } // value in major units
export interface CashBreakdown { amountMinor: number; notes: NoteCount[]; remainderMinor: number }

export function cashBreakdown(amountMinor: number, currency: string): CashBreakdown {
  const amount = Math.trunc(amountMinor);
  const notes: NoteCount[] = [];
  if (amount <= 0) return { amountMinor: amount, notes, remainderMinor: amount };
  let left = amount;
  for (const v of notesFor(currency)) {
    const vm = v * MINOR_PER_MAJOR;
    const c = Math.floor(left / vm);
    if (c > 0) {
      notes.push({ value: v, count: c });
      left -= c * vm;
    }
  }
  return { amountMinor: amount, notes, remainderMinor: left };
}

export const breakdownTotal = (b: CashBreakdown): number =>
  b.notes.reduce((s, n) => s + n.value * MINOR_PER_MAJOR * n.count, 0) + b.remainderMinor;

/** Combine per-person breakdowns: each person is paid separately, so their notes add up. */
export function combineCash(list: CashBreakdown[], currency: string): CashBreakdown {
  const counts = new Map<number, number>();
  let remainder = 0;
  let amount = 0;
  for (const b of list) {
    amount += b.amountMinor;
    remainder += b.remainderMinor;
    for (const n of b.notes) counts.set(n.value, (counts.get(n.value) ?? 0) + n.count);
  }
  const notes = notesFor(currency)
    .filter((v) => counts.has(v))
    .map((v) => ({ value: v, count: counts.get(v)! }));
  for (const [v, c] of counts) if (!notes.some((n) => n.value === v)) notes.push({ value: v, count: c });
  return { amountMinor: amount, notes, remainderMinor: remainder };
}
