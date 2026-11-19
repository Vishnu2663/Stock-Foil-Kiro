// Local storage: settings, cards, ledger, crew, members. Every access is wrapped in try/catch.
import type { CardSpec } from '../core/card';
import { migrateMember, type Member } from '../core/members';
import { appendReceipt, type Receipt, type ReceiptData } from '../core/history';

export type AiProvider = 'off' | 'builtin' | 'custom';

export interface Settings {
  lang: string;
  aiProvider: AiProvider;
  aiNote: boolean;
  customUrl: string;
  customModel: string;
  customKey: string;
  speakRate: number;
  simple: boolean;
  calibration: { punchRatio?: number; alignTolMm?: number };
  /** Show the scanner debug line under the camera picture. */
  scannerDebug: boolean;
  /** Punch-clock sound when a half is captured (quiet; never with reduced motion or a hidden tab). */
  sounds: boolean;
  /** denominations the payer does not have, per currency (Settings → Notes I have) */
  notesOff: Record<string, number[]>;
  /** keep a small blurred picture of the worker's received mark as evidence (on this device only) */
  keepMarkPic: boolean;
  /** allow those pictures to be downloaded */
  exportMarkPic: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'en',
  aiProvider: 'builtin',
  aiNote: true,
  customUrl: 'https://openrouter.ai/api/v1/chat/completions',
  customModel: 'meta-llama/llama-3.3-70b-instruct:free',
  customKey: '',
  speakRate: 0.9,
  simple: false,
  calibration: {},
  scannerDebug: false,
  sounds: true,
  notesOff: {},
  keepMarkPic: false,
  exportMarkPic: false,
};

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const memory = new Map<string, string>();
const memoryKV: KV = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

export function defaultKV(): KV {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls) {
      const probe = '__sf_probe';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    /* private mode or blocked */
  }
  return memoryKV;
}

let kv: KV | null = null;
const store = (): KV => (kv ??= defaultKV());
export const setKV = (k: KV) => void (kv = k);

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const s = store().getItem(key);
    return s == null ? fallback : (JSON.parse(s) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    store().setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string) {
  try {
    store().removeItem(key);
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  settings: 'sf.settings',
  cards: 'sf.cards',
  ledger: 'sf.ledger',
  crew: 'sf.crew',
  members: 'sf.members',
  prefill: 'sf.prefill',
  storyPace: 'sf.storyPace',
  storyVoice: 'sf.storyVoice',
  brokenVoices: 'sf.brokenVoices',
  owed: 'sf.owed',
  markPics: 'sf.markpics',
};

/** Blurred, low-contrast 96 px pictures of received marks, keyed "card:role:date". Device only. */
export const loadMarkPics = (): Record<string, string> => readJSON<Record<string, string>>(KEYS.markPics, {});
export function saveMarkPic(key: string, dataUrl: string) {
  const all = loadMarkPics();
  all[key] = dataUrl;
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete all[k]; // keep the latest 200
  writeJSON(KEYS.markPics, all);
}
export const clearMarkPics = () => removeKey(KEYS.markPics);

/** Field by field: a field is kept only when its type matches the default. */
export function sanitizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, calibration: {}, notesOff: {} };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const d = DEFAULT_SETTINGS[k];
    const v = r[k];
    if (k === 'notesOff') {
      if (v && typeof v === 'object' && !Array.isArray(v)) for (const [cur, list] of Object.entries(v as Record<string, unknown>)) if (/^[A-Z]{3}$/.test(cur) && Array.isArray(list)) out.notesOff[cur] = list.filter((x): x is number => typeof x === 'number' && x > 0);
      continue;
    }
    if (k === 'calibration') {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const c = v as Record<string, unknown>;
        // live names first; the names used before this build (threshold, tolerance) are still read
        const pr = c.punchRatio ?? c.threshold, at = c.alignTolMm ?? c.tolerance;
        if (typeof pr === 'number' && Number.isFinite(pr)) out.calibration.punchRatio = pr;
        if (typeof at === 'number' && Number.isFinite(at)) out.calibration.alignTolMm = at;
      }
      continue;
    }
    if (typeof v === typeof d && (typeof v !== 'number' || Number.isFinite(v))) (out as unknown as Record<string, unknown>)[k] = v;
  }
  if (!['off', 'builtin', 'custom'].includes(out.aiProvider)) out.aiProvider = DEFAULT_SETTINGS.aiProvider;
  out.speakRate = Math.min(1.5, Math.max(0.5, out.speakRate));
  return out;
}

export function loadSettings(): Settings {
  try {
    const s = store().getItem(KEYS.settings);
    return sanitizeSettings(s ? JSON.parse(s) : null);
  } catch {
    return sanitizeSettings(null);
  }
}

export const saveSettings = (s: Settings) => writeJSON(KEYS.settings, s);

