// Phone-photo degradations on top of the camera-like renders: 12 MP downscale, motion blur, JPEG at quality
// 0.6 (a real 8×8 DCT + quantisation on luminance), a glare spot, dim light. Test helpers only.
import { applyH } from '../src/core/homography';
import type { Scene } from '../src/render/scene';
import type { RGBAImage } from '../src/vision/image';

const lumOf = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
function fromLum(w: number, h: number, L: Float32Array): RGBAImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = L[i]; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  return { width: w, height: h, data };
}
function toLum(img: RGBAImage): Float32Array {
  const L = new Float32Array(img.width * img.height);
  for (let i = 0; i < L.length; i++) L[i] = lumOf(img.data, i * 4);
  return L;
}

/** Area-average downscale so the long side is `maxDim` (what the camera does to a 12 MP still). */
export function downTo(img: RGBAImage, maxDim: number): { img: RGBAImage; scale: number } {
  const s = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (s === 1) return { img, scale: 1 };
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  const L = toLum(img), out = new Float32Array(w * h);
  const fx = img.width / w, fy = img.height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    let sum = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { sum += L[yy * img.width + xx]; n++; }
    out[y * w + x] = sum / n;
  }
  return { img: fromLum(w, h, out), scale: s };
}

/** Linear motion blur of `len` px at an angle (box kernel along the direction). */
export function motionBlur(img: RGBAImage, len: number, angleDeg = 0): RGBAImage {
  const L = toLum(img), w = img.width, h = img.height, out = new Float32Array(w * h);
  const a = (angleDeg * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
  const n = Math.max(1, Math.round(len));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = 0; k < n; k++) {
      const t = k - (n - 1) / 2;
      const xx = Math.min(w - 1, Math.max(0, Math.round(x + dx * t))), yy = Math.min(h - 1, Math.max(0, Math.round(y + dy * t)));
      s += L[yy * w + xx];
    }
    out[y * w + x] = s / n;
  }
  return fromLum(w, h, out);
}

const QL = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const COS = Array.from({ length: 64 }, (_, i) => { const x = i >> 3, u = i & 7; return Math.cos(((2 * x + 1) * u * Math.PI) / 16); });
const C = (u: number) => (u ? 1 : Math.SQRT1_2);

/** JPEG-style lossy round trip of the luminance (baseline quantisation table scaled to `quality` 0..1). */
export function jpegLike(img: RGBAImage, quality = 0.6): RGBAImage {
  const q = Math.round(quality * 100);
  const sc = q < 50 ? 5000 / q : 200 - 2 * q;
  const Q = QL.map((v) => Math.max(1, Math.min(255, Math.floor((v * sc + 50) / 100))));
  const w = img.width, h = img.height, L = toLum(img), out = new Float32Array(w * h);
  const blk = new Float32Array(64), F = new Float32Array(64);
  for (let by = 0; by < h; by += 8) for (let bx = 0; bx < w; bx += 8) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) blk[y * 8 + x] = L[Math.min(h - 1, by + y) * w + Math.min(w - 1, bx + x)] - 128;
    for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += blk[y * 8 + x] * COS[x * 8 + u] * COS[y * 8 + v];
      const k = v * 8 + u;
      F[k] = Math.round((0.25 * C(u) * C(v) * s) / Q[k]) * Q[k];
    }
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      if (by + y >= h || bx + x >= w) continue;
      let s = 0;
      for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) s += C(u) * C(v) * F[v * 8 + u] * COS[x * 8 + u] * COS[y * 8 + v];
      out[(by + y) * w + bx + x] = Math.max(0, Math.min(255, 0.25 * s + 128));
    }
  }
  return fromLum(w, h, out);
}

/** A specular reflection: a saturated disc of `rMm` at a frame-mm point. */
export function glareAt(img: RGBAImage, scene: Pick<Scene, 'truth'>, x: number, y: number, rMm: number, scale = 1): RGBAImage {
  const [cx, cy] = applyH(scene.truth.H, x, y).map((v) => v * scale);
  const r = rMm * scene.truth.pxPerMm * scale;
  const data = new Uint8ClampedArray(img.data);
  for (let py = Math.max(0, Math.floor(cy - r)); py <= Math.min(img.height - 1, Math.ceil(cy + r)); py++)
    for (let px = Math.max(0, Math.floor(cx - r)); px <= Math.min(img.width - 1, Math.ceil(cx + r)); px++) {
      if ((px - cx) ** 2 + (py - cy) ** 2 > r * r) continue;
      const i = (py * img.width + px) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
    }
  return { width: img.width, height: img.height, data };
}

/** Dim light: every value times `k` (0.4 = 40% light). */
export function dim(img: RGBAImage, k: number): RGBAImage {
  const data = new Uint8ClampedArray(img.data);
  for (let i = 0; i < data.length; i += 4) { data[i] *= k; data[i + 1] *= k; data[i + 2] *= k; }
  return { width: img.width, height: img.height, data };
}
