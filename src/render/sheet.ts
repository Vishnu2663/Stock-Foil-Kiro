// The printable A4 sheet as SVG at true millimetres (§6.3), plus the shared print model used by the simulator.
import QRCode from 'qrcode';
import { encodePayload, formatCode, formatMoney, cardCode, MONTH_NAMES, type CardSpec, type Role } from '../core/card';
import {
  A4, FRAME_W, FRAME_H, FIDUCIALS, FID_SIZE, QR_BOX, QR_MARGIN_MODULES, HOLE_R, STOCK_ORIGIN, FOIL_ORIGIN,
  NOMINAL_CUT_Y, targetsFor, dayNumberPos, ADV, GRID, type Target,
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

/** QR module size in mm and the symbol's corner positions (frame mm) TL, TR, BR, BL. */
export function qrGeometry(size: number): { mod: number; x0: number; y0: number; corners: [number, number][] } {
  const mod = QR_BOX.size / (size + 2 * QR_MARGIN_MODULES);
  const x0 = QR_BOX.x + QR_MARGIN_MODULES * mod;
  const y0 = QR_BOX.y + QR_MARGIN_MODULES * mod;
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

export interface HalfOptions { payloadOverride?: string }

export function halfSvg(spec: CardSpec, role: Role, opts: HalfOptions = {}): string {
  const payload = opts.payloadOverride ?? encodePayload(spec, role);
  const qr = qrMatrix(payload);
  const targets = targetsFor(spec);
  const title = role === 'S' ? 'STOCK · worker keeps' : 'FOIL · employer keeps';
  const month = `${MONTH_NAMES[spec.month - 1]} ${spec.year}`;
  const code = formatCode(cardCode(spec));
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${FRAME_W}" height="${FRAME_H}" fill="none" stroke="${FRAME_STROKE}" stroke-width="0.3"/>`);
  for (const [cx, cy] of FIDUCIALS)
    parts.push(`<rect x="${cx - FID_SIZE / 2}" y="${cy - FID_SIZE / 2}" width="${FID_SIZE}" height="${FID_SIZE}" fill="#000"/>`);
  parts.push(`<text x="14" y="8.4" font-size="4.4" font-weight="700" fill="#231f1a">${esc(title)}</text>`);
  parts.push(`<text x="14" y="13.6" font-size="3">Worker: <tspan font-weight="700">${esc(spec.worker || '—')}</tspan>   Employer: <tspan font-weight="700">${esc(spec.employer || '—')}</tspan></text>`);
  const carry = spec.carryMinor !== 0 ? `   Carried: ${esc(formatMoney(spec.carryMinor, spec.currency))}` : '';
  parts.push(`<text x="14" y="18.6" font-size="3">Month: ${esc(month)}   Wage: ${esc(formatMoney(spec.rateMinor, spec.currency))} / day${carry}</text>`);
  parts.push(`<text x="14" y="23.4" font-size="3">Advance token: ${esc(formatMoney(spec.advMinor, spec.currency))}   Card code: <tspan font-weight="700">${esc(code)}</tspan></text>`);
  const wk = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  wk.forEach((w, i) => parts.push(`<text x="${GRID.x + i * GRID.cw + GRID.cw / 2}" y="26.4" font-size="2" text-anchor="middle" fill="#6b5f48">${w}</text>`));
  parts.push(`<path d="${qrPath(qr)}" fill="#000"/>`);
  parts.push(`<text x="${QR_BOX.x + QR_BOX.size / 2}" y="${QR_BOX.y + QR_BOX.size + 5}" font-size="4.2" font-weight="700" text-anchor="middle">${esc(code)}</text>`);
  parts.push(`<text x="${QR_BOX.x + QR_BOX.size / 2}" y="${QR_BOX.y + QR_BOX.size + 9.5}" font-size="2.4" text-anchor="middle" fill="#6b5f48">Card ${esc(spec.id)}</text>`);
  parts.push(`<text x="${QR_BOX.x + QR_BOX.size / 2}" y="${QR_BOX.y + QR_BOX.size + 14}" font-size="2.4" text-anchor="middle" fill="#6b5f48">Scan both halves on payday</text>`);
  if (spec.halves) parts.push(`<text x="${QR_BOX.x + QR_BOX.size / 2}" y="${QR_BOX.y + QR_BOX.size + 19}" font-size="2.4" text-anchor="middle">both = full day · one = half day</text>`);
  if (spec.discs) parts.push(`<text x="${QR_BOX.x + QR_BOX.size / 2}" y="${QR_BOX.y + QR_BOX.size + 23.5}" font-size="2.4" text-anchor="middle">punch through the grey disc</text>`);
  const drawn = new Set<string>();
  for (const t of targets) {
    const ck = `${t.cell.x},${t.cell.y}`;
    if (!drawn.has(ck)) {
      drawn.add(ck);
      parts.push(`<rect x="${t.cell.x}" y="${t.cell.y}" width="${t.cell.w}" height="${t.cell.h}" fill="none" stroke="${CELL_STROKE}" stroke-width="0.2"/>`);
      if (t.kind === 'day') {
        const [nx, ny] = dayNumberPos(t.cell, !!spec.halves);
        parts.push(`<text x="${nx}" y="${ny}" font-size="2.3" ${spec.halves ? 'text-anchor="middle"' : ''} fill="#3a3226">${t.n}</text>`);
      } else {
        parts.push(`<text x="${t.cell.x + 1.1}" y="${t.cell.y + 2.6}" font-size="1.9" fill="#3a3226">${t.n}</text>`);
      }
    }
    parts.push(spec.discs
      ? `<circle cx="${t.cx}" cy="${t.cy}" r="${HOLE_R}" fill="${DISC_GREY}"/>`
      : `<circle cx="${t.cx}" cy="${t.cy}" r="${HOLE_R}" fill="none" stroke="${CIRCLE_STROKE}" stroke-width="0.3"/>`);
  }
  parts.push(`<text x="${ADV.x}" y="${ADV.y - 0.8}" font-size="2.3" font-weight="700" fill="#3a3226">Advance</text>`);
  parts.push(`<text x="${ADV.x + ADV.n * ADV.w + 2}" y="${ADV.y + 6.6}" font-size="2.4" fill="#6b5f48">= ${esc(formatMoney(spec.advMinor, spec.currency))} each</text>`);
  return `<g font-family="Helvetica, Arial, sans-serif" fill="#231f1a">${parts.join('')}</g>`;
}

export interface SheetOptions { stockPayload?: string; foilPayload?: string }

export function sheetSvg(spec: CardSpec, opts: SheetOptions = {}): string {
  const wave = makeWave(spec.id);
  const cut = wavePath(wave, NOMINAL_CUT_Y);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${A4.w}mm" height="${A4.h}mm" viewBox="0 0 ${A4.w} ${A4.h}">` +
    `<rect width="${A4.w}" height="${A4.h}" fill="#fff"/>` +
    `<g transform="translate(${STOCK_ORIGIN.x} ${STOCK_ORIGIN.y})">${halfSvg(spec, 'S', { payloadOverride: opts.stockPayload })}</g>` +
    `<path d="${cut}" fill="none" stroke="#555" stroke-width="0.35" stroke-dasharray="2 1.2"/>` +
    `<text x="4" y="${NOMINAL_CUT_Y - 6.5}" font-size="4.5" font-family="Helvetica, Arial, sans-serif">✂</text>` +
    `<text x="10" y="${NOMINAL_CUT_Y - 7}" font-size="2.6" fill="#555" font-family="Helvetica, Arial, sans-serif">cut here</text>` +
    `<g transform="translate(${FOIL_ORIGIN.x} ${FOIL_ORIGIN.y})">${halfSvg(spec, 'F', { payloadOverride: opts.foilPayload })}</g>` +
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
  const DISC = 0.54;
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
