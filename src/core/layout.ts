// Physical layout in millimetres (§6.3). Frame coordinates: origin at the frame's top-left. Pure, no DOM.
import type { CardSpec } from './card';

export const A4 = { w: 210, h: 297 };
export const MARGIN = 12;
export const FRAME_W = 186;
export const FRAME_H = 120;
export const CUT_GAP = 12;
export const STOCK_ORIGIN = { x: 12, y: 12 };
export const FOIL_ORIGIN = { x: 12, y: 12 + 120 + 24 };
export const NOMINAL_CUT_Y = 12 + 120 + 12;

export const FID_SIZE = 7;
export const FID_INSET = 3;
/** Fiducial centres: top-left, top-right, bottom-left, bottom-right. */
export const FIDUCIALS: [number, number][] = [
  [FID_INSET + FID_SIZE / 2, FID_INSET + FID_SIZE / 2],
  [FRAME_W - FID_INSET - FID_SIZE / 2, FID_INSET + FID_SIZE / 2],
  [FID_INSET + FID_SIZE / 2, FRAME_H - FID_INSET - FID_SIZE / 2],
  [FRAME_W - FID_INSET - FID_SIZE / 2, FRAME_H - FID_INSET - FID_SIZE / 2],
];

export const QR_BOX = { x: 140, y: 14, size: 38 };
/** QR symbol corners in frame mm (TL, TR, BR, BL). The symbol fills the whole 38 mm box. */
export function qrCorners(): [number, number][] {
  return [[QR_BOX.x, QR_BOX.y], [QR_BOX.x + QR_BOX.size, QR_BOX.y], [QR_BOX.x + QR_BOX.size, QR_BOX.y + QR_BOX.size], [QR_BOX.x, QR_BOX.y + QR_BOX.size]];
}
/** Local paper reference points of a cell, clear of the circles, the number and the border. */
export function cellRefPoints(c: { x: number; y: number; w: number; h: number }): [number, number][] {
  const dx = c.w / 2 - 1.6;
  const mx = c.x + c.w / 2;
  return [[mx - dx, c.y + c.h - 1.6], [mx + dx, c.y + c.h - 1.6], [mx + dx, c.y + 2.2]];
}
export const GRID = { x: 14, y: 27, cw: 16, ch: 11, cols: 7, rows: 6 };
export const ADV = { x: 14, y: 99, w: 11.2, h: 11, n: 10 };
export const HOLE_R = 3;
export const SAMPLE_R = 1.6;
export const HALF_DX = 4.1;
export const PUNCH_DY = 0.6;

/** Piece extents in frame mm (the paper after cutting). */
export const PIECE_X0 = -12;
export const PIECE_X1 = 198;
export const STOCK_TOP = -12;
export const FOIL_BOTTOM = 297 - FOIL_ORIGIN.y; // 141

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Monday ... 6 = Sunday, for the 1st of the month. */
export function firstWeekday(year: number, month: number): number {
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
}

export interface Target {
  key: string; // d5, d5a, d5b, a3
  kind: 'day' | 'adv';
  n: number; // date (day) or token number 1..10 (adv)
  half: 0 | 1 | null;
  cx: number;
  cy: number;
  cell: { x: number; y: number; w: number; h: number };
  refs: [number, number][];
}

export function dayCell(year: number, month: number, day: number): { x: number; y: number; w: number; h: number } {
  const idx = firstWeekday(year, month) + day - 1;
  const col = idx % 7;
  const row = Math.floor(idx / 7);
  return { x: GRID.x + col * GRID.cw, y: GRID.y + row * GRID.ch, w: GRID.cw, h: GRID.ch };
}

const targetCache = new Map<string, Target[]>();

export function targetsFor(spec: Pick<CardSpec, 'year' | 'month' | 'halves'>): Target[] {
  const ck = `${spec.year}-${spec.month}-${spec.halves ? 1 : 0}`;
  const hit = targetCache.get(ck);
  if (hit) return hit;
  const out: Target[] = [];
  const dim = daysInMonth(spec.year, spec.month);
  for (let d = 1; d <= dim; d++) {
    const cell = dayCell(spec.year, spec.month, d);
    const cx = cell.x + cell.w / 2;
    const cy = cell.y + cell.h / 2 + PUNCH_DY;
    const refs = cellRefPoints(cell);
    if (spec.halves) {
      out.push({ key: `d${d}a`, kind: 'day', n: d, half: 0, cx: cx - HALF_DX, cy, cell, refs });
      out.push({ key: `d${d}b`, kind: 'day', n: d, half: 1, cx: cx + HALF_DX, cy, cell, refs });
    } else {
      out.push({ key: `d${d}`, kind: 'day', n: d, half: null, cx, cy, cell, refs });
    }
  }
  for (let i = 1; i <= ADV.n; i++) {
    const cell = { x: ADV.x + (i - 1) * ADV.w, y: ADV.y, w: ADV.w, h: ADV.h };
    out.push({
      key: `a${i}`, kind: 'adv', n: i, half: null,
      cx: cell.x + cell.w / 2, cy: cell.y + cell.h / 2 + PUNCH_DY, cell,
      refs: cellRefPoints(cell),
    });
  }
  targetCache.set(ck, out);
  return out;
}

/** Number position inside a day cell (top-left for full-day cards, top-centre for half-day cards). */
export function dayNumberPos(cell: { x: number; y: number; w: number }, halves: boolean): [number, number] {
  return halves ? [cell.x + cell.w / 2, cell.y + 2.5] : [cell.x + 1.3, cell.y + 3.1];
}

// ---------------- right panel: one info box and the RECEIVED box (thumb mark at payday) ----------------

/** The right panel lines up under the QR (x 140–178): one info box, then the RECEIVED box. */
export const INFO_BOX = { x: 140, y: 55, w: 38, h: 14 };
/** The RECEIVED box: double-ruled frame; the worker presses an inked thumb in it on both halves when paid. */
export const RECEIVED_BOX = { x: 140, y: 72, w: 38, h: 34 };
/** The first printed layout (payload flag 'r'): the boxes started 6 mm further left. Cards printed then still read. */
export const INFO_BOX_V1 = { x: 134, y: 55, w: 44, h: 14 };
export const RECEIVED_BOX_V1 = { x: 134, y: 72, w: 38, h: 34 };
type Box = { x: number; y: number; w: number; h: number };
/** The plain inner area the detector reads: 2 mm in from the frame, between the label band and the caption band. */
export const areaOf = (b: Box) => ({ x0: b.x + 2, x1: b.x + b.w - 2, y0: b.y + 6.5, y1: b.y + b.h - 4.5 });
/** The faint dotted thumb guide inside the area (centre and radii, mm). */
export const guideOf = (b: Box) => { const a = areaOf(b); return { cx: (a.x0 + a.x1) / 2, cy: (a.y0 + a.y1) / 2, rx: 7.5, ry: 9.5 }; };
export const RECEIPT_AREA = areaOf(RECEIVED_BOX);
export const THUMB_GUIDE = guideOf(RECEIVED_BOX);
/** Which right-panel layout a card was printed with: true = the first layout, 2 (and anything else) = aligned. */
export function panelFor(spec: { receiptBox?: boolean | 2 }) {
  const v1 = spec.receiptBox === true;
  const box = v1 ? RECEIVED_BOX_V1 : RECEIVED_BOX;
  return { info: v1 ? INFO_BOX_V1 : INFO_BOX, box, area: areaOf(box), guide: guideOf(box) };
}
