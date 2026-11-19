// Card data, card code and QR payload (§6.2). Pure, no DOM.
import { hash53, toBase32, randomBase32, BASE32_RE } from './prng';
import { pairTag, newPairing, SECRET_RE } from './pairing';

export type Role = 'S' | 'F';

export interface CardSpec {
  v: 1;
  id: string;
  year: number;
  month: number;
  rateMinor: number;
  advMinor: number;
  currency: string;
  worker: string;
  employer: string;
  lang: string;
  carryMinor: number;
  pairing?: { sa: string; sf: string };
  halves?: boolean;
  discs?: boolean;
  revisedFrom?: string;
  /** the member this card was issued for (local record only; never in the QR or the card code) */
  memberId?: string;
}

export const DEFAULT_RATE = 50000;
export const DEFAULT_ADV = 10000;
export const MAX_AMOUNT = 200000; // 2,000 major units
export const MAX_CARRY = 10_000_000; // 100,000 major units
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'KES', 'NGN', 'BDT', 'PKR', 'NPR', 'PHP', 'IDR', 'MXN', 'BRL', 'ZAR'];

/** Round and cap to 0..200000 minor units. NaN and non-numbers become 0. */
export function clampAmount(x: unknown): number {
  const n = typeof x === 'number' ? x : Number(x);
  if (Number.isNaN(n)) return 0;
  return Math.min(MAX_AMOUNT, Math.max(0, Math.round(n)));
}

/** A hand-typed carried balance, capped at ±100,000 major units. */
export function clampCarry(x: unknown): number {
  const n = typeof x === 'number' ? x : Number(x);
  if (Number.isNaN(n)) return 0;
  const r = Math.min(MAX_CARRY, Math.max(-MAX_CARRY, Math.round(n)));
  return r === 0 ? 0 : r; // no -0
}

/** '|' and newlines become spaces, trimmed, at most 18 characters. */
export function cleanName(s: unknown): string {
  return String(s ?? '')
    .replace(/[|\r\n]/g, ' ')
    .trim()
    .slice(0, 18);
}

export function cardCode(spec: CardSpec): string {
  const parts: (string | number)[] = [
    spec.v, spec.id, spec.year, spec.month, spec.rateMinor, spec.advMinor,
    spec.currency, spec.worker, spec.employer, spec.lang,
  ];
  if (spec.carryMinor !== 0) parts.push('c' + spec.carryMinor);
  if (spec.halves) parts.push('h2');
  if (spec.discs) parts.push('d3');
  return toBase32(hash53(parts.join('|'), 0x5f0), 6);
}

export const formatCode = (code: string): string => `${code.slice(0, 3)}-${code.slice(3)}`;

export const yyyymm = (year: number, month: number): string => `${year}${String(month).padStart(2, '0')}`;
export const monthKey = (year: number, month: number): string => `${year}-${String(month).padStart(2, '0')}`;

export function newCardId(): string {
  return randomBase32(8);
}

export interface NewCardInput {
  worker: string;
  employer: string;
  year: number;
  month: number;
  rateMinor?: number;
  advMinor?: number;
  currency?: string;
  lang?: string;
  carryMinor?: number;
  pairing?: boolean;
  halves?: boolean;
  discs?: boolean;
  revisedFrom?: string;
  memberId?: string;
}

export function makeCard(input: NewCardInput, id: string = newCardId()): CardSpec {
  const spec: CardSpec = {
    v: 1,
    id,
    year: Math.trunc(input.year),
    month: Math.min(12, Math.max(1, Math.trunc(input.month))),
    rateMinor: clampAmount(input.rateMinor ?? DEFAULT_RATE),
    advMinor: clampAmount(input.advMinor ?? DEFAULT_ADV),
    currency: (input.currency ?? 'INR').toUpperCase(),
    worker: cleanName(input.worker),
    employer: cleanName(input.employer),
    lang: input.lang || 'en',
    carryMinor: Math.round(Number(input.carryMinor ?? 0)) || 0,
  };
  if (input.pairing !== false) spec.pairing = newPairing();
  if (input.halves) spec.halves = true;
  if (input.discs) spec.discs = true;
  if (input.revisedFrom) spec.revisedFrom = input.revisedFrom;
  if (input.memberId) spec.memberId = input.memberId;
  return spec;
}

export function versionTag(spec: CardSpec): string {
  let v = spec.carryMinor !== 0 ? 'SF2' : 'SF1';
  if (spec.pairing) v += 'p';
  if (spec.halves) v += 'h';
  if (spec.discs) v += 'd';
  return v;
}

