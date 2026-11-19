// The worker's "received" mark at payday: what the two halves say, the already-paid warning, the capture rule
// for the receipt camera and what the ledger stores. Pure, no DOM. Never identifies anyone.
import type { ReceiptKind, ReceiptRead } from '../vision/receipt';

export type MarkState =
  | { state: 'unavailable' } // an older card without the RECEIVED box
  | { state: 'none' }
  | { state: 'both'; kind: ReceiptKind }
  | { state: 'stockOnly'; kind: ReceiptKind }
  | { state: 'foilOnly'; kind: ReceiptKind }
  | { state: 'unclear'; why?: string };

/** The received mark across both halves. */
export function markState(hasBox: boolean, stock?: ReceiptRead, foil?: ReceiptRead): MarkState {
  if (!hasBox) return { state: 'unavailable' };
  const s = stock?.status, f = foil?.status;
  if (s === 'present' && f === 'present') return { state: 'both', kind: stock!.kind === foil!.kind ? stock!.kind! : stock!.kind === 'thumb' || foil!.kind === 'thumb' ? 'thumb' : stock!.kind! };
  if (s === 'unclear' || f === 'unclear') return { state: 'unclear', why: stock?.why ?? foil?.why };
  if (s === 'present') return { state: 'stockOnly', kind: stock!.kind! };
  if (f === 'present') return { state: 'foilOnly', kind: foil!.kind! };
  return { state: 'none' };
}

/** The checks row text (English source; shown through t()). */
export function markText(m: MarkState): { text: string; ok: boolean | null; arg?: string } {
  switch (m.state) {
    case 'unavailable': return { text: 'Received mark not available on this card', ok: null };
    case 'none': return { text: 'Received mark: not yet', ok: null };
    case 'both': return { text: 'Received mark on both halves ✓ ({0})', ok: true, arg: m.kind };
    case 'stockOnly': return { text: 'Received mark only on the worker half', ok: false };
    case 'foilOnly': return { text: 'Received mark only on the employer half', ok: false };
    case 'unclear': return { text: 'Received mark unclear: tilt or keep fingers off', ok: null };
  }
}

/** Both halves already carry the mark: this month looks paid already. */
export const alreadyMarked = (m: MarkState): boolean => m.state === 'both';

/**
 * Receipt camera mode: a half counts once 2 reads in a row find the mark (same kind); an empty box keeps waiting,
 * and only for the card on the result; another card is refused.
 */
export interface ReceiptCapture { S?: ReceiptRead; F?: ReceiptRead; streak: { role: 'S' | 'F' | ''; key: string; n: number } }
export type ReceiptStep = { kind: 'wrong-card' } | { kind: 'wait'; role: 'S' | 'F'; read: ReceiptRead } | { kind: 'got'; role: 'S' | 'F'; read: ReceiptRead };
export function receiptStep(cap: ReceiptCapture, cardId: string, seen: { id: string; role: 'S' | 'F'; read?: ReceiptRead }): { cap: ReceiptCapture; step: ReceiptStep } {
  if (seen.id !== cardId) return { cap: { ...cap, streak: { role: '', key: '', n: 0 } }, step: { kind: 'wrong-card' } };
  const read = seen.read ?? { status: 'unclear', kind: null, coverage: 0, centre: null, quality: 0 };
  const key = read.status + ':' + (read.kind ?? '');
  const same = cap.streak.role === seen.role && cap.streak.key === key;
  // only a mark that is there counts; an empty or unclear box keeps the camera waiting
  const n = read.status !== 'present' ? 0 : same ? cap.streak.n + 1 : 1;
  const streak = { role: seen.role, key, n };
  if (n >= 2) return { cap: { ...cap, [seen.role]: read, streak: { role: '', key: '', n: 0 } }, step: { kind: 'got', role: seen.role, read } };
  return { cap: { ...cap, streak }, step: { kind: 'wait', role: seen.role, read } };
}

export type NoMarkReason = 'no-ink' | 'absent' | 'other';
/** What a payment record carries about the mark. */
export interface PaidMark {
  receipt?: { stock: ReceiptKind | 'none'; foil: ReceiptKind | 'none'; checkedAt: string; signature?: boolean };
  noMark?: { reason: NoMarkReason; note?: string };
}
export function paidMark(cap: Pick<ReceiptCapture, 'S' | 'F'>, at: string, signature = false): PaidMark {
  const k = (r?: ReceiptRead) => (r?.status === 'present' && r.kind ? r.kind : 'none');
  return { receipt: { stock: k(cap.S), foil: k(cap.F), checkedAt: at, ...(signature ? { signature: true } : {}) } };
}
/** Both halves carry a mark in a payment record (green), or paid without one (amber). */
export const paidWithMark = (r: { receipt?: PaidMark['receipt'] }): boolean => !!r.receipt && r.receipt.stock !== 'none' && r.receipt.foil !== 'none';

/**
 * After a payment saved with the worker's mark, the result shows the saved mark (the photos were taken before the
 * thumb was pressed): the checks row then agrees with the "Paid · received mark on both halves" banner.
 */
export function applyPaidMark<R extends { mark?: MarkState | null; checks: { id: string; ok: boolean | null; detail: string }[] }>(
  result: R, paid?: { receipt?: PaidMark['receipt'] } | null,
): R {
  const rec = paid?.receipt;
  if (!rec || !paidWithMark(paid!)) return result;
  const kind = (rec.signature || rec.stock === 'signature' ? 'signature' : rec.stock === 'thumb' || rec.foil === 'thumb' ? 'thumb' : rec.stock) as ReceiptKind;
  const mark: MarkState = { state: 'both', kind };
  const mt = markText(mark);
  const detail = mt.text.replace('{0}', kind);
  const has = result.checks.some((c) => c.id === 'receipt');
  return { ...result, mark, checks: has ? result.checks.map((c) => (c.id === 'receipt' ? { ...c, ok: true, detail } : c)) : result.checks };
}
