// Hash-chained receipts, history grouping (§6.7, Phase 8). Pure, no DOM.
import { sha256Hex } from './pairing';
import type { RateChange, RateRange, WageSource } from './wages';

export type Verdict =
  | 'genuine-consistent' | 'genuine-disputed' | 'review' | 'inconclusive'
  | 'pair-mismatch' | 'unreliable' | 'paid';

export interface ReceiptData {
  at: string;
  cardId: string;
  month: string; // yyyy-mm
  worker: string;
  employer: string;
  verdict: Verdict;
  agreedDays: number[];
  stockOnlyDays: number[];
  foilOnlyDays: number[];
  agreedAdv: number;
  netMinor: number;
  disputedMinor: number;
  currency: string;
  rateChange?: RateChange;
  /** what the pay was worked out from, when not the printed card wage */
  wage?: { source: WageSource; ranges: RateRange[]; advMinor: number };
  halfUnits?: number;
}

export interface Receipt extends ReceiptData { seq: number; prev: string; hash: string }

export const GENESIS = '0'.repeat(64);

export function receiptString(r: Omit<Receipt, 'hash'>): string {
  const parts: (string | number)[] = [
    r.seq, r.at, r.cardId, r.month, r.worker, r.employer, r.verdict,
    r.agreedDays.join(','), r.stockOnlyDays.join(','), r.foilOnlyDays.join(','),
    r.agreedAdv, r.netMinor, r.disputedMinor, r.currency,
  ];
  if (r.rateChange) parts.push(`rc:${r.rateChange.fromDay}:${r.rateChange.rateMinor}`);
  if (r.halfUnits !== undefined) parts.push(`hu:${r.halfUnits}`);
  if (r.wage) parts.push(`wg:${r.wage.source}:${r.wage.advMinor}:${r.wage.ranges.map((g) => `${g.fromDay}-${g.toDay}@${g.rateMinor}`).join(',')}`);
  parts.push(r.prev);
  return parts.join('|');
}

export const hashReceipt = (r: Omit<Receipt, 'hash'>): string => sha256Hex(receiptString(r));

export function appendReceipt(chain: Receipt[], data: ReceiptData): Receipt[] {
  const seq = chain.length;
  const prev = seq === 0 ? GENESIS : chain[seq - 1].hash;
  const base: Omit<Receipt, 'hash'> = { ...data, seq, prev };
  if (data.rateChange === undefined) delete (base as Partial<Receipt>).rateChange;
  if (data.halfUnits === undefined) delete (base as Partial<Receipt>).halfUnits;
  if (data.wage === undefined) delete (base as Partial<Receipt>).wage;
  return [...chain, { ...base, hash: hashReceipt(base) }];
}

/** Index of the first broken receipt, or −1 when the chain is intact. */
export function verifyChain(chain: Receipt[]): number {
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    const prev = i === 0 ? GENESIS : chain[i - 1].hash;
    if (r.seq !== i || r.prev !== prev) return i;
    const { hash, ...rest } = r;
    if (hashReceipt(rest) !== hash) return i;
  }
  return -1;
}

export const receiptDays = (r: Pick<Receipt, 'halfUnits' | 'agreedDays'>): number =>
  r.halfUnits !== undefined ? r.halfUnits / 2 : r.agreedDays.length;

export const isScan = (r: Receipt): boolean => r.verdict !== 'paid';

/** Latest paid receipt for a card (the latest payment wins). */
export function latestPaid(chain: Receipt[], cardId: string): Receipt | undefined {
  for (let i = chain.length - 1; i >= 0; i--) if (chain[i].cardId === cardId && chain[i].verdict === 'paid') return chain[i];
  return undefined;
}

export function latestScan(chain: Receipt[], cardId: string): Receipt | undefined {
  for (let i = chain.length - 1; i >= 0; i--) if (chain[i].cardId === cardId && isScan(chain[i])) return chain[i];
  return undefined;
}

export interface HistoryRow {
  cardId: string;
  month: string;
  worker: string;
  employer: string;
  currency: string;
  scan: Receipt;
  scans: number;
  paid?: Receipt;
  status: 'paid' | 'unpaid' | 'unmarked';
  amountChanged: boolean;
}

export interface HistoryMonth {
  month: string;
  rows: HistoryRow[];
  totals: Record<string, { all: number; paid: number; unpaid: number }>;
}

/** `owed`: cards the user marked "yet to pay". When given, other unpaid scans are "unmarked" (saved only). */
export interface HistoryFilter { status?: 'all' | 'paid' | 'unpaid' | 'unmarked'; month?: string; query?: string; owed?: Set<string> }

export function buildHistory(chain: Receipt[], filter: HistoryFilter = {}): HistoryMonth[] {
  const byCard = new Map<string, HistoryRow>();
  for (const r of chain) {
    if (!isScan(r)) continue;
    const prev = byCard.get(r.cardId);
    byCard.set(r.cardId, {
      cardId: r.cardId, month: r.month, worker: r.worker, employer: r.employer, currency: r.currency,
      scan: r, scans: (prev?.scans ?? 0) + 1, status: 'unpaid', amountChanged: false,
    });
  }
  const q = (filter.query ?? '').trim().toLowerCase();
  const months = new Map<string, HistoryMonth>();
  for (const row of byCard.values()) {
    const paid = latestPaid(chain, row.cardId);
    if (paid) {
      row.paid = paid;
      row.status = 'paid';
      row.amountChanged = paid.netMinor !== row.scan.netMinor;
    } else if (filter.owed && !filter.owed.has(row.cardId)) {
      row.status = 'unmarked';
    }
    if (filter.status && filter.status !== 'all' && row.status !== filter.status) continue;
    if (filter.month && row.month !== filter.month) continue;
    if (q && !`${row.worker} ${row.employer} ${row.cardId}`.toLowerCase().includes(q)) continue;
    let m = months.get(row.month);
    if (!m) { m = { month: row.month, rows: [], totals: {} }; months.set(row.month, m); }
    m.rows.push(row);
    const t = (m.totals[row.currency] ??= { all: 0, paid: 0, unpaid: 0 });
    t.all += row.scan.netMinor;
    if (row.status === 'paid') t.paid += row.scan.netMinor;
    else t.unpaid += row.scan.netMinor;
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}