export function encodePayload(spec: CardSpec, role: Role): string {
  const f: string[] = [
    versionTag(spec), role, spec.id, yyyymm(spec.year, spec.month), String(spec.rateMinor),
    String(spec.advMinor), spec.currency, spec.lang,
  ];
  if (spec.carryMinor !== 0) f.push(String(spec.carryMinor));
  f.push(cardCode(spec));
  if (spec.pairing) {
    f.push(role === 'S' ? spec.pairing.sa : spec.pairing.sf);
    f.push(pairTag(spec.id, spec.pairing.sa, spec.pairing.sf));
  }
  f.push(spec.worker, spec.employer);
  return f.join('|');
}

export interface DecodedHalf {
  raw: string;
  role: Role;
  spec: CardSpec; // pairing is never present here: one half knows only its own secret
  code: string;
  codeOk: boolean;
  paired: boolean;
  secret?: string;
  tag?: string;
}

const UINT_RE = /^\d{1,9}$/;
const INT_RE = /^-?\d{1,9}$/;

export function decodePayload(raw: string): DecodedHalf | null {
  if (typeof raw !== 'string') return null;
  const f = raw.split('|');
  const m = /^SF([12])(p?)(h?)(d?)$/.exec(f[0] ?? '');
  if (!m) return null;
  const two = m[1] === '2';
  const paired = m[2] === 'p';
  const halves = m[3] === 'h';
  const discs = m[4] === 'd';
  const minFields = 1 + 7 + (two ? 1 : 0) + 1 + (paired ? 2 : 0) + 2;
  if (f.length < minFields) return null;
  let i = 1;
  const role = f[i++];
  if (role !== 'S' && role !== 'F') return null;
  const id = f[i++];
  if (!id || !BASE32_RE.test(id)) return null;
  const ym = f[i++];
  if (!/^\d{6}$/.test(ym)) return null;
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(4));
  if (month < 1 || month > 12) return null;
  const rate = f[i++];
  const adv = f[i++];
  if (!UINT_RE.test(rate) || !UINT_RE.test(adv)) return null;
  const rateMinor = Number(rate);
  const advMinor = Number(adv);
  const currency = f[i++];
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const lang = f[i++];
  let carryMinor = 0;
  if (two) {
    const c = f[i++];
    if (!INT_RE.test(c)) return null;
    carryMinor = Number(c);
  }
  const code = f[i++];
  if (code.length !== 6 || !BASE32_RE.test(code)) return null;
  let secret: string | undefined;
  let tag: string | undefined;
  if (paired) {
    secret = f[i++];
    tag = f[i++];
    if (!SECRET_RE.test(secret) || !SECRET_RE.test(tag)) return null;
  }
  const worker = f[i++];
  const employer = f.slice(i).join('|');
  const spec: CardSpec = { v: 1, id, year, month, rateMinor, advMinor, currency, worker, employer, lang, carryMinor };
  if (halves) spec.halves = true;
  if (discs) spec.discs = true;
  const out: DecodedHalf = { raw, role, spec, code, codeOk: cardCode(spec) === code, paired };
  if (paired) {
    out.secret = secret;
    out.tag = tag;
  }
  return out;
}

/** Is this QR text meant to be a Stock & Foil payload at all? */
export const looksLikeOurs = (s: string): boolean => /^SF[12]p?h?d?\|/.test(s);

/** Money formatting: integer minor units only. */
export function formatMoney(minor: number, currency: string): string {
  const neg = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const major = Math.floor(abs / 100);
  const cents = abs % 100;
  const sym: Record<string, string> = {
    INR: '₹', USD: '$', EUR: '€', GBP: '£', KES: 'KSh ', NGN: '₦', BDT: '৳', PKR: 'Rs ', NPR: 'Rs ',
    PHP: '₱', IDR: 'Rp ', MXN: 'MX$', BRL: 'R$', ZAR: 'R ',
  };
  const s = (sym[currency] ?? currency + ' ') + major.toLocaleString('en-US') + (cents ? '.' + String(cents).padStart(2, '0') : '');
  return neg ? '−' + s : s;
}

/** Parse a typed major amount ("500", "500.5") into minor units without floats drifting. */
export function parseMajor(text: string): number {
  const t = String(text).trim().replace(/,/g, '');
  const m = /^(-?)(\d*)(?:\.(\d{0,2})\d*)?$/.exec(t);
  if (!m || (m[2] === '' && !m[3])) return NaN;
  const v = Number(m[2] || '0') * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] ? -v : v;
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
