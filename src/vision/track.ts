// The live tracker (scanner-speed R2, R3): where the QR codes were in the last frames, so the next scan looks there
// first. Pure. It never stores a card id or a reading: every live frame still decodes its QR and reads every cell.
import type { Pt } from '../core/homography';
import type { LiveHint } from './detect';

export interface TrackState { qr: Pt[][]; misses: number; frames: number }
export const newTrack = (): TrackState => ({ qr: [], misses: 0, frames: 0 });
/** After this many frames in a row without a card, the last positions are dropped and the whole frame is searched. */
export const TRACK_MAX_MISSES = 2;

/** Update after a scan with the QR corners it found (frame px). */
export function updateTrack(s: TrackState, found: Pt[][]): TrackState {
  if (found.length) return { qr: found.map((q) => q.map((p) => [p[0], p[1]] as Pt)), misses: 0, frames: s.frames + 1 };
  const misses = s.misses + 1;
  return { qr: misses >= TRACK_MAX_MISSES ? [] : s.qr, misses, frames: s.frames + 1 };
}
/** The hint for the next scan, or undefined when nothing is tracked. */
export const hintOf = (s: TrackState): LiveHint | undefined => (s.qr.length ? { qr: s.qr } : undefined);
/** Rescale tracked positions when the frame size changes (e.g. the camera switched resolution). */
export const rescaleTrack = (s: TrackState, k: number): TrackState => (k === 1 ? s : { ...s, qr: s.qr.map((q) => q.map(([x, y]) => [x * k, y * k] as Pt)) });
