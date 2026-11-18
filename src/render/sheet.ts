// The printable A4 sheet as SVG at true millimetres (§6.3), plus the shared print model used by the simulator.
import QRCode from 'qrcode';
import { encodePayload, formatCode, formatMoney, cardCode, MONTH_NAMES, type CardSpec, type Role } from '../core/card';
import {
  A4, FRAME_W, FRAME_H, FIDUCIALS, FID_SIZE, QR_BOX, HOLE_R, STOCK_ORIGIN, FOIL_ORIGIN,
  NOMINAL_CUT_Y, targetsFor, ADV, GRID, type Target,
} from '../core/layout';
import { makeWave, wavePath } from '../core/wave';

export const DISC_GREY = '#9d9d9d';
export const CIRCLE_STROKE = '#b5a47e';
export const CELL_STROKE = '#d9ccaa';
export const FRAME_STROKE = '#cdbb8f';

export interface QrMatrix { size: number; data: Uint8Array; version: number }

const qrCache = new Map<string, QrMatrix>();
export function qrMatrix(text: string): QrMatrix {
  const hit = qrCache.get(text);
  if (hit) return hit;
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const m = { size: q.modules.size, data: q.modules.data, version: q.version };
  if (qrCache.size > 200) qrCache.clear();
  qrCache.set(text, m);
  return m;
}

/** QR module size in mm and the symbol corners (frame mm) TL, TR, BR, BL. The symbol fills the 38 mm box. */
export function qrGeometry(size: number): { mod: number; x0: number; y0: number; corners: [number, number][] } {
  const mod = QR_BOX.size / size;
  const x0 = QR_BOX.x;
  const y0 = QR_BOX.y;
  const s = size * mod;
  return { mod, x0, y0, corners: [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]] };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function qrPath(m: QrMatrix): string {
  const g = qrGeometry(m.size);
  let d = '';
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.data[r * m.size + c]) {
        const x = g.x0 + c * g.mod;
        const y = g.y0 + r * g.mod;
        d += `M${x.toFixed(3)} ${y.toFixed(3)}h${g.mod.toFixed(3)}v${g.mod.toFixed(3)}h${(-g.mod).toFixed(3)}z`;
      }
    }
  }
  return d;
}

export interface HalfOptions { payloadOverride?: string; lang?: string }

/** Retro time-card palette. */
const C = { ink: '#2e2014', soft: '#77593b', line: '#9a7c58', rule: '#b49a74', stamp: '#a8322a', mark: '#111111', box: '#fbf6ea', weekend: '#f8f1e2', stub: '#f7efdf', green: '#1f6b3c' };
const MONO = "'Courier Prime', 'Courier New', Courier, 'Noto Sans Mono', monospace, 'Noto Sans', 'Noto Sans Devanagari', sans-serif";

/** Font size that keeps a monospace word within maxW mm (glyphs ≈ 0.6 em wide, plus letter-spacing). */
const fit = (text: string, maxW: number, size: number, ls = 0) => Math.min(size, maxW / Math.max(1, text.length * 0.6 + (ls * text.length) / size));

function monthLabel(spec: CardSpec, lang: string): string {
  try { return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(spec.year, spec.month - 1, 1))); }
  catch { return `${MONTH_NAMES[spec.month - 1]} ${spec.year}`; }
}
function weekdayLabel(i: number, lang: string): string {
  // 2024-01-01 was a Monday
  try { return new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))).replace('.', ''); }
  catch { return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]; }
}

/** A ticket stub: rectangle with a half-moon notch (r 1.2) at mid-height on each side. */
function stubPath(x: number, y: number, w: number, h: number): string {
  const r = 1.2, my = y + h / 2;
  return `M${x} ${y}H${x + w}V${my - r}A${r} ${r} 0 0 0 ${x + w} ${my + r}V${y + h}H${x}V${my + r}A${r} ${r} 0 0 0 ${x} ${my - r}Z`;
}

/** A double-ruled info box on the right panel with an inner hairline inset 0.8. */
function box(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.box}" stroke="${C.line}" stroke-width="0.3"/>` +
    `<rect x="${x + 0.8}" y="${y + 0.8}" width="${w - 1.6}" height="${h - 1.6}" fill="none" stroke="${C.rule}" stroke-width="0.12"/>`;
}

