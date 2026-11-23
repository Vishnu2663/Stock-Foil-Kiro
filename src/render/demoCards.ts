// The ready-made demo cards for judges (demo-cards/ in the repo). Everything is made with the app's own code: makeCard,
// the printable sheet, pairHoles + renderHalf (the photo simulator used by Demo and Test lab). Expected results are the
// truth, worked out here by plain arithmetic, and tests/demoCards.test.ts checks the real scanner gives them. Pure.
import { makeCard, formatMoney, type CardSpec, type Role } from '../core/card';
import { targetsFor, daysInMonth, HOLE_R, FRAME_W, FOIL_BOTTOM } from '../core/layout';
import { makeWave } from '../core/wave';
import { halfSvg } from './sheet';
import { pairHoles, renderHalf, type PhotoOpts, type Scene } from './scene';
import type { Pt } from '../core/homography';
import type { RGBAImage } from '../vision/image';

/** One story for every card. */
export const STORY = { worker: 'Ramesh', employer: 'Vishnu Builders', year: 2026, month: 11, rateMinor: 70000, advMinor: 10000, currency: 'INR', lang: 'en' };

/** A demo card with a fixed id and fixed pairing secrets, so every file is reproducible. */
export function demoSpec(id: string, sa: string, sf: string, extra: Partial<Parameters<typeof makeCard>[0]> = {}): CardSpec {
  const spec = makeCard({ ...STORY, ...extra }, id);
  if (spec.pairing) spec.pairing = { sa, sf };
  return spec;
}
export const CARD_MAIN = demoSpec('RAMESH01', '7K3QX9ZT2M4B', 'P8D2W6HN5RCA');
export const CARD_OTHER = demoSpec('RAMESH09', 'H4TQ8V2NX7KD', 'Z3MB6RW9PC5E');
export const CARD_SHIFTS = demoSpec('RAMESH04', 'Q2VW8XK3N7TM', 'D9HP4ZC6RB2Y', { halves: true });
export const CARD_PRINT = demoSpec('PR1NTCRD', 'M6Q2ZK8TX4NB', 'W3C7RP9DH5VK');

/** Days 1..n of the month that are not Sundays. */
function workingDays(spec: CardSpec): number[] {
  const out: number[] = [];
  for (let d = 1; d <= daysInMonth(spec.year, spec.month); d++) if (new Date(Date.UTC(spec.year, spec.month - 1, d)).getUTCDay() !== 0) out.push(d);
  return out;
}
/** Set 1: every Monday–Saturday of November 2026 except three absences = 22 days, plus 2 advances. */
export const ABSENT = [11, 19, 26];
const DAYS_22 = workingDays(CARD_MAIN).filter((d) => !ABSENT.includes(d));
/** Set 2: the worker half also shows day 11, which the employer half does not. */
export const EXTRA_DAY = 11;
/** Set 4: the first 21 working days on a two-shift card; the 21st has only its first circle (half a day). */
const SHIFT_DAYS = workingDays(CARD_SHIFTS).slice(0, 21);

export interface DemoSet {
  folder: string; title: string;
  stock: { spec: CardSpec; keys: string[]; file: string };
  foil: { spec: CardSpec; keys: string[]; file: string };
  seed: number;
}
const days = (ds: number[]) => ds.map((d) => `d${d}`);
export const DEMO_SETS: DemoSet[] = [
  { folder: '1-genuine', title: 'Genuine pair', seed: 101,
    stock: { spec: CARD_MAIN, keys: [...days(DAYS_22), 'a1', 'a2'], file: 'stock.jpg' },
    foil: { spec: CARD_MAIN, keys: [...days(DAYS_22), 'a1', 'a2'], file: 'foil.jpg' } },
  { folder: '2-extra-hole', title: 'An extra hole on the worker half', seed: 202,
    stock: { spec: CARD_MAIN, keys: [...days(DAYS_22), `d${EXTRA_DAY}`, 'a1', 'a2'], file: 'stock.jpg' },
    foil: { spec: CARD_MAIN, keys: [...days(DAYS_22), 'a1', 'a2'], file: 'foil.jpg' } },
  { folder: '3-wrong-half', title: 'A foil from another card', seed: 303,
    stock: { spec: CARD_MAIN, keys: [...days(DAYS_22), 'a1', 'a2'], file: 'stock.jpg' },
    foil: { spec: CARD_OTHER, keys: [...days(DAYS_22), 'a1', 'a2'], file: 'foil-from-another-card.jpg' } },
  { folder: '4-two-shifts', title: 'Two shifts a day (half days)', seed: 404,
    stock: { spec: CARD_SHIFTS, keys: [...SHIFT_DAYS.flatMap((d, i) => (i === SHIFT_DAYS.length - 1 ? [`d${d}a`] : [`d${d}a`, `d${d}b`])), 'a1'], file: 'stock.jpg' },
    foil: { spec: CARD_SHIFTS, keys: [...SHIFT_DAYS.flatMap((d, i) => (i === SHIFT_DAYS.length - 1 ? [`d${d}a`] : [`d${d}a`, `d${d}b`])), 'a1'], file: 'foil.jpg' } },
];

