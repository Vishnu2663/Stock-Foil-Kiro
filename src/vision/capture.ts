// When may the camera capture a half? Pure, so the rule is tested directly.
import type { HalfScan } from './detect';
import { T } from './detect';
import { applyH } from '../core/homography';

export type Blocker =
  | { code: 'surface' }
  | { code: 'corners'; found: number; missed: string[] }
  | { code: 'hidden' }
  | { code: 'far' }
  | { code: 'dark' };

const NAMES = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/**
 * Capture is blocked ONLY when the punch reading cannot be trusted, checked in this order:
 * the surface matches the grey discs; fewer than 4 corner squares; a punch spot is not in the photo;
 * under 2.5 px per mm; paper at or below 0.15 (0..1). The 'partial' warning (card filling the frame),
 * a hidden cut edge, fingers or a bright background never block.
 */
export function captureBlocker(h: HalfScan): Blocker | null {
  if (h.ambiguousSurface) return { code: 'surface' };
  if (h.pose.fiducialsFound < 4) return { code: 'corners', found: h.pose.fiducialsFound, missed: h.pose.fiducials.map((f, i) => (f ? '' : NAMES[i])).filter(Boolean) };
  if (h.cells.some((c) => !Number.isFinite(c.ratio))) return { code: 'hidden' };
  if (h.pose.pxPerMm < 2.5) return { code: 'far' };
  if (!(h.paperRef / 255 > T.darkPhoto)) return { code: 'dark' };
  return null;
}

/** Plain summary of a half for hints and the debug line (no names or ids). */
export function readingSummary(h: HalfScan) {
  const days = [...new Set(h.cells.filter((c) => c.kind === 'day' && c.punched).map((c) => c.n))].sort((a, b) => a - b);
  const adv = h.cells.filter((c) => c.kind === 'adv' && c.punched).map((c) => c.n).sort((a, b) => a - b);
  const unsure = h.cells.filter((c) => c.unsure).length;
  const punched = h.cells.filter((c) => c.punched).length;
  return { days, adv, unsure, punched, blank: h.cells.length - punched };
}

/** The debug line: corner squares (which missed), pose method, px/mm, paper, background ratio, cell counts. */
export function debugLine(h: HalfScan): string {
  const s = readingSummary(h);
  const missed = h.pose.fiducials.map((f, i) => (f ? '' : ['TL', 'TR', 'BL', 'BR'][i])).filter(Boolean);
  const bg = h.bgRef / h.paperRef;
  return `corners ${h.pose.fiducialsFound}/4${missed.length ? ` (missed ${missed.join(',')})` : ''} · ${h.pose.method} · ${h.pose.pxPerMm.toFixed(2)} px/mm · paper ${(h.paperRef / 255).toFixed(2)} · bg/paper ${Number.isFinite(bg) ? bg.toFixed(2) : '–'} · punched ${s.punched} · blank ${s.blank} · unsure ${s.unsure}`;
}

/** The overlay never draws a pose older than this (a hand-held card moves). */
export const POSE_MAX_AGE = 600;
/** Cards lying on a table (check the cut, received mark) move little and take longer to read: a longer limit. */
export const POSE_MAX_AGE_TABLE = 1600;
export interface LivePose<T> { halves: T[]; at: number; scale?: number }
/** What the overlay may draw at time now: nothing when there is no card or the pose is stale. */
export function drawablePose<T, L extends LivePose<T>>(live: L | null, now: number, maxAge = POSE_MAX_AGE): L | null {
  if (!live || !live.halves.length) return null;
  return now - live.at > maxAge ? null : live;
}

// ---------------- join mode ("Check the cut"): both halves in one picture ----------------

export type JoinBlocker =
  | { code: 'both' }
  | { code: 'half'; role: 'S' | 'F'; why: Blocker }
  | { code: 'gap'; gapMm: number }
  | { code: 'closer'; pxPerMm: number }
  | { code: 'darker' }
  | { code: 'edge'; role: 'S' | 'F'; coverage: number };

/** What join capture needs: edge seen on ≥ 60% of each half, ≥ 3 px/mm, a dark table, and a gap between the edges. */
export const JOIN = { coverage: 0.6, pxPerMm: 3, gapMin: 8, gapMax: 60 };

/**
 * The gap between the two cut edges in one picture, in mm: the median distance from points on the stock's
 * nominal cut to the nearest point on the foil's nominal cut (image px over the mean px per mm).
 */
