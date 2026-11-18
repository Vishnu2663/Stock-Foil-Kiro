// Calibration from photos of really punched cards (Phase 9). Pure, no DOM.
import { median } from './image';
import { holesFromScans, alignment } from './pair';
import type { HalfScan } from './detect';

export interface CalibrationSuggestion { threshold?: number; tolerance?: number }

export interface CalibrationReport {
  halves: number;
  punchedRatios: number[];
  blankRatios: number[];
  holeRadii: number[];
  residuals: number[];
  punchedMedian: number;
  blankMedian: number;
  holeRadius: number;
  suggestion: CalibrationSuggestion | null;
  notes: string[];
}

/** The threshold lies between punched and blank brightness; declines (null) without data. */
export function suggestCalibration(punched: number[], blank: number[], residuals: number[]): CalibrationSuggestion | null {
  const p = median(punched);
  const b = median(blank);
  if (!Number.isFinite(p) || !Number.isFinite(b) || p >= b) return null;
  const out: CalibrationSuggestion = { threshold: Math.round(((p + b) / 2) * 1000) / 1000 };
  const r = residuals.filter(Number.isFinite).sort((x, y) => x - y);
  if (r.length >= 4) {
    const p95 = r[Math.min(r.length - 1, Math.floor(r.length * 0.95))];
    out.tolerance = Math.round(Math.max(0.8, Math.min(2.5, p95 * 1.5 + 0.3)) * 100) / 100;
  }
  return out;
}

export function calibrationReport(halves: HalfScan[]): CalibrationReport {
  const punchedRatios: number[] = [];
  const blankRatios: number[] = [];
  const holeRadii: number[] = [];
  const notes: string[] = [];
  for (const h of halves) {
    if (h.decoded.spec.discs) { notes.push('Disc cards self-calibrate; they are not used for the threshold.'); continue; }
    if (h.warnings.includes('dark-surface')) { notes.push('A photo was not on a dark surface and was skipped.'); continue; }
    for (const c of h.cells) {
      if (!Number.isFinite(c.ratio) || c.unsure) continue;
      (c.punched ? punchedRatios : blankRatios).push(c.ratio);
      if (c.hole && !c.hole.clipped) holeRadii.push(c.hole.r);
    }
  }
  const residuals: number[] = [];
  const stocks = halves.filter((h) => h.decoded.role === 'S');
  for (const s of stocks) {
    const f = halves.find((x) => x.decoded.role === 'F' && x.decoded.spec.id === s.decoded.spec.id);
    if (!f) continue;
    const a = alignment(holesFromScans(s, f), 99);
    residuals.push(...Object.values(a.residuals));
  }
  if (!residuals.length) notes.push('Add both halves of a card to measure alignment.');
  const suggestion = suggestCalibration(punchedRatios, blankRatios, residuals);
  if (!suggestion) notes.push('Not enough punched and blank circles to suggest a threshold.');
  return {
    halves: halves.length, punchedRatios, blankRatios, holeRadii, residuals,
    punchedMedian: median(punchedRatios), blankMedian: median(blankRatios), holeRadius: median(holeRadii),
    suggestion, notes: [...new Set(notes)],
  };
}