// ---------- cards ----------
export const loadCards = (): CardSpec[] => {
  const v = readJSON<unknown>(KEYS.cards, []);
  return Array.isArray(v) ? (v as CardSpec[]) : [];
};
export const saveCards = (c: CardSpec[]) => writeJSON(KEYS.cards, c);

export function upsertCard(card: CardSpec): CardSpec[] {
  const list = loadCards().filter((c) => c.id !== card.id && c.id !== card.revisedFrom);
  const next = [card, ...list];
  saveCards(next);
  return next;
}

export function upsertCards(cards: CardSpec[]): CardSpec[] {
  const ids = new Set(cards.map((c) => c.id));
  const next = [...cards, ...loadCards().filter((c) => !ids.has(c.id))];
  saveCards(next);
  return next;
}

export function deleteCard(id: string): CardSpec[] {
  const next = loadCards().filter((c) => c.id !== id);
  saveCards(next);
  return next;
}

// ---------- ledger ----------
export const loadLedger = (): Receipt[] => {
  const v = readJSON<unknown>(KEYS.ledger, []);
  return Array.isArray(v) ? (v as Receipt[]) : [];
};
export const saveLedger = (l: Receipt[]) => writeJSON(KEYS.ledger, l);

export function addReceipt(data: ReceiptData): Receipt[] {
  const next = appendReceipt(loadLedger(), data);
  saveLedger(next);
  return next;
}

// ---------- members ----------
export const loadMembers = (): Member[] => {
  const v = readJSON<unknown>(KEYS.members, []);
  return Array.isArray(v) ? (v as Member[]).map(migrateMember) : [];
};
export const saveMembers = (m: Member[]) => writeJSON(KEYS.members, m);

// ---------- crew ----------
export interface CrewRow {
  id: string;
  cardId: string;
  worker: string;
  employer: string;
  month: string;
  currency: string;
  agreedDays: number;
  netMinor: number;
  disputedMinor: number;
  verdict: string;
}
export const loadCrew = (): CrewRow[] => {
  const v = readJSON<unknown>(KEYS.crew, []);
  return Array.isArray(v) ? (v as CrewRow[]) : [];
};
export const saveCrew = (c: CrewRow[]) => writeJSON(KEYS.crew, c);

/** Cards marked "yet to pay" on the payday result (a label only; the hash-chained ledger is unchanged). */
export const loadOwed = (): Set<string> => {
  const v = readJSON<unknown>(KEYS.owed, []);
  return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
};
export function setOwed(cardId: string, owed: boolean): void {
  const s = loadOwed();
  if (owed) s.add(cardId); else s.delete(cardId);
  writeJSON(KEYS.owed, [...s]);
}

export function clearAll() {
  for (const k of Object.values(KEYS)) removeKey(k);
}

export function download(name: string, text: string | Blob, type = 'text/plain') {
  try {
    const blob = typeof text === 'string' ? new Blob([text], { type }) : text;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    /* ignore */
  }
}

export function toCSV(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export const LEDGER_CSV_HEADER = ['seq', 'at', 'cardId', 'month', 'worker', 'employer', 'verdict', 'agreedDays', 'stockOnlyDays', 'foilOnlyDays', 'agreedAdv', 'netMinor', 'disputedMinor', 'currency', 'rateChange', 'halfUnits', 'prev', 'hash'];

export function ledgerToCSV(l: Receipt[]): string {
  return toCSV([LEDGER_CSV_HEADER, ...l.map((r) => [
    r.seq, r.at, r.cardId, r.month, r.worker, r.employer, r.verdict, r.agreedDays.join(' '), r.stockOnlyDays.join(' '),
    r.foilOnlyDays.join(' '), r.agreedAdv, r.netMinor, r.disputedMinor, r.currency,
    r.rateChange ? `${r.rateChange.fromDay}:${r.rateChange.rateMinor}` : '', r.halfUnits ?? '', r.prev, r.hash,
  ])]);
}

export function ledgerFromCSV(text: string): Receipt[] {
  const rows = parseCSV(text).filter((r) => r.length > 1);
  if (!rows.length || rows[0][0] !== 'seq') return [];
  const nums = (s: string) => (s.trim() ? s.trim().split(/\s+/).map(Number) : []);
  return rows.slice(1).map((c) => {
    const r: Receipt = {
      seq: Number(c[0]), at: c[1], cardId: c[2], month: c[3], worker: c[4], employer: c[5], verdict: c[6] as Receipt['verdict'],
      agreedDays: nums(c[7]), stockOnlyDays: nums(c[8]), foilOnlyDays: nums(c[9]), agreedAdv: Number(c[10]),
      netMinor: Number(c[11]), disputedMinor: Number(c[12]), currency: c[13], prev: c[16], hash: c[17],
    };
    if (c[14]) { const [a, b] = c[14].split(':').map(Number); r.rateChange = { fromDay: a, rateMinor: b }; }
    if (c[15] !== '' && c[15] !== undefined) r.halfUnits = Number(c[15]);
    return r;
  });
}