export function joinGap(stock: HalfScan, foil: HalfScan): number {
  const xs = Array.from({ length: 30 }, (_, i) => 6 + i * 6);
  const sp = xs.map((x) => applyH(stock.pose.H, x, 132));
  const fp = xs.map((x) => applyH(foil.pose.H, x, -12));
  const d = sp.map(([x, y]) => Math.min(...fp.map(([u, v]) => Math.hypot(u - x, v - y)))).sort((a, b) => a - b);
  const ppm = (stock.pose.pxPerMm + foil.pose.pxPerMm) / 2;
  return d[Math.floor(d.length / 2)] / Math.max(1e-6, ppm);
}

/** Paper (not table) just beyond the cut while the table beside the half is dark. */
export const touching = (h: HalfScan): boolean =>
  Number.isFinite(h.sideRef) && h.sideRef < h.paperRef * T.contrast && Number.isFinite(h.bgRef) && h.bgRef >= h.paperRef * T.contrast;

/** Why join capture must wait, in the order a person can fix it; null when it may capture. */
export function joinBlocker(stock: HalfScan | undefined, foil: HalfScan | undefined, gapMm: number): JoinBlocker | null {
  if (!stock || !foil) {
    // one half read and paper right beyond its cut while the table beside it is dark: the edges touch or overlap
    const h = stock ?? foil;
    if (h && touching(h)) return { code: 'gap', gapMm: 0 };
    return { code: 'both' };
  }
  if ([stock, foil].some(touching)) return { code: 'gap', gapMm: Math.min(gapMm, 0) };
  for (const h of [stock, foil]) { const why = captureBlocker(h); if (why) return { code: 'half', role: h.decoded.role, why }; }
  if (gapMm < JOIN.gapMin) return { code: 'gap', gapMm };
  const ppm = Math.min(stock.pose.pxPerMm, foil.pose.pxPerMm);
  if (ppm < JOIN.pxPerMm) return { code: 'closer', pxPerMm: ppm };
  if ([stock, foil].some((h) => h.warnings.includes('dark-surface') || h.warnings.includes('edge-surface'))) return { code: 'darker' };
  for (const h of [stock, foil]) {
    if (h.edgeCoverage < JOIN.coverage || h.warnings.includes('edge-hidden')) return { code: 'edge', role: h.decoded.role, coverage: h.edgeCoverage };
  }
  return null;
}

/** 'edges' mode (one half close up for its cut): the same edge rules for that one half, a little closer. */
export function edgeBlocker(h: HalfScan | undefined): JoinBlocker | null {
  if (!h) return { code: 'both' };
  const why = captureBlocker(h);
  if (why) return { code: 'half', role: h.decoded.role, why };
  if (h.pose.pxPerMm < JOIN.pxPerMm + 0.5) return { code: 'closer', pxPerMm: h.pose.pxPerMm };
  if (h.warnings.includes('dark-surface') || h.warnings.includes('edge-surface')) return { code: 'darker' };
  if (h.edgeCoverage < JOIN.coverage || h.warnings.includes('edge-hidden')) return { code: 'edge', role: h.decoded.role, coverage: h.edgeCoverage };
  return null;
}

// ---------------- timing (scanner debug line) ----------------

/** Main-thread stages measured by the camera, added to the worker's stage times. */
export interface FrameTimes { grab: number; blur: number; transfer: number }

/**
 * "grab 9 · blur 4 · xfer 7 · gray 6 · qr 41 · sq 0 · pose 12 · cells 18 · edge 5 · mark 3 · total 105 ms".
 * total = main-thread stages + the worker's total. Missing stages show as 0.
 */
export function timingLine(f: Partial<FrameTimes>, w?: Partial<import('./detect').StageTimes>): string {
  const r = (x?: number) => Math.round(x ?? 0);
  const total = r((f.grab ?? 0) + (f.blur ?? 0) + (f.transfer ?? 0) + (w?.total ?? 0));
  return `grab ${r(f.grab)} · blur ${r(f.blur)} · xfer ${r(f.transfer)} · gray ${r(w?.gray)} · qr ${r(w?.qr)} · sq ${r(w?.squares)} · pose ${r(w?.pose)} · cells ${r(w?.cells)} · edge ${r(w?.edge)} · mark ${r(w?.receipt)} · total ${total} ms`;
}