/**
 * One half in the retro time-card style. Every printed position the scanner relies on is unchanged (frame,
 * corner squares, QR box, cells, circles, advance row). Text keeps ≥ 4 mm of clear paper from the corner squares.
 */
export function halfSvg(spec: CardSpec, role: Role, opts: HalfOptions = {}): string {
  const lang = opts.lang ?? spec.lang ?? 'en';
  const payload = opts.payloadOverride ?? encodePayload(spec, role);
  const qr = qrMatrix(payload);
  const targets = targetsFor(spec);
  const code = formatCode(cardCode(spec));
  const money = (m: number) => esc(formatMoney(m, spec.currency));
  const word = role === 'S' ? 'STOCK' : 'FOIL';
  const keeps = role === 'S' ? 'worker keeps' : 'employer keeps';
  const p: string[] = [];
  // frame: outer rule at the edge plus a hairline 1.1 mm inside
  p.push(`<rect x="0" y="0" width="${FRAME_W}" height="${FRAME_H}" fill="#fff" stroke="${C.line}" stroke-width="0.5"/>`);
  p.push(`<rect x="1.1" y="1.1" width="${FRAME_W - 2.2}" height="${FRAME_H - 2.2}" fill="none" stroke="${C.rule}" stroke-width="0.15"/>`);
  for (const [cx, cy] of FIDUCIALS)
    p.push(`<rect x="${cx - FID_SIZE / 2}" y="${cy - FID_SIZE / 2}" width="${FID_SIZE}" height="${FID_SIZE}" fill="${C.mark}"/>`);
  // header
  const ts = fit(word, 34, 6.4, 0.6);
  p.push(`<text x="14" y="12" font-size="${ts.toFixed(2)}" font-weight="700" letter-spacing="0.6" fill="${C.ink}">${word}<tspan dx="2" font-size="3" font-weight="400" font-style="italic" letter-spacing="0" fill="${C.soft}">${esc(keeps)}</tspan></text>`);
  // red date stamp, slightly rotated
  const ml = monthLabel(spec, lang).toUpperCase();
  p.push(`<rect x="103" y="8.4" width="28" height="9" fill="none" stroke="${C.stamp}" stroke-width="0.55" transform="rotate(-6 117 12.9)"/>`);
  p.push(`<rect x="104" y="9.4" width="26" height="7" fill="none" stroke="${C.stamp}" stroke-width="0.18" transform="rotate(-6 117 12.9)"/>`);
  p.push(`<text x="117" y="14.1" font-size="${fit(ml, 24, 2.5, 0.3).toFixed(2)}" font-weight="700" letter-spacing="0.3" text-anchor="middle" fill="${C.stamp}" transform="rotate(-6 117 12.9)">${esc(ml)}</text>`);
  // names, or write-in blanks (x 14 … < 98)
  const nameRow = (label: string, value: string, x: number, lineEnd: number) =>
    `<text x="${x}" y="18.6" font-size="2.2" fill="${C.soft}">${label}</text>` +
    (value
      ? `<text x="${x + label.length * 1.35 + 2}" y="18.6" font-size="2.6" font-weight="700" fill="${C.ink}">${esc(value)}</text>`
      : `<rect x="${x + label.length * 1.35 + 2}" y="18.9" width="${lineEnd - (x + label.length * 1.35 + 2)}" height="0.15" fill="${C.line}"/>`);
  p.push(nameRow('Worker', spec.worker, 14, 54));
  p.push(nameRow('Employer', spec.employer, 57, 97));
  // weekday labels, weekend in stamp red
  for (let i = 0; i < 7; i++)
    p.push(`<text x="${GRID.x + i * GRID.cw + GRID.cw / 2}" y="${GRID.y - 2.2}" font-size="2.7" font-weight="700" text-anchor="middle" fill="${i >= 5 ? C.stamp : C.ink}">${esc(weekdayLabel(i, lang).toUpperCase())}</text>`);
  // day cells and advance stubs
  const drawn = new Set<string>();
  for (const t of targets) {
    const c = t.cell;
    const ck = `${c.x},${c.y}`;
    if (drawn.has(ck)) continue;
    drawn.add(ck);
    if (t.kind === 'day') {
      const col = Math.round((c.x - GRID.x) / GRID.cw);
      p.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${col >= 5 ? C.weekend : '#fff'}" stroke="${C.line}" stroke-width="0.25"/>`);
      p.push(`<text x="${c.x + 1.1}" y="${c.y + 2.9}" font-size="2.6" font-weight="700" fill="${C.ink}">${t.n}</text>`);
      if (spec.halves) p.push(`<path d="M${c.x + c.w / 2} ${c.y + 3.2}V${c.y + c.h - 0.8}" fill="none" stroke="${C.rule}" stroke-width="0.2" stroke-dasharray="0.6 0.8"/>`);
    } else {
      p.push(`<path d="${stubPath(c.x, c.y, c.w, c.h)}" fill="${C.stub}" stroke="${C.line}" stroke-width="0.25"/>`);
      p.push(`<text x="${c.x + 1}" y="${c.y + 2.8}" font-size="2.3" fill="${C.ink}">${t.n}</text>`);
    }
  }
  // every punch target: (grey disc) + dashed ring
  for (const t of targets) {
    if (spec.discs) p.push(`<circle cx="${t.cx}" cy="${t.cy}" r="${HOLE_R}" fill="${DISC_GREY}"/>`);
    p.push(`<circle cx="${t.cx}" cy="${t.cy}" r="${HOLE_R}" fill="none" stroke="${C.rule}" stroke-width="0.15" stroke-dasharray="0.7 0.7"/>`);
  }
  p.push(`<text x="${ADV.x}" y="${ADV.y - 2}" font-size="2.4" font-weight="700" letter-spacing="0.25" fill="${C.ink}">${esc(`ADVANCES TAKEN (EACH = ${formatMoney(spec.advMinor, spec.currency)})`)}</text>`);
  // QR (fills its 38 mm box)
  p.push(`<path d="${qrPath(qr)}" fill="${C.mark}"/>`);
  // right panel: card code, rate, paired
  const px = 134, pw = 44, mid = px + pw / 2;
  p.push(box(px, 55, pw, 13));
  p.push(`<text x="${mid}" y="59.3" font-size="2.2" letter-spacing="0.5" text-anchor="middle" fill="${C.soft}">CARD</text>`);
  p.push(`<text x="${mid}" y="65" font-size="4" font-weight="700" letter-spacing="0.3" text-anchor="middle" fill="${C.ink}">№ ${esc(code)}</text>`);
  p.push(box(px, 70.5, pw, 13));
  p.push(`<text x="${mid}" y="77" font-size="4" font-weight="700" text-anchor="middle" fill="${C.ink}">${money(spec.rateMinor)}<tspan font-size="2.4" font-weight="400" font-style="italic" fill="${C.soft}"> / day</tspan></text>`);
  p.push(`<text x="${mid}" y="81.2" font-size="2.2" text-anchor="middle" fill="${C.soft}">advance token ${money(spec.advMinor)}</text>`);
  if (spec.pairing) {
    p.push(box(px, 86, pw, 9));
    p.push(`<text x="${mid}" y="91.6" font-size="2.6" font-weight="700" text-anchor="middle" fill="${C.green}">✓ Paired card</text>`);
  }
  // footer
  const fy = FRAME_H - 3.5, right = FRAME_W - 14;
  if (spec.discs) p.push(`<text x="${right}" y="${FRAME_H - 7.4}" font-size="2.4" font-weight="700" text-anchor="end" fill="${C.ink}">Punch out each grey disc.</text>`);
  p.push(`<text x="14" y="${fy}" font-size="2.3" fill="${C.soft}">${role === 'S' ? 'Worker keeps this half. Bring it on payday.' : 'Employer keeps this half. Punch both together each day.'}</text>`);
  const notes: string[] = [];
  if (spec.halves) notes.push('Two circles per day: left = first half, right = second half. Both = full day.');
  if (spec.carryMinor !== 0) notes.push(`Carried from last month: ${formatMoney(spec.carryMinor, spec.currency)}`);
  if (notes.length) p.push(`<text x="${right}" y="${fy}" font-size="${spec.carryMinor !== 0 ? 1.8 : 1.45}" text-anchor="end" fill="${C.ink}">${esc(notes.join(' · '))}</text>`);
  return `<g font-family="${MONO}" fill="${C.ink}">${p.join('')}</g>`;
}

