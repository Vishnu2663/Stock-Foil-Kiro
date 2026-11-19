// Snapshots of a captured half: the card quad warped flat from the analysed frame, and the card's own wave
// as an SVG clip path. Used by the step tray and the "tally join" transition.
import type { RGBAImage } from '../vision/image';
import { applyH, type Hom } from '../core/homography';
import { makeWave } from '../core/wave';
import type { Role } from '../core/card';

/** Region of a half in frame mm that the snapshot covers (paper margin plus the cut band). */
export const THUMB = { x0: -6, x1: 192, S: { y0: -6, y1: 140 }, F: { y0: -20, y1: 126 } };
export const THUMB_PPM = 1.6;

/** Warp the half flat (frame mm → frame px through H, bilinear) and return a JPEG data URL. */
export function warpThumb(img: RGBAImage, H: Hom, role: Role, ppm = THUMB_PPM): string {
  const r = THUMB[role];
  const w = Math.round((THUMB.x1 - THUMB.x0) * ppm), h = Math.round((r.y1 - r.y0) * ppm);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const out = g.createImageData(w, h);
  const d = img.data, W = img.width, Hh = img.height;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const [u, v] = applyH(H, THUMB.x0 + (i + 0.5) / ppm, r.y0 + (j + 0.5) / ppm);
    const o = (j * w + i) * 4;
    const x0 = Math.floor(u - 0.5), y0 = Math.floor(v - 0.5);
    if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= Hh - 1) { out.data[o] = 20; out.data[o + 1] = 16; out.data[o + 2] = 12; out.data[o + 3] = 255; continue; }
    const fx = u - 0.5 - x0, fy = v - 0.5 - y0;
    for (let ch = 0; ch < 3; ch++) {
      const a = d[(y0 * W + x0) * 4 + ch], b = d[(y0 * W + x0 + 1) * 4 + ch];
      const cc = d[((y0 + 1) * W + x0) * 4 + ch], e = d[((y0 + 1) * W + x0 + 1) * 4 + ch];
      out.data[o + ch] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + cc * (1 - fx) * fy + e * fx * fy;
    }
    out.data[o + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c.toDataURL('image/jpeg', 0.82);
}

/**
 * Clip path (in "joint" mm: stock frame coordinates, the foil sits 144 mm lower) of one half, cut on the
 * card's own wave, and the seam path itself.
 */
export function wavePaths(id: string): { stock: string; foil: string; seam: string } {
  const wave = makeWave(id);
  const pts: [number, number][] = [];
  for (let x = THUMB.x0; x <= THUMB.x1 + 1e-9; x += 2) pts.push([x, 132 + wave.at(Math.max(0, Math.min(186, x)))]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(2)}`);
  const seam = 'M' + line.join(' L');
  const back = [...line].reverse().join(' L');
  return {
    stock: `M${THUMB.x0} ${THUMB.S.y0} H${THUMB.x1} V${pts[pts.length - 1][1].toFixed(2)} L${back} Z`,
    foil: `${seam} V${144 + THUMB.F.y1} H${THUMB.x0} Z`,
    seam,
  };
}