/** What the scanner must report for a set (the truth). */
export interface Expected {
  set: string; files: { stock: string; foil: string }; cardId: string;
  verdict: 'genuine-consistent' | 'genuine-disputed' | 'pair-mismatch';
  days: number | null; fullDays: number | null; halfDays: number | null; advances: number | null;
  netMinor: number | null; amount: string | null;
  stockOnlyDays: number[]; foilOnlyDays: number[]; disputedMinor: number;
  explain: string;
}
const dayOf = (k: string) => Number(/^d(\d+)/.exec(k)?.[1]);
export function expectedFor(s: DemoSet): Expected {
  const base = { set: s.folder, files: { stock: s.stock.file, foil: s.foil.file }, cardId: s.stock.spec.id };
  if (s.stock.spec.id !== s.foil.spec.id) {
    return { ...base, verdict: 'pair-mismatch', days: null, fullDays: null, halfDays: null, advances: null, netMinor: null, amount: null,
      stockOnlyDays: [], foilOnlyDays: [], disputedMinor: 0, explain: 'The two halves are from different cards: not a pair, nothing is paid.' };
  }
  const spec = s.stock.spec;
  const S = new Set(s.stock.keys), F = new Set(s.foil.keys);
  const agreed = [...S].filter((k) => F.has(k));
  // units of half a day per date: halves cards have two circles (½ day each), normal cards one circle (1 day)
  const units = (keys: string[]) => {
    const m = new Map<number, number>();
    for (const k of keys) if (k.startsWith('d')) m.set(dayOf(k), (m.get(dayOf(k)) ?? 0) + (spec.halves ? 1 : 2));
    return m;
  };
  const u = units(agreed);
  const half = [...u.values()].reduce((a, b) => a + b, 0);
  const full = [...u.values()].filter((v) => v === 2).length, halfDays = [...u.values()].filter((v) => v === 1).length;
  const adv = agreed.filter((k) => k.startsWith('a')).length;
  const net = (half * spec.rateMinor) / 2 - adv * spec.advMinor;
  const only = (a: Set<string>, b: Set<string>) => [...new Set([...a].filter((k) => !b.has(k) && k.startsWith('d')).map(dayOf))].sort((x, y) => x - y);
  const stockOnly = only(S, F), foilOnly = only(F, S);
  const extraUnits = [...S].filter((k) => !F.has(k) && k.startsWith('d')).length * (spec.halves ? 1 : 2);
  const disputed = (extraUnits * spec.rateMinor) / 2;
  const daysTxt = half % 2 ? `${Math.floor(half / 2)}½` : String(half / 2);
  return {
    ...base, verdict: stockOnly.length || foilOnly.length ? 'genuine-disputed' : 'genuine-consistent',
    days: half / 2, fullDays: full, halfDays, advances: adv, netMinor: net, amount: formatMoney(net, spec.currency),
    stockOnlyDays: stockOnly, foilOnlyDays: foilOnly, disputedMinor: disputed,
    explain: `${daysTxt} days × ${formatMoney(spec.rateMinor, spec.currency)} − ${adv} × ${formatMoney(spec.advMinor, spec.currency)} = ${formatMoney(net, spec.currency)}` +
      (stockOnly.length ? `; day ${stockOnly.join(', ')} is only on the worker half: flagged, not paid (${formatMoney(disputed, spec.currency)} disputed)` : ''),
  };
}

// ---------------- the photos ----------------

/** Mild, realistic camera settings: ≤ 10° rotation, a little tilt, slight blur and noise, even light, dark table, ~1600 px. */
export const PHOTO: Record<Role, PhotoOpts> = {
  S: { pxPerMm: 6.0, rotationDeg: -6, tiltXDeg: 2, tiltYDeg: -1.5, blur: 0.6, noise: 0.008, light: 0.08, lightAngleDeg: 30, background: 0.1 },
  F: { pxPerMm: 6.0, rotationDeg: 5, tiltXDeg: -1.5, tiltYDeg: 2, blur: 0.7, noise: 0.008, light: 0.08, lightAngleDeg: 210, background: 0.11 },
};
/** The printed ink of a half (frame mm → 0..1): from the real sheet with its text (rendered by the browser). */
export type Ink = (x: number, y: number) => number;

/** Both photos of a set. Halves of the same card are punched together (pairHoles), like the real card. */
export function photographSet(s: DemoSet, inkOf: (spec: CardSpec, role: Role) => Ink): { stock: Scene; foil: Scene } {
  const same = s.stock.spec.id === s.foil.spec.id;
  const holes = same
    ? pairHoles({ spec: s.stock.spec, stockPunched: s.stock.keys, foilPunched: s.foil.keys, seed: s.seed, stack: { dx: 0.2, dy: -0.15, rotDeg: 0.15 } })
    : { stockCentres: pairHoles({ spec: s.stock.spec, stockPunched: s.stock.keys, foilPunched: [], seed: s.seed }).stockCentres,
        foilCentres: pairHoles({ spec: s.foil.spec, stockPunched: [], foilPunched: s.foil.keys, seed: s.seed + 1 }).foilCentres };
  const stock = renderHalf({ spec: s.stock.spec, role: 'S', punched: Object.keys(holes.stockCentres), holeCentres: holes.stockCentres, ink: inkOf(s.stock.spec, 'S') }, { seed: s.seed * 2 + 1, ...PHOTO.S });
  const foil = renderHalf({ spec: s.foil.spec, role: 'F', punched: Object.keys(holes.foilCentres), holeCentres: holes.foilCentres, ink: inkOf(s.foil.spec, 'F') }, { seed: s.seed * 2 + 2, ...PHOTO.F });
  return { stock, foil };
}