export interface SheetOptions { stockPayload?: string; foilPayload?: string; lang?: string }

export function sheetSvg(spec: CardSpec, opts: SheetOptions = {}): string {
  const wave = makeWave(spec.id);
  const cut = wavePath(wave, NOMINAL_CUT_Y);
  const lang = opts.lang ?? spec.lang;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${A4.w}mm" height="${A4.h}mm" viewBox="0 0 ${A4.w} ${A4.h}">` +
    `<rect width="${A4.w}" height="${A4.h}" fill="#fff"/>` +
    `<g transform="translate(${STOCK_ORIGIN.x} ${STOCK_ORIGIN.y})">${halfSvg(spec, 'S', { payloadOverride: opts.stockPayload, lang })}</g>` +
    `<path d="${cut}" fill="none" stroke="${C.ink}" stroke-width="0.8" stroke-linecap="round" stroke-dasharray="0.01 1.7"/>` +
    `<text x="${A4.w / 2}" y="${NOMINAL_CUT_Y - 7.5}" font-size="2.4" font-weight="700" letter-spacing="0.6" text-anchor="middle" fill="${C.soft}" font-family="${MONO}">✂ CUT ALONG THE WAVY LINE ✂</text>` +
    `<g transform="translate(${FOIL_ORIGIN.x} ${FOIL_ORIGIN.y})">${halfSvg(spec, 'F', { payloadOverride: opts.foilPayload, lang })}</g>` +
    `<text x="${A4.w / 2}" y="${A4.h - 6}" font-size="2.2" text-anchor="middle" fill="${C.line}" font-family="${MONO}">Stock &amp; Foil · Print at 100% on A4, cut on the wave, punch holes through both halves together.</text>` +
    `</svg>`;
}

