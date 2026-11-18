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
export const QR_MARGIN_MODULES = 1;
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
    const refs: [number, number][] = [
      [cell.x + cell.w - 1.6, cell.y + 1.4],
      [cell.x + 1.6, cell.y + cell.h - 1.2],
      [cell.x + cell.w - 1.6, cell.y + cell.h - 1.2],
    ];
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
      refs: [
        [cell.x + cell.w - 1.3, cell.y + 1.4],
        [cell.x + 1.3, cell.y + cell.h - 1.2],
        [cell.x + cell.w - 1.3, cell.y + cell.h - 1.2],
      ],
    });
  }
  targetCache.set(ck, out);
  return out;
}

/** Number position inside a day cell (top-left for full-day cards, top-centre for half-day cards). */
export function dayNumberPos(cell: { x: number; y: number; w: number }, halves: boolean): [number, number] {
  return halves ? [cell.x + cell.w / 2, cell.y + 2.5] : [cell.x + 1.3, cell.y + 3.1];
}