// ---------------- the punched page (print/punched-genuine.pdf) ----------------
// One half per A4 page, cut along its wave, on a dark background, the punched circles as dark discs. To the scanner
// that is exactly a cut half lying on a dark table, so a phone can scan it from a screen or a print.

/** Page origin (mm) of the half's frame. */
export const PAGE_ORIGIN: Record<Role, { x: number; y: number }> = { S: { x: 12, y: 40 }, F: { x: 12, y: 70 } };
/** The dark background and hole colour, and its luminance (0..1). */
export const DARK = '#151311';
export const DARK_LUM = (0.299 * 0x15 + 0.587 * 0x13 + 0.114 * 0x11) / 255;

/** Is frame point (x, y) on the paper of this half (inside its piece, on its side of the wave)? */
export function onPaper(spec: CardSpec, role: Role, x: number, y: number): boolean {
  if (x < -12 || x > FRAME_W + 12) return false;
  const w = makeWave(spec.id).at(x);
  return role === 'S' ? y >= -12 && y <= 132 + w : y >= w - 12 && y <= FOIL_BOTTOM;
}
/** Hole centres (frame mm) of the punched keys: the printed circle centres. */
export const holeCentresOf = (spec: CardSpec, keys: string[]): Pt[] => targetsFor(spec).filter((t) => keys.includes(t.key)).map((t) => [t.cx, t.cy] as Pt);

export function punchedPageSvg(spec: CardSpec, role: Role, keys: string[]): string {
  const o = PAGE_ORIGIN[role];
  const wave = makeWave(spec.id);
  const pts: string[] = [];
  for (let x = FRAME_W + 12; x >= -12; x -= 1) pts.push(`L${(o.x + x).toFixed(2)} ${(o.y + (role === 'S' ? 132 : -12) + wave.at(x)).toFixed(2)}`);
  const paper = role === 'S'
    ? `M${o.x - 12} ${o.y - 12} L${o.x + FRAME_W + 12} ${o.y - 12} ${pts.join(' ')} Z`
    : `M${o.x - 12} ${o.y + FOIL_BOTTOM} L${o.x + FRAME_W + 12} ${o.y + FOIL_BOTTOM} ${pts.join(' ')} Z`;
  const holes = holeCentresOf(spec, keys).map(([cx, cy]) => `<circle cx="${(o.x + cx).toFixed(2)}" cy="${(o.y + cy).toFixed(2)}" r="${HOLE_R}" fill="${DARK}"/>`).join('');
  const label = role === 'S' ? 'WORKER HALF (STOCK)' : 'EMPLOYER HALF (FOIL)';
  const font = "font-family=\"system-ui, -apple-system, 'Segoe UI', sans-serif\"";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">` +
    `<rect width="210" height="297" fill="${DARK}"/>` +
    `<text x="105" y="12" font-size="4.2" font-weight="700" text-anchor="middle" fill="#e9dcc3" ${font}>Stock &amp; Foil demo card · ${label}</text>` +
    `<text x="105" y="19" font-size="3" text-anchor="middle" fill="#b5a891" ${font}>Payday scan → hold the phone over this half (the whole half in view). Then show the other page.</text>` +
    `<path d="${paper}" fill="#fff"/>` +
    `<g transform="translate(${o.x} ${o.y})">${halfSvg(spec, role)}</g>` +
    holes +
    `<text x="105" y="287" font-size="3" text-anchor="middle" fill="#b5a891" ${font}>Generated by the app (the printable sheet, cut out on a dark background, punched holes drawn as dark discs). Print at 100% or show on a screen.</text>` +
    `</svg>`;
}

/** The same page as pixels (for the test): ink from the printed sheet, dark beyond the cut, dark discs for holes. */
export function punchedPageBitmap(spec: CardSpec, role: Role, keys: string[], ink: Ink, pxPerMm: number): RGBAImage {
  const o = PAGE_ORIGIN[role];
  const W = Math.round(210 * pxPerMm), H = Math.round(297 * pxPerMm);
  const holes = holeCentresOf(spec, keys);
  const data = new Uint8ClampedArray(W * H * 4);
  const dark = DARK_LUM * 255;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const x = (px + 0.5) / pxPerMm - o.x, y = (py + 0.5) / pxPerMm - o.y;
    let v = dark;
    if (onPaper(spec, role, x, y) && !holes.some(([hx, hy]) => (x - hx) ** 2 + (y - hy) ** 2 <= HOLE_R * HOLE_R)) v = 255 * ink(x, y);
    const i = (py * W + px) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { width: W, height: H, data };
}
