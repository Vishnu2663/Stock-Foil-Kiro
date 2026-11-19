// When may the camera capture a half? Pure, so the rule is tested directly.
import type { HalfScan } from './detect';
import { T } from './detect';

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
export interface LivePose<T> { halves: T[]; at: number; scale?: number }
/** What the overlay may draw at time now: nothing when there is no card or the pose is stale. */
export function drawablePose<T, L extends LivePose<T>>(live: L | null, now: number): L | null {
  if (!live || !live.halves.length) return null;
  return now - live.at > POSE_MAX_AGE ? null : live;
}
