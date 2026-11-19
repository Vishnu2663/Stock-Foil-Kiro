// One view model for everything the payday result shows or saves: the amount, the formula split by wage range,
// the notes, the slip lines, the spoken text and the receipt. All derived from the same PayView, so the screen,
// the slip, Listen/Explain, the ledger and the crew line can never disagree.
import { formatMoney, type CardSpec } from '../core/card';
import { cashBreakdown, type CashBreakdown } from '../core/cash';
import type { PayView, WageSchedule } from '../core/wages';

type T = (s: string, ...a: (string | number)[]) => string;

/** A formula piece; `edit` marks a number the user can tap to change (rate of a range, or the advance value). */
export interface Token { text: string; edit?: { kind: 'rate'; range: number } | { kind: 'adv' }; key: string }

export interface PaydayModel {
  net: number;
  owes: boolean;
  amountText: string;
  tokens: Token[];
  formula: string;
  cash: CashBreakdown;
  /** "₹1,500 + ₹400 = ₹1,900": the notes add up to the net (plus any remainder) */
  checkSum: string;
  lines: { label: string; qty: string; amount: string; minor: number; kind: 'days' | 'adv' | 'carry' }[];
  listen: string;
  wageNote: string | null;
}

const daysTxt = (d: number) => (d % 1 ? `${Math.floor(d)}½` : String(d));

export function paydayModel(view: PayView, spec: CardSpec, wage: WageSchedule, t: T, notesOff: number[] = []): PaydayModel {
  const m = (x: number) => formatMoney(x, spec.currency);
  const split = view.lines.length > 1;
  const tokens: Token[] = [];
  view.lines.forEach((l, i) => {
    if (i) tokens.push({ text: ' + ', key: 'p' + i });
    tokens.push({ text: `${t('{0} days', daysTxt(l.days))} × `, key: 'd' + i });
    tokens.push({ text: m(l.rateMinor), edit: { kind: 'rate', range: i }, key: 'r' + i + ':' + l.rateMinor });
    if (split) tokens.push({ text: ` (${l.fromDay}–${l.toDay})`, key: 'g' + i });
  });
  tokens.push({ text: ` = ${m(view.gross)}`, key: 'gross:' + view.gross });
  if (view.advCount) {
    tokens.push({ text: ` − ${view.advCount} × `, key: 'ac' + view.advCount });
    tokens.push({ text: m(wage.advMinor), edit: { kind: 'adv' }, key: 'adv:' + wage.advMinor });
  }
  if (view.carry) tokens.push({ text: ` ${view.carry < 0 ? '−' : '+'} ${m(Math.abs(view.carry))}`, key: 'carry' });
  tokens.push({ text: ` = ${m(view.net)}`, key: 'net:' + view.net });
  const cash = cashBreakdown(view.net, spec.currency, notesOff);
  const parts = cash.notes.map((n) => m(n.value * 100 * n.count));
  if (cash.remainderMinor > 0) parts.push(m(cash.remainderMinor));
  const checkSum = parts.length ? `${parts.join(' + ')} = ${m(Math.max(0, view.net))}` : '';
  const lines: PaydayModel['lines'] = view.lines
    .filter((l, i) => l.halfUnits > 0 || i === 0 || split)
    .map((l) => ({ label: split ? t('Days {0}–{1}', l.fromDay, l.toDay) : t('Days worked'), qty: `${daysTxt(l.days)} × ${m(l.rateMinor)}`, amount: m(l.gross), minor: l.gross, kind: 'days' as const }));
  if (view.advCount) lines.push({ label: t('Advances'), qty: `${view.advCount} × ${m(wage.advMinor)}`, amount: '−' + m(view.advances), minor: -view.advances, kind: 'adv' });
  if (view.carry) lines.push({ label: t('Carried'), qty: '', amount: (view.carry < 0 ? '−' : '+') + m(Math.abs(view.carry)), minor: view.carry, kind: 'carry' });
  const owes = view.net < 0;
  const who = { e: spec.employer || t('the employer'), w: spec.worker || t('the worker') };
  const listen = owes
    ? t('{0}, the worker, owes {1}, the employer, {2}.', who.w, who.e, m(-view.net))
    : t('{0}, the employer, pays {1}, the worker, {2}.', who.e, who.w, m(view.net)) + ' ' + t('{0} days worked.', daysTxt(view.days));
  const change = wage.changes[0];
  const wageNote = wage.source === 'current' && change
    ? t("{0}'s wage changed to {1} from {2}: applied to days {3}–{4}.", spec.worker || t('the worker'), m(change.rateMinor), `${change.fromDay} ${new Intl.DateTimeFormat(spec.lang || 'en', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(spec.year, spec.month - 1, 1)))}`, change.fromDay, new Date(Date.UTC(spec.year, spec.month, 0)).getUTCDate())
    : null;
  return {
    net: view.net, owes, amountText: m(Math.abs(view.net)), tokens, formula: tokens.map((x) => x.text).join(''), cash, checkSum, lines, listen, wageNote,
  };
}
