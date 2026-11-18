// Image operations on plain arrays. Pure, no DOM: runs in Node tests and in the Web Worker.

export interface RGBAImage { width: number; height: number; data: Uint8ClampedArray }
export interface Gray { width: number; height: number; data: Float32Array } // 0..255

export function toGray(img: RGBAImage): Gray {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { width: img.width, height: img.height, data: out };
}

export function grayToRGBA(g: Gray): Uint8ClampedArray {
  const n = g.width * g.height;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const v = g.data[i];
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return out;
}

/** Bilinear sample; NaN outside the image. */
export function sample(g: Gray, x: number, y: number): number {
  const fx = x - 0.5, fy = y - 0.5;
  if (fx < 0 || fy < 0 || fx > g.width - 1 || fy > g.height - 1) return NaN;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(g.width - 1, x0 + 1), y1 = Math.min(g.height - 1, y0 + 1);
  const ax = fx - x0, ay = fy - y0;
  const d = g.data, w = g.width;
  const a = d[y0 * w + x0], b = d[y0 * w + x1], c = d[y1 * w + x0], e = d[y1 * w + x1];
  return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + e * ax) * ay;
}

export function boxBlur(g: Gray, r: number): Gray {
  const { width: w, height: h, data } = g;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let s = 0, n = 0;
    for (let x = -r; x <= r; x++) if (x >= 0 && x < w) { s += data[y * w + x]; n++; }
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n;
      const xa = x - r, xb = x + r + 1;
      if (xa >= 0) { s -= data[y * w + xa]; n--; }
      if (xb < w) { s += data[y * w + xb]; n++; }
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let y = -r; y <= r; y++) if (y >= 0 && y < h) { s += tmp[y * w + x]; n++; }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      const ya = y - r, yb = y + r + 1;
      if (ya >= 0) { s -= tmp[ya * w + x]; n--; }
      if (yb < h) { s += tmp[yb * w + x]; n++; }
    }
  }
  return { width: w, height: h, data: out };
}

/** 3×3 median denoise. */
export function median3(g: Gray): Gray {
  const { width: w, height: h, data } = g;
  const out = new Float32Array(w * h);
  const v = new Float32Array(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let k = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i)), yy = Math.min(h - 1, Math.max(0, y + j));
        v[k++] = data[yy * w + xx];
      }
      v.sort();
      out[y * w + x] = v[4];
    }
  }
  return { width: w, height: h, data: out };
}

export function unsharp(g: Gray, amount = 1.2, r = 2): Gray {
  const b = boxBlur(g, r);
  const out = new Float32Array(g.data.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, g.data[i] + amount * (g.data[i] - b.data[i])));
  return { width: g.width, height: g.height, data: out };
}

export function upscale2(g: Gray): Gray {
  const w = g.width * 2, h = g.height * 2;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = sample(g, (x + 0.5) / 2, (y + 0.5) / 2);
    out[y * w + x] = Number.isNaN(v) ? g.data[Math.min(g.height - 1, y >> 1) * g.width + Math.min(g.width - 1, x >> 1)] : v;
  }
  return { width: w, height: h, data: out };
}

/** Downscale so the longer side is at most maxDim (area average). */
export function downscale(img: RGBAImage, maxDim: number): { img: RGBAImage; scale: number } {
  const s = Math.max(img.width, img.height) / maxDim;
  if (s <= 1) return { img, scale: 1 };
  const w = Math.round(img.width / s), h = Math.round(img.height / s);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * s), y1 = Math.max(y0 + 1, Math.floor((y + 1) * s));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * s), x1 = Math.max(x0 + 1, Math.floor((x + 1) * s));
      let r = 0, gg = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < img.height; yy++) for (let xx = x0; xx < x1 && xx < img.width; xx++) {
        const i = (yy * img.width + xx) * 4;
        r += img.data[i]; gg += img.data[i + 1]; b += img.data[i + 2]; n++;
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = gg / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { img: { width: w, height: h, data: out }, scale: s };
}

export function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function integral(g: Gray): Float64Array {
  const { width: w, height: h, data } = g;
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  return I;
}

export function boxMean(I: Float64Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number): number {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
  const W = w + 1;
  const area = (x1 - x0) * (y1 - y0);
  if (area <= 0) return NaN;
  return (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / area;
}
