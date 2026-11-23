// Frame quality gates for the live camera and the vote over recent reads. Pure, no DOM, so they are tested
// directly. None of this changes how one photo is read; it only decides which frames are trusted.
import type { Pt } from '../core/homography';
import type { CellReading, HalfScan } from './detect';
import type { RGBAImage } from './image';

/** Variance of the 4-neighbour Laplacian (after a 3×3 box) on a copy at most `maxW` px wide (luminance 0..255). */
export function sharpness(img: RGBAImage, maxW = 400): number {
  const s = Math.min(1, maxW / img.width);
  const w = Math.max(3, Math.round(img.width * s)), h = Math.max(3, Math.round(img.height * s));
  const g = new Float32Array(w * h);
  // box-average downscale (area sampling keeps real detail and does not invent aliasing edges)
  const fx = img.width / w, fy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let sum = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * img.width + xx) * 4;
        sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; n++;
      }
      g[y * w + x] = sum / n;
    }
  }
  // a 3×3 box first, so sensor noise does not pass for detail
  const sm = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let a = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) a += g[(y + j) * w + x + i];
    sm[y * w + x] = a / 9;
  }
  let m = 0, m2 = 0, n = 0, s1 = 0;
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x;
    const l = sm[i - 1] + sm[i + 1] + sm[i - w] + sm[i + w] - 4 * sm[i];
    m += l; m2 += l * l; n++; s1 += g[i];
  }
  m /= n;
  const lap = m2 / n - m * m;
  const mean = s1 / n;
  // relative to the picture's brightness, so dim light does not look like blur
  return (1e5 * lap) / Math.max(100, mean * mean);
}

/** Below this the frame is skipped as blurred ("Hold still…"). Set from simulated phone frames (see tests). */
export const BLUR_MIN = 60;

/** Share of the frame covered by a quadrilateral (shoelace area / frame area). */
export function fillRatio(outline: Pt[], width: number, height: number): number {
  let a = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i], [x2, y2] = outline[(i + 1) % outline.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2 / Math.max(1, width * height);
}
/** Under this share of the frame the camera asks to move closer (a hint, never a block). */
export const FILL_MIN = 0.35;

/** Fast hand movement from DeviceMotion: rotation over 60°/s or acceleration over 1.6 m/s². */
export function isFastMotion(rot?: { alpha?: number | null; beta?: number | null; gamma?: number | null } | null, acc?: { x?: number | null; y?: number | null; z?: number | null } | null): boolean {
  const r = rot ? Math.hypot(rot.alpha ?? 0, rot.beta ?? 0, rot.gamma ?? 0) : 0;
  const a = acc ? Math.hypot(acc.x ?? 0, acc.y ?? 0, acc.z ?? 0) : 0;
  return r > 60 || a > 1.6;
}

/** The identity of one read for the capture streak: card, role and every punched spot. Any flip changes it. */
export const readKey = (h: HalfScan): string =>
  h.decoded.role + h.decoded.spec.id + ':' + h.cells.filter((c) => c.punched).map((c) => c.key).sort().join(',');

/**
 * Vote over the last reads of one half (oldest first; at most the last 5 are used). A spot is punched when at
 * least 4 of 5 reads (80%, rounded up) say punched, blank when as many say blank and none is unsure there,
 * otherwise it is unsure and keeps the majority. The newest read supplies everything else.
 */
export function voteReads(reads: HalfScan[], window = 5): HalfScan {
  const last = reads.slice(-window);
  const now = last[last.length - 1];
  const same = last.filter((r) => r.decoded.role === now.decoded.role && r.decoded.spec.id === now.decoded.spec.id);
  const n = same.length;
  if (n <= 1) return now;
  const need = Math.ceil(0.8 * n);
  const maps = same.map((r) => new Map(r.cells.map((c) => [c.key, c])));
  const cells: CellReading[] = now.cells.map((c) => {
    let yes = 0, no = 0, uns = 0;
    for (const m of maps) {
      const x = m.get(c.key);
      if (!x || !Number.isFinite(x.ratio)) { uns++; continue; }
      if (x.unsure) uns++;
      if (x.punched) yes++; else no++;
    }
    if (yes >= need && uns < n - need + 1) return { ...c, punched: true, unsure: false };
    if (no >= need && uns < n - need + 1) return { ...c, punched: false, unsure: false };
    return { ...c, punched: yes > no, unsure: true };
  });
  return { ...now, cells };
}

/** Streak length needed before auto-capture, and the tick, on phones vs desktops. */
export const LIVE = { phone: { tick: 300, streak: 3 }, desktop: { tick: 450, streak: 2 } };

/** How far every cell must be from its decision line for the shorter streak (scanner-speed R10). */
export const CLEAR_MARGIN = 0.08;
/**
 * Reads in a row needed before auto-capture: 2 when no cell is unsure and every cell is clearly punched or clearly
 * blank (normal cards: |ratio − threshold| ≥ 0.08; disc cards: ||ratio − grey| − 0.15| ≥ 0.08); otherwise `base`
 * (3 on phones). Never fewer than 2, never more than `base`.
 */
export function streakNeeded(h: HalfScan, base: number, punchRatio = 0.62, discHole = 0.15): number {
  if (base <= 2) return base;
  for (const c of h.cells) {
    if (c.unsure || !Number.isFinite(c.ratio)) return base;
    const d = h.decoded.spec.discs && h.grey !== undefined ? Math.abs(Math.abs(c.ratio - h.grey) - discHole) : Math.abs(c.ratio - punchRatio);
    if (d < CLEAR_MARGIN) return base;
  }
  return 2;
}
