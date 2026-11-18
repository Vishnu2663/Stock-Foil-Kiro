// Paid status and carry-forward (Phase 8). Pure, no DOM.
import { latestPaid, isScan, type Receipt } from './history';
import { normName } from './members';
import { monthKey } from './card';

export interface PaidInfo { paid: Receipt; at: string; changed: boolean }

/** "Already paid on <date>", and whether the amount now differs. The latest payment wins. */
export function paidInfo(chain: Receipt[], cardId: string, currentNet?: number): PaidInfo | null {
  const paid = latestPaid(chain, cardId);
  if (!paid) return null;
  return { paid, at: paid.at, changed: currentNet !== undefined && currentNet !== paid.netMinor };
}

export function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/**
 * The carried balance for a new card: only a negative net from the previous month's latest scan for
 * this worker and employer. Payment records are never used.
 */
export function carryForward(chain: Receipt[], worker: string, employer: string, year: number, month: number): number {
  const p = prevMonth(year, month);
  const key = monthKey(p.year, p.month);
  const w = normName(worker);
  const e = normName(employer);
  for (let i = chain.length - 1; i >= 0; i--) {
    const r = chain[i];
    if (!isScan(r) || r.month !== key) continue;
    if (normName(r.worker) !== w || normName(r.employer) !== e) continue;
    return r.netMinor < 0 ? r.netMinor : 0;
  }
  return 0;
}