// ---------- The print model used by the simulator (same geometry as the SVG, without text) ----------

export interface PrintModel {
  spec: CardSpec;
  role: Role;
  payload: string;
  qr: QrMatrix;
  targets: Target[];
  /** Printed luminance (0..1) at frame mm, ignoring holes and the cut. */
  ink: (x: number, y: number) => number;
}

export function printModel(spec: CardSpec, role: Role, payloadOverride?: string): PrintModel {
  const payload = payloadOverride ?? encodePayload(spec, role);
  const qr = qrMatrix(payload);
  const g = qrGeometry(qr.size);
  const targets = targetsFor(spec);
  const PAPER = 1;
  const RING = 0.72;
  const DISC = 0x9d / 255; // the printed disc colour #9d9d9d (≈0.616)
  const CELL = 0.86;
  const FRAME = 0.8;
  const half = FID_SIZE / 2;
  // Bucket targets on an 8mm grid for speed (each target goes into its 3×3 neighbourhood).
  const bucket = new Map<string, Target[]>();
  for (const t of targets) {
    const bx = Math.floor(t.cx / 8), by = Math.floor(t.cy / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const kk = `${bx + i},${by + j}`;
      let list = bucket.get(kk);
      if (!list) { list = []; bucket.set(kk, list); }
      list.push(t);
    }
  }
  const ink = (x: number, y: number): number => {
    for (const [cx, cy] of FIDUCIALS) if (Math.abs(x - cx) <= half && Math.abs(y - cy) <= half) return 0.04;
    const qs = qr.size * g.mod;
    if (x >= g.x0 && y >= g.y0 && x < g.x0 + qs && y < g.y0 + qs) {
      const c = Math.floor((x - g.x0) / g.mod);
      const r = Math.floor((y - g.y0) / g.mod);
      return qr.data[r * qr.size + c] ? 0.04 : PAPER;
    }
    const near = bucket.get(`${Math.floor(x / 8)},${Math.floor(y / 8)}`);
    if (near) {
      for (const t of near) {
        const d = Math.hypot(x - t.cx, y - t.cy);
        if (spec.discs && d <= HOLE_R) return DISC;
        if (!spec.discs && Math.abs(d - HOLE_R) <= 0.15) return RING;
      }
    }
    if ((x >= 0 && x <= 0.3) || (x >= FRAME_W - 0.3 && x <= FRAME_W) || (y >= 0 && y <= 0.3) || (y >= FRAME_H - 0.3 && y <= FRAME_H)) {
      if (x >= 0 && x <= FRAME_W && y >= 0 && y <= FRAME_H) return FRAME;
    }
    if (near) {
      for (const t of near) {
        const c = t.cell;
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
          if (Math.abs(x - c.x) < 0.1 || Math.abs(x - c.x - c.w) < 0.1 || Math.abs(y - c.y) < 0.1 || Math.abs(y - c.y - c.h) < 0.1) return CELL;
        }
      }
    }
    return PAPER;
  };
  return { spec, role, payload, qr, targets, ink };
}
