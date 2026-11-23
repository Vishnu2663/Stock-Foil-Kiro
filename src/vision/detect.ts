// Scanner pipeline per photo: QR search, pose from the four corner squares, punch reading, cut edge, warnings.
// Pure, no DOM: the same code runs in the Web Worker, on the main thread and in Node tests.
// Luminance is 0..255 here; ratios and the 0..1 limits below are converted where they are used.
import jsQR from 'jsqr';
import { decodePayload, looksLikeOurs, type DecodedHalf, type CardSpec, type Role } from '../core/card';
import { applyH, findAffine, solveHomography, localScale, type Hom, type Pt } from '../core/homography';
import {
  FIDUCIALS, FID_SIZE, SAMPLE_R, panelFor, QR_BOX, targetsFor, PIECE_X0, PIECE_X1, STOCK_TOP, FOIL_BOTTOM, FRAME_W, FRAME_H, qrCorners,
} from '../core/layout';
import { readReceipt, minRG, type ReceiptRead } from './receipt';
import { toGray, grayToRGBA, sample, boxBlur, unsharp, upscale2, median, type Gray, type RGBAImage } from './image';

// ---------------- thresholds ----------------
export const T = {
  punch: 0.62, // punched when centre / local paper <= this
  unsureLoK: 0.774, // unsure band = punch × [0.774, 1.258] (0.48–0.78 at the default)
  unsureHiK: 1.258,
  discNominal: 0.62, // printed grey disc relative to paper
  discWindow: 0.17, // ratios this close to 0.62 are used to measure the grey
  discHole: 0.15, // a disc this far from the grey is a hole
  discUnsureK: 0.55, // unsure when between 0.55 × 0.15 and 0.15 from the grey
  ambiguous: 0.26, // surface this close to the grey: holes cannot be told from discs
  contrast: 0.72, // background darker than 0.72 × paper: cut edge and holes are visible
  darkPhoto: 0.15, // paper at or below 0.15 (0..1): too dark
  glareLum: 250, // a spot pixel this bright (0..255) is glare when the paper itself is darker
  glareShare: 0.3, // more than this share of a spot's pixels in glare: unsure
  glarePaper: 235, // glare only counts when the paper reference is below this (not an overexposed photo)
};
/** The unsure band for a punch threshold, scaled (not shifted) like the live scanner. */
export const unsureBand = (punchRatio = T.punch): [number, number] => [punchRatio * T.unsureLoK, punchRatio * T.unsureHiK];

export type WarningCode =
  | 'partial' | 'spots-hidden' | 'few-fiducials' | 'low-contrast' | 'dark-surface' | 'edge-surface' | 'ambiguous-surface'
  | 'far' | 'blurry' | 'dark-photo' | 'edge-hidden' | 'glare';

export const WARNING_TEXT: Record<WarningCode, string> = {
  partial: 'Part of the half is outside the photo. Show the whole half.',
  'spots-hidden': 'Some punch spots are outside the photo or cut off. Retake with the whole half in view.',
  'few-fiducials': 'Not all four corner squares were found. Keep the whole half in the photo.',
  'low-contrast': 'Low contrast. Use more light.',
  'dark-surface': 'Place the halves apart on a dark surface so holes and the cut edge show.',
  'edge-surface': 'The cut edge is hard to see on this surface. Put the halves apart on a plain, contrasting surface.',
  'ambiguous-surface': 'This surface is about the same shade as the grey discs, so holes are hard to tell from discs. Put the card on a clearly darker or lighter surface.',
  far: 'The card is too far away. Move closer.',
  blurry: 'The photo is blurred or bent. Hold still and keep the card flat.',
  'dark-photo': 'The photo is too dark. Use more light.',
  'edge-hidden': 'Keep fingers off the wavy edge so it can be checked.',
  glare: 'Glare on some spots: tilt the card a little to avoid the reflection.',
};

// ---------------- QR ----------------

export interface QRHit { data: string; corners: Pt[]; version: number; level: number }

function fillQuad(rgba: Uint8ClampedArray, w: number, h: number, quad: Pt[], grow: number) {
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4;
  const cy = quad.reduce((s, p) => s + p[1], 0) / 4;
  const q = quad.map(([x, y]) => [cx + (x - cx) * grow, cy + (y - cy) * grow] as Pt);
  const minX = Math.max(0, Math.floor(Math.min(...q.map((p) => p[0]))));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(...q.map((p) => p[0]))));
  const minY = Math.max(0, Math.floor(Math.min(...q.map((p) => p[1]))));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(...q.map((p) => p[1]))));
  const inside = (x: number, y: number) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4];
      const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (c !== 0) {
        if (sign === 0) sign = Math.sign(c);
        else if (Math.sign(c) !== sign) return false;
      }
    }
    return true;
  };
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (inside(x + 0.5, y + 0.5)) {
      const i = (y * w + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
    }
  }
}

function runJsQR(g: Gray, scale: number, maxHits: number, level: number, inversion: 'attemptBoth' | 'dontInvert' = 'attemptBoth'): QRHit[] {
  const rgba = grayToRGBA(g);
  const hits: QRHit[] = [];
  for (let k = 0; k < maxHits; k++) {
    const r = jsQR(rgba, g.width, g.height, { inversionAttempts: inversion });
    if (!r || !r.data) break;
    const L = r.location;
    const quad: Pt[] = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => [p.x, p.y]);
    hits.push({ data: r.data, corners: quad.map(([x, y]) => [x / scale, y / scale] as Pt), version: r.version, level });
    fillQuad(rgba, g.width, g.height, quad, 1.25);
  }
  return hits;
}

/**
 * The QR ladder, cheapest first, stopping at the first variant that decodes:
 * raw → blur 1 → blur 2 → unsharp(3, 1.5) → 2× upscale of it → unsharp(3, 3) → 2× upscale of it.
 * Corner coordinates are always in the original photo.
 */
export const QR_LADDER = 7;

/** A rectangle of a grey image (whole pixels). */
export function cropGray(g: Gray, x0: number, y0: number, x1: number, y1: number): Gray {
  const w = x1 - x0, h = y1 - y0, data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) data.set(g.data.subarray((y0 + y) * g.width + x0, (y0 + y) * g.width + x1), y * w);
  return { width: w, height: h, data };
}

/**
 * Two halves in one picture ("Check the cut"): the finder patterns of both QR codes can confuse a whole-frame
 * read, so bands of 45% and then 60% (top, bottom, left, right) are also read on their own. Hits are in the full photo.
 */
function findTwo(g: Gray, maxLevel: number, have: QRHit[]): QRHit[] {
  const out = [...have];
  const W = g.width, H = g.height;
  const bands: [number, number, number, number][] = [];
  for (const k of [0.45, 0.6]) bands.push(
    [0, 0, W, Math.round(H * k)], [0, Math.round(H * (1 - k)), W, H], [0, 0, Math.round(W * k), H], [Math.round(W * (1 - k)), 0, W, H],
  );
  for (const [x0, y0, x1, y1] of bands) {
    if (out.length >= 2) break;
    const hits = findQRs(cropGray(g, x0, y0, x1, y1), 1, maxLevel);
    for (const h of hits) {
      if (out.some((o) => o.data === h.data)) continue;
      out.push({ ...h, corners: h.corners.map(([x, y]) => [x + x0, y + y0] as Pt) });
    }
  }
  return out;
}

export function findQRs(g: Gray, maxHits = 2, maxLevel = QR_LADDER - 1, two = false): QRHit[] {
  if (two) {
    const first = findQRs(g, 2, maxLevel);
    return first.length >= 2 ? first : findTwo(g, maxLevel, first);
  }
  let b1: Gray | undefined, u15: Gray | undefined, u3: Gray | undefined;
  const blur1 = () => (b1 ??= boxBlur(g, 1));
  const steps: [() => Gray, number][] = [
    [() => g, 1],
    [blur1, 1],
    [() => boxBlur(g, 2), 1],
    [() => (u15 ??= unsharp(blur1(), 1.5, 3)), 1],
    [() => upscale2(u15 ??= unsharp(blur1(), 1.5, 3)), 2],
    [() => (u3 ??= unsharp(blur1(), 3, 3)), 1],
    [() => upscale2(u3 ??= unsharp(blur1(), 3, 3)), 2],
  ];
  for (let level = 0; level <= Math.min(maxLevel, steps.length - 1); level++) {
    const [make, scale] = steps[level];
    const hits = runJsQR(make(), scale, maxHits, level);
    if (hits.length) return hits;
  }
  return [];
}

// ---------------- pose: the four corner squares ----------------

export interface Pose {
  H: Hom;
  fiducials: (Pt | null)[]; // image px, in FIDUCIALS order (TL, TR, BL, BR)
  fiducialsFound: number;
  fitError: number; // mean reprojection error of the found squares, px
  pxPerMm: number;
  method: 'global' | 'grow' | 'qr';
}

export interface SquareBlob { x: number; y: number; area: number; q: number }

/**
 * Every solid, square-ish dark blob in the whole photo. A pixel is dark when it is below 0.55 × its local
 * mean AND below 0.45 (of full scale). Moment tests keep filled squares and drop rings, text and lines:
 * a filled rectangle has area = 12·√det(cov) (ratio 0.85–1.2), and its axes are similar (l1/l2 ≤ 2.2).
 */
export function detectSquares(g: Gray, maxKeep = 14, roi?: Roi): SquareBlob[] {
  // a window covering most of the frame is just the frame (copying it would only cost time)
  if (roi) { const r = clampRoi(roi, g.width, g.height); if (r.w * r.h > 0.6 * g.width * g.height) roi = undefined; }
  if (roi) {
    // the same rule inside a crop: the local-mean radius and the size limits come from the WHOLE frame, so a blob
    // inside the crop is judged exactly as in a full-frame search; coordinates go back to the whole frame
    const r = clampRoi(roi, g.width, g.height);
    const c = cropGray(g, r.x, r.y, r.x + r.w, r.y + r.h);
    return squaresIn(c, maxKeep, { R: Math.max(24, Math.round(0.05 * Math.max(g.width, g.height))), area: g.width * g.height })
      .map((b) => ({ ...b, x: b.x + r.x, y: b.y + r.y }));
  }
  return squaresIn(g, maxKeep);
}

/** A rectangle of the frame, px. */
export interface Roi { x: number; y: number; w: number; h: number }
export function clampRoi(r: Roi, W: number, H: number): Roi {
  const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
  return { x, y, w: Math.max(1, Math.min(W, Math.ceil(r.x + r.w)) - x), h: Math.max(1, Math.min(H, Math.ceil(r.y + r.h)) - y) };
}
/** Bounding box of points, grown by `grow` of its size on every side. */
export function roiAround(pts: Pt[], grow: number): Roi {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const gx = (x1 - x0) * grow, gy = (y1 - y0) * grow;
  return { x: x0 - gx, y: y0 - gy, w: x1 - x0 + 2 * gx, h: y1 - y0 + 2 * gy };
}

/** Work buffers of the square search, kept between calls (scanner-speed R12); every one is fully rewritten. */
const sqBuf = { I: new Float64Array(0), mask: new Uint8Array(0), stack: new Int32Array(0) };
function squaresIn(g: Gray, maxKeep: number, ref?: { R: number; area: number }): SquareBlob[] {
  const { width: w, height: h, data } = g;
  const W1 = w + 1;
  if (sqBuf.I.length < W1 * (h + 1)) sqBuf.I = new Float64Array(W1 * (h + 1));
  if (sqBuf.mask.length < w * h) { sqBuf.mask = new Uint8Array(w * h); sqBuf.stack = new Int32Array(w * h); }
  const I = sqBuf.I;
  I.fill(0, 0, W1); // row 0 of the integral image
  for (let y = 0; y < h; y++) {
    I[(y + 1) * W1] = 0; // column 0
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row;
    }
  }
  const R = ref?.R ?? Math.max(24, Math.round(0.05 * Math.max(w, h)));
  const mask = sqBuf.mask.subarray(0, w * h);
  mask.fill(0);
  const abs = 0.45 * 255;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1);
      const mean = (I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0));
      const v = data[y * w + x];
      if (v < mean * 0.55 && v < abs) mask[y * w + x] = 1;
    }
  }
  const A = ref?.area ?? w * h;
  const minA = Math.max(40, 0.00002 * A);
  const maxA = 0.012 * A;
  const stack = sqBuf.stack;
  const out: SquareBlob[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1) continue;
    let sp = 0;
    stack[sp++] = start;
    mask[start] = 2;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (sp) {
      const k = stack[--sp];
      const x = k % w, y = (k - x) / w;
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x + 1 < w && mask[k + 1] === 1) { mask[k + 1] = 2; stack[sp++] = k + 1; }
      if (x > 0 && mask[k - 1] === 1) { mask[k - 1] = 2; stack[sp++] = k - 1; }
      if (y + 1 < h && mask[k + w] === 1) { mask[k + w] = 2; stack[sp++] = k + w; }
      if (y > 0 && mask[k - w] === 1) { mask[k - w] = 2; stack[sp++] = k - w; }
    }
    if (n < minA || n > maxA) continue;
    if (x0 === 0 || y0 === 0 || x1 === w - 1 || y1 === h - 1) continue;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const mx = sx / n, my = sy / n;
    const cxx = sxx / n - mx * mx + 1 / 12, cyy = syy / n - my * my + 1 / 12, cxy = sxy / n - mx * my;
    const det = cxx * cyy - cxy * cxy;
    if (det <= 0) continue;
    const tr = cxx + cyy;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    if (l2 <= 0 || l1 / l2 > 2.2) continue;
    const rect = n / (12 * Math.sqrt(det));
    if (rect < 0.85 || rect > 1.2) continue;
    if (Math.max(bw, bh) > 3.2 * Math.min(bw, bh)) continue;
    out.push({ x: mx + 0.5, y: my + 0.5, area: n, q: Math.abs(rect - 1) + Math.abs(Math.log(l1 / l2)) * 0.3 });
  }
  out.sort((a, b) => a.q - b.q);
  return out.slice(0, maxKeep);
}

function polyArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return Math.abs(a) / 2;
}

/** Clockwise order of the corner squares (TL, TR, BR, BL) as indices into FIDUCIALS (TL, TR, BL, BR). */
const CW = [0, 1, 3, 2];

/**
 * Pick the four blobs that are the card's corner squares: for every convex 4-subset and each rotation, fit a
 * homography from the corner centres alone and keep it only when it predicts the decoded QR corners within
 * 0.08 × the QR side and every blob's area within 0.5–1.6 of the square's projected area. Lowest QR error wins.
 */
export function globalPose(g: Gray, qrImg: Pt[], cand = detectSquares(g)): { H: Hom; img: Pt[] } | null {
  if (cand.length < 4) return null;
  const card = CW.map((i) => FIDUCIALS[i]);
  const qc = qrCorners();
  const qrSide = Math.hypot(qrImg[1][0] - qrImg[0][0], qrImg[1][1] - qrImg[0][1]);
  const half = FID_SIZE / 2;
  let best: { err: number; H: Hom; img: Pt[] } | null = null;
  const n = cand.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
    const sub = [cand[a], cand[b], cand[c], cand[d]];
    const mx = sub.reduce((s, p) => s + p.x, 0) / 4, my = sub.reduce((s, p) => s + p.y, 0) / 4;
    const q = [...sub].sort((p1, p2) => Math.atan2(p1.y - my, p1.x - mx) - Math.atan2(p2.y - my, p2.x - mx));
    const qp = q.map((p) => [p.x, p.y] as Pt);
    if (polyArea(qp) < 0.04 * qrSide * qrSide) continue;
    let convex = true;
    for (let i = 0; i < 4 && convex; i++) {
      const p0 = qp[i], p1 = qp[(i + 1) % 4], p2 = qp[(i + 2) % 4];
      if ((p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]) <= 0) convex = false;
    }
    if (!convex) continue;
    for (let r = 0; r < 4; r++) {
      const img = [0, 1, 2, 3].map((i) => q[(i + r) % 4]);
      const H = solveHomography(card, img.map((p) => [p.x, p.y] as Pt));
      if (!H) continue;
      let err = 0;
      for (let i = 0; i < 4; i++) {
        const p = applyH(H, qc[i][0], qc[i][1]);
        err += Math.hypot(p[0] - qrImg[i][0], p[1] - qrImg[i][1]);
      }
      err /= 4 * qrSide;
      if (err > 0.08 || (best && err >= best.err)) continue;
      let areaOk = true;
      for (let i = 0; i < 4 && areaOk; i++) {
        const [cx, cy] = card[i];
        const poly = ([[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half]] as Pt[]).map(([x, y]) => applyH(H, x, y));
        const ratio = img[i].area / polyArea(poly);
        if (ratio < 0.5 || ratio > 1.6) areaOk = false;
      }
      if (!areaOk) continue;
      best = { err, H, img: img.map((p) => [p.x, p.y] as Pt) };
    }
  }
  return best;
}

function insideQuad(q: Pt[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c !== 0) { if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false; }
  }
  return true;
}

/**
 * Candidates for the global search: the QR's own inner squares are left out; then the 14 most square blobs,
 * plus the 2 blobs nearest each corner square's QR-predicted position, so many punched holes (round blobs
 * that also pass the square test) can never crowd a real corner square out of the pool.
 */
export function squareCandidates(g: Gray, qrImg: Pt[], H0: Hom, roi?: Roi): SquareBlob[] {
  const cx = qrImg.reduce((s, p) => s + p[0], 0) / 4, cy = qrImg.reduce((s, p) => s + p[1], 0) / 4;
  const grown = qrImg.map(([x, y]) => [cx + (x - cx) * 1.15, cy + (y - cy) * 1.15] as Pt);
  const all = detectSquares(g, Infinity, roi).filter((bl) => !insideQuad(grown, bl.x, bl.y));
  const pool = new Set(all.slice(0, 14));
  for (const [fx, fy] of FIDUCIALS) {
    const [px, py] = applyH(H0, fx, fy);
    [...all].sort((m, n) => Math.hypot(m.x - px, m.y - py) - Math.hypot(n.x - px, n.y - py)).slice(0, 2).forEach((bl) => pool.add(bl));
  }
  return [...pool];
}

function sampleMm(g: Gray, H: Hom, x: number, y: number): number {
  const [u, v] = applyH(H, x, y);
  return sample(g, u, v);
}

/**
 * Locate one corner square near its predicted centre, sub-pixel. Windows of ±8, ±15 and ±26 mm are tried,
 * smallest first. In the window the dark blobs are flood-filled; one counts only when it is not cut by the
 * window, has 0.6–1.5 × the square's area, 0.65–1.5 × its width and height and fills ≥ 80% of its box.
 * The nearest such blob wins; its centre is the intensity-weighted centroid. Returns image px or null.
 */
export function refineFiducial(g: Gray, H: Hom, c: Pt): Pt | null {
  for (const half of [8, 15, 26]) {
    const r = refineIn(g, H, c, half);
    if (r) return r;
  }
  return null;
}

function refineIn(g: Gray, H: Hom, c: Pt, half: number): Pt | null {
  const step = half > 20 ? 0.5 : half > 10 ? 0.4 : 0.3;
  const n = Math.floor((2 * half) / step) + 1;
  const val = new Float32Array(n * n);
  let mn = Infinity, mx = -Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = sampleMm(g, H, c[0] - half + i * step, c[1] - half + j * step);
    if (!Number.isFinite(v)) return null;
    val[j * n + i] = v;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (mx - mn < 0.18 * 255) return null;
  const thr = (mn + mx) / 2;
  const mid = (n - 1) / 2;
  const seen = new Uint8Array(n * n);
  const want = FID_SIZE * FID_SIZE;
  let best: { d: number; x: number; y: number } | null = null;
  for (let start = 0; start < n * n; start++) {
    if (seen[start] || val[start] >= thr) continue;
    const st = [start];
    seen[start] = 1;
    let sx = 0, sy = 0, sw = 0, cnt = 0, i0 = n, i1 = -1, j0 = n, j1 = -1;
    while (st.length) {
      const k = st.pop()!;
      const i = k % n, j = (k - i) / n;
      const wgt = thr - val[k];
      sx += i * wgt; sy += j * wgt; sw += wgt; cnt++;
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
      if (i + 1 < n && !seen[k + 1] && val[k + 1] < thr) { seen[k + 1] = 1; st.push(k + 1); }
      if (i > 0 && !seen[k - 1] && val[k - 1] < thr) { seen[k - 1] = 1; st.push(k - 1); }
      if (j + 1 < n && !seen[k + n] && val[k + n] < thr) { seen[k + n] = 1; st.push(k + n); }
      if (j > 0 && !seen[k - n] && val[k - n] < thr) { seen[k - n] = 1; st.push(k - n); }
    }
    if (i0 === 0 || j0 === 0 || i1 === n - 1 || j1 === n - 1) continue;
    const bw = (i1 - i0 + 1) * step, bh = (j1 - j0 + 1) * step, area = cnt * step * step;
    if (area < want * 0.6 || area > want * 1.5) continue;
    if (bw < FID_SIZE * 0.65 || bw > FID_SIZE * 1.5 || bh < FID_SIZE * 0.65 || bh > FID_SIZE * 1.5) continue;
    if (area / (bw * bh) < 0.8) continue;
    const ci = sx / sw, cj = sy / sw;
    const d = Math.hypot(ci - mid, cj - mid);
    if (!best || d < best.d) best = { d, x: c[0] - half + ci * step, y: c[1] - half + cj * step };
  }
  return best ? applyH(H, best.x, best.y) : null;
}

/**
 * Pose: first the global corner-square search; if it fails, grow outward from the QR one corner square at a
 * time (nearest first), refitting an affine model until three squares are known and a homography after that.
 */
export function estimatePose(g: Gray, qr: QRHit, nearCard = false): Pose | null {
  const qc = qrCorners();
  const H0 = solveHomography(qc, qr.corners);
  if (!H0) return null;
  const ppm0 = localScale(H0, FRAME_W / 2, FRAME_H / 2);
  if (!Number.isFinite(ppm0) || ppm0 < 0.8) return null;
  let H = H0;
  let found: (Pt | null)[] = [null, null, null, null];
  let method: Pose['method'] = 'qr';
  // live: look for the corner squares only around the card the QR predicts (the frame grown by 25%)
  const roi = nearCard ? roiAround(([[-20, -20], [FRAME_W + 20, -20], [FRAME_W + 20, FRAME_H + 20], [-20, FRAME_H + 20]] as Pt[]).map(([x, y]) => applyH(H0, x, y)), 0.25) : undefined;
  const gp = globalPose(g, qr.corners, squareCandidates(g, qr.corners, H0, roi));
  if (gp) {
    method = 'global';
    H = gp.H;
    gp.img.forEach((p, k) => { found[CW[k]] = p; });
    for (let iter = 0; iter < 2; iter++) {
      const again = FIDUCIALS.map((f) => refineFiducial(g, H, f));
      if (again.some((p) => !p)) break;
      found = again;
      const nx = solveHomography(FIDUCIALS, again as Pt[]);
      if (nx) H = nx;
    }
  } else {
    const qcx = qc.reduce((s, p) => s + p[0], 0) / 4, qcy = qc.reduce((s, p) => s + p[1], 0) / 4;
    const order = [0, 1, 2, 3].sort((a, b) => Math.hypot(FIDUCIALS[a][0] - qcx, FIDUCIALS[a][1] - qcy) - Math.hypot(FIDUCIALS[b][0] - qcx, FIDUCIALS[b][1] - qcy));
    const refit = () => {
      const idx = order.filter((i) => found[i]);
      const src = [...idx.map((i) => FIDUCIALS[i]), ...qc];
      const dst = [...idx.map((i) => found[i] as Pt), ...qr.corners];
      const nx = idx.length >= 3 ? solveHomography(src, dst) : findAffine(src, dst);
      if (nx) H = nx;
    };
    for (const i of order) {
      const p = refineFiducial(g, H, FIDUCIALS[i]);
      if (p) { found[i] = p; refit(); }
    }
    let k = found.filter(Boolean).length;
    for (let iter = 0; iter < 2 && k >= 3; iter++) {
      const again = FIDUCIALS.map((f) => refineFiducial(g, H, f));
      const ka = again.filter(Boolean).length;
      if (ka < k) break;
      found = again;
      k = ka;
      const idx = order.filter((i) => found[i]);
      const nx = k === 4
        ? solveHomography(FIDUCIALS, found as Pt[])
        : solveHomography([...idx.map((i) => FIDUCIALS[i]), ...qc], [...idx.map((i) => found[i] as Pt), ...qr.corners]);
      if (nx) H = nx;
    }
    if (k > 0) method = 'grow';
  }
  let se = 0, cnt = 0;
  found.forEach((p, i) => {
    if (!p) return;
    const q = applyH(H, FIDUCIALS[i][0], FIDUCIALS[i][1]);
    se += Math.hypot(q[0] - p[0], q[1] - p[1]);
    cnt++;
  });
  return {
    H, fiducials: found, fiducialsFound: cnt, fitError: cnt ? se / cnt : NaN,
    pxPerMm: localScale(H, FRAME_W / 2, FRAME_H / 2), method,
  };
}

// ---------------- punches ----------------

export interface HoleInfo { dx: number; dy: number; r: number; clipped: boolean }

export interface CellReading {
  key: string;
  kind: 'day' | 'adv';
  n: number;
  half: 0 | 1 | null;
  ratio: number; // centre / local paper; NaN when the spot is not in the photo
  punched: boolean;
  unsure: boolean;
  hole?: HoleInfo;
}

/** Saved calibration (the live storage names). */
export interface Calibration { punchRatio?: number; alignTolMm?: number }

/** Mean of a disc in frame mm; NaN unless at least 85% of it lies inside the photo. */
function discMean(g: Gray, H: Hom, cx: number, cy: number, r: number, step: number): number {
  let s = 0, n = 0, total = 0;
  for (let dy = -r; dy <= r + 1e-9; dy += step) for (let dx = -r; dx <= r + 1e-9; dx += step) {
    if (dx * dx + dy * dy > r * r) continue;
    total++;
    const v = sampleMm(g, H, cx + dx, cy + dy);
    if (Number.isFinite(v)) { s += v; n++; }
  }
  return n && n >= total * 0.85 ? s / n : NaN;
}

/** Share of a disc's pixels brighter than T.glareLum (a reflection); 0 when the disc is not in the photo. */
function glareShare(g: Gray, H: Hom, cx: number, cy: number, r: number, step: number): number {
  let hi = 0, n = 0;
  for (let dy = -r; dy <= r + 1e-9; dy += step) for (let dx = -r; dx <= r + 1e-9; dx += step) {
    if (dx * dx + dy * dy > r * r) continue;
    const v = sampleMm(g, H, cx + dx, cy + dy);
    if (!Number.isFinite(v)) continue;
    n++;
    if (v > T.glareLum) hi++;
  }
  return n ? hi / n : 0;
}

/**
 * Hole centre: flood-fill the dark region connected to the target inside a 6 mm disc, with the date number's
 * box masked out. The seed must lie within 2.2 mm of the target and the hole must cover at least 4 mm².
 */
function holeCentre(g: Gray, H: Hom, cx: number, cy: number, thr: number, skip: { x0: number; y0: number; x1: number; y1: number }): HoleInfo | undefined {
  const R = 6, step = 0.25;
  const n = Math.round((2 * R) / step) + 1;
  const dark = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -R + i * step, y = -R + j * step;
    if (x * x + y * y > R * R) continue;
    const px = cx + x, py = cy + y;
    if (px >= skip.x0 && px <= skip.x1 && py >= skip.y0 && py <= skip.y1) continue;
    const v = sampleMm(g, H, px, py);
    if (Number.isFinite(v) && v < thr) dark[j * n + i] = 1;
  }
  const mid = (n - 1) / 2;
  let seed = -1, best = Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (dark[j * n + i]) {
    const d = (i - mid) ** 2 + (j - mid) ** 2;
    if (d < best) { best = d; seed = j * n + i; }
  }
  if (seed < 0 || best > (2.2 / step) ** 2) return undefined;
  const st = [seed];
  dark[seed] = 2;
  let cnt = 0, sx = 0, sy = 0, clipped = false;
  while (st.length) {
    const k = st.pop()!;
    const i = k % n, j = (k - i) / n;
    cnt++; sx += i; sy += j;
    if (Math.hypot(-R + i * step, -R + j * step) > R - 1.5 * step) clipped = true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const nk = nj * n + ni;
      if (dark[nk] === 1) { dark[nk] = 2; st.push(nk); }
    }
  }
  const area = cnt * step * step;
  if (area < 4) return undefined;
  return { dx: -R + (sx / cnt) * step, dy: -R + (sy / cnt) * step, r: Math.sqrt(area / Math.PI), clipped };
}

export interface PunchResult {
  cells: CellReading[];
  paperRef: number;
  bgRef: number;
  grey?: number;
  ambiguousSurface: boolean;
  contrastOk: boolean;
  warnings: WarningCode[];
}

/** Background row just beyond where the cut can be (frame mm y), sampled every 6 mm. */
export const bgRowY = (role: Role) => (role === 'S' ? FRAME_H + 12 + 5 + 5 : -(12 + 5 + 5));

export function readPunches(g: Gray, H: Hom, spec: CardSpec, role: Role, cal: Calibration = {}): PunchResult {
  const targets = targetsFor(spec);
  const warnings = new Set<WarningCode>();
  const ppm = localScale(H, FRAME_W / 2, FRAME_H / 2);
  const step = Math.max(0.25, Math.min(0.5, 1 / ppm));
  const allRefs: number[] = [];
  const raw = targets.map((t) => {
    const refs = t.refs.map(([x, y]) => discMean(g, H, x, y, 0.6, 0.3));
    allRefs.push(...refs);
    return { t, centre: discMean(g, H, t.cx, t.cy, SAMPLE_R, step), cellRef: median(refs.filter(Number.isFinite)) };
  });
  const paperRef = median(allRefs.filter(Number.isFinite));
  const measured = raw.map((r) => {
    const ref = Number.isFinite(r.cellRef) && r.cellRef >= paperRef * 0.7 ? r.cellRef : paperRef;
    return { ...r, ref, ratio: r.centre / ref };
  });
  const bgVals: number[] = [];
  for (let x = 10; x <= FRAME_W - 10; x += 6) bgVals.push(discMean(g, H, x, bgRowY(role), 0.8, 0.4));
  // the table just beyond the cut: the darker quarter, so the other half lying close by (Check the cut, 1 cm gap)
  // does not count as table where its wavy edge reaches the sample row
  const bgFin = bgVals.filter(Number.isFinite).sort((a, b) => a - b);
  const bgRef = bgFin.length ? bgFin[Math.floor((bgFin.length - 1) * 0.25)] : NaN;
  if (!(paperRef / 255 > T.darkPhoto)) warnings.add('dark-photo');
  if (measured.some((m) => !Number.isFinite(m.ratio))) warnings.add('spots-hidden');
  const contrastOk = Number.isFinite(bgRef) && bgRef < paperRef * T.contrast;
  const thr = cal.punchRatio ?? T.punch;
  const [lo, hi] = unsureBand(thr);
  let grey: number | undefined;
  let ambiguousSurface = false;
  if (spec.discs) {
    const band = measured.map((m) => m.ratio).filter((x) => Number.isFinite(x) && Math.abs(x - T.discNominal) < T.discWindow);
    grey = band.length >= 3 ? median(band) : T.discNominal;
    const surf = bgRef / paperRef;
    ambiguousSurface = Number.isFinite(surf) && Math.abs(surf - grey) < T.ambiguous;
    if (ambiguousSurface) warnings.add('ambiguous-surface');
  }
  const cells: CellReading[] = measured.map((m) => {
    const unseen = !Number.isFinite(m.ratio);
    let punched = false, unsure = unseen;
    if (!unseen) {
      if (spec.discs) {
        const d = Math.abs(m.ratio - (grey as number));
        punched = d > T.discHole;
        unsure = d > T.discHole * T.discUnsureK && d <= T.discHole;
      } else {
        punched = m.ratio <= thr;
        unsure = m.ratio > lo && m.ratio < hi;
      }
    }
    if (ambiguousSurface) unsure = true;
    // a reflection over a spot hides a hole as white paper: never trust it
    if (!unseen && paperRef < T.glarePaper && glareShare(g, H, m.t.cx, m.t.cy, SAMPLE_R, step) > T.glareShare) { unsure = true; warnings.add('glare'); }
    const c: CellReading = { key: m.t.key, kind: m.t.kind, n: m.t.n, half: m.t.half, ratio: m.ratio, punched, unsure };
    if (punched) {
      const cell = m.t.cell;
      // the printed number sits at the top-left of every cell
      const skip = { x0: cell.x, y0: cell.y, x1: cell.x + (m.t.kind === 'day' ? 4.6 : 3.8), y1: cell.y + (m.t.kind === 'day' ? 4.2 : 3.6) };
      // the hole's own centre is only measurable when it is darker than the card
      const dark = !spec.discs ? m.ref * 0.4 : m.ratio < (grey as number) ? (m.centre + (grey as number) * m.ref) / 2 : NaN;
      if (Number.isFinite(dark)) {
        const h = holeCentre(g, H, m.t.cx, m.t.cy, dark, skip);
        if (h) c.hole = h;
      }
    }
    return c;
  });
  const fidL = median(FIDUCIALS.map(([x, y]) => sampleMm(g, H, x, y)).filter(Number.isFinite));
  if (Number.isFinite(fidL) && fidL / paperRef > 0.45) warnings.add('low-contrast');
  return { cells, paperRef, bgRef, grey, ambiguousSurface, contrastOk, warnings: [...warnings] };
}

// ---------------- cut edge ----------------

/** x positions (frame mm) where the cut edge is sampled: 4, 5, …, 182 (every 1 mm). */
export const EDGE_XS: number[] = Array.from({ length: 179 }, (_, i) => 4 + i);

/**
 * Drop outliers: samples further than 3 × the median absolute deviation (at least 0.12 mm) from a smoothed
 * curve (running median of 7, then mean of 5) become NaN. Pure; used per frame and after the 5-frame median.
 */
export function cleanEdge(edge: number[]): number[] {
  const n = edge.length;
  const med: number[] = edge.map((_, i) => {
    const w = edge.slice(Math.max(0, i - 3), Math.min(n, i + 4)).filter(Number.isFinite);
    return w.length >= 3 ? median(w) : NaN;
  });
  const smooth = med.map((_, i) => {
    const w = med.slice(Math.max(0, i - 2), Math.min(n, i + 3)).filter(Number.isFinite);
    return w.length ? w.reduce((p, v) => p + v, 0) / w.length : NaN;
  });
  const res = edge.map((v, i) => (Number.isFinite(v) && Number.isFinite(smooth[i]) ? v - smooth[i] : NaN));
  const fin = res.filter(Number.isFinite);
  if (fin.length < 5) return edge.map((v, i) => (Number.isFinite(smooth[i]) ? v : NaN));
  const m = median(fin);
  const mad = Math.max(0.12, median(fin.map((r) => Math.abs(r - m))));
  return edge.map((v, i) => (Number.isFinite(res[i]) && Math.abs(res[i] - m) <= 3 * mad ? v : NaN));
}

/**
 * Trace the cut edge outward from the frame, every 1 mm. Skipped entirely when paper/background contrast is
 * poor. Along each line the paper→background step must stay dark for 2 mm (so a printed line or the dotted
 * cut guide is not taken for the edge) and its local contrast must be at least 45% of paper − background;
 * its position is the steepest-gradient sample refined with a parabola (sub-pixel). Outliers are then dropped.
 * Offsets are from the nominal cut (stock 132, foil −12 mm).
 */
export function traceEdge(g: Gray, H: Hom, role: Role, paperRef: number, bgRef: number, contrastOk: boolean): { edge: number[]; coverage: number } {
  const stock = role === 'S';
  const t0 = stock ? FRAME_H + 12 - 5 - 3 : -(12 - 5 - 3);
  const t1 = stock ? FRAME_H + 12 + 5 + 4 : -(12 + 5 + 4);
  const dir = stock ? 1 : -1;
  const ppm = localScale(H, FRAME_W / 2, FRAME_H / 2);
  const tStep = Math.max(0.1, Math.min(0.3, 0.4 / ppm));
  const stay = Math.ceil(2 / tStep);
  const win = Math.max(2, Math.round(0.8 / tStep));
  const raw = EDGE_XS.map((x) => {
    if (!contrastOk) return NaN;
    const local = discMean(g, H, x, t0, 0.8, 0.4);
    const pRef = Number.isFinite(local) && local > bgRef ? local : paperRef;
    const span = pRef - bgRef;
    if (!(span > 0)) return NaN;
    const thr = bgRef + 0.5 * span;
    const ts: number[] = [], vs: number[] = [];
    for (let t = t0; dir * (t1 + dir * 2.4 - t) >= 0; t += dir * tStep) {
      const v = sampleMm(g, H, x, t);
      if (!Number.isFinite(v)) break;
      ts.push(t); vs.push(v);
    }
    for (let i = 1; i < vs.length; i++) {
      if (!(vs[i] < thr && vs[i - 1] >= thr) || dir * (ts[i] - t1) > 0) continue;
      if (i + stay >= vs.length) return NaN; // the line leaves the photo: cannot confirm
      let dark = true;
      for (let k = i; k <= i + stay; k++) if (vs[k] >= thr) { dark = false; break; }
      if (!dark) continue; // a printed line or a guide dot: paper resumes
      const kb = Math.max(0, i - Math.round(1.2 / tStep)), ka = Math.min(vs.length - 1, i + Math.round(1.2 / tStep));
      if (!(vs[kb] - vs[ka] >= 0.45 * span)) return NaN; // local-contrast mask
      if (!(vs[kb] >= bgRef + 0.75 * span)) return NaN; // the near side must be paper, not a finger or a shadow over it
      // steepest descent near the crossing, refined with a parabola through the three gradient samples
      const grad = (k: number) => vs[k + 1] - vs[k - 1];
      let best = -1, bv = 0;
      for (let k = Math.max(1, i - win); k <= Math.min(vs.length - 2, i + win); k++) { const d = grad(k); if (d < bv) { bv = d; best = k; } }
      let pos: number;
      if (best >= 2 && best <= vs.length - 3) {
        const gm = grad(best - 1), g0 = grad(best), gp = grad(best + 1);
        const den = gm - 2 * g0 + gp;
        const off = Math.abs(den) > 1e-6 ? Math.max(-0.5, Math.min(0.5, (0.5 * (gm - gp)) / den)) : 0;
        pos = ts[best] + dir * tStep * off;
      } else {
        const frac = (vs[i - 1] - thr) / Math.max(1e-6, vs[i - 1] - vs[i]);
        pos = ts[i] - dir * tStep * (1 - frac);
      }
      return stock ? pos - (FRAME_H + 12) : pos + 12;
    }
    return NaN;
  });
  const edge = cleanEdge(raw);
  return { edge, coverage: edge.filter(Number.isFinite).length / edge.length };
}

/** Per-sample median over several frames' edges (the last 5 good ones); NaN where fewer than half saw it. */
export function medianEdges(edges: number[][]): number[] {
  if (!edges.length) return [];
  const n = edges[0].length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = edges.map((e) => e[i]).filter(Number.isFinite);
    out.push(v.length * 2 >= edges.length && v.length ? median(v) : NaN);
  }
  return cleanEdge(out);
}

// ---------------- the whole half ----------------

export interface HalfScan {
  decoded: DecodedHalf;
  qr: QRHit;
  pose: Pose;
  cells: CellReading[];
  edge: number[]; // at EDGE_XS
  edgeCoverage: number;
  paperRef: number;
  bgRef: number;
  /** the table beside the paper (left and right of the piece); NaN when not in the photo */
  sideRef: number;
  grey?: number;
  ambiguousSurface: boolean;
  warnings: WarningCode[];
  outline: Pt[]; // printed frame corners in image px (TL, TR, BR, BL)
  /** the worker's received mark in the RECEIVED box (cards printed with one); read separately from everything else */
  receipt?: ReceiptRead;
}

/** squaresSeen: when no QR decodes, how many corner-square-like blobs are in view (a card too small or blurred to read). */
export interface ScanResult { width: number; height: number; halves: HalfScan[]; foreign: string[]; invalid: string[]; ms: number; squaresSeen?: number; timing?: StageTimes }

/** Time spent in each stage of one scan, ms (summed over the halves in the picture). */
export interface StageTimes { gray: number; qr: number; squares: number; pose: number; cells: number; edge: number; receipt: number; total: number }
const clock = (): number => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const zeroTimes = (): StageTimes => ({ gray: 0, qr: 0, squares: 0, pose: 0, cells: 0, edge: 0, receipt: 0, total: 0 });

export interface ScanOptions {
  calibration?: Calibration; maxQrLevel?: number; maxHits?: number;
  /** both halves are expected in this one picture (join mode) */
  pair?: boolean;
  /** the live camera loop: the fast QR search of scanLive and corner squares searched near the card only */
  live?: boolean;
  /** live: where the QR codes were in the last frame (frame px), searched first */
  hint?: LiveHint;
  /** live: QR codes the browser's own detector located in this frame (only the box and text; corners come from jsQR) */
  located?: LocatedQR[];
}
export interface LiveHint { qr: Pt[][] }
export interface LocatedQR { data: string; box: Roi }

export function scanHalf(g: Gray, qr: QRHit, decoded: DecodedHalf, opts: ScanOptions = {}, inkChannel?: () => Gray, tm: StageTimes = zeroTimes()): HalfScan | null {
  let t = clock();
  const lap = (k: keyof StageTimes) => { const n = clock(); tm[k] += n - t; t = n; };
  const pose = estimatePose(g, qr, !!opts.live);
  lap('pose');
  if (!pose) return null;
  const { spec, role } = decoded;
  const pr = readPunches(g, pose.H, spec, role, opts.calibration);
  lap('cells');
  const warnings = new Set<WarningCode>(pr.warnings);
  if (pose.fiducialsFound < 4) warnings.add('few-fiducials');
  if (pose.pxPerMm < 2.4) warnings.add('far');
  if (pose.fitError > 0.9 * pose.pxPerMm) warnings.add('blurry');
  // Disc cards with a pairing code read on any plain surface: the cut is then only extra evidence.
  if (!pr.contrastOk && !(spec.discs && decoded.paired)) warnings.add(spec.discs ? 'edge-surface' : 'dark-surface');
  const { edge, coverage } = traceEdge(g, pose.H, role, pr.paperRef, pr.bgRef, pr.contrastOk);
  if (pr.contrastOk && coverage < 0.5) warnings.add('edge-hidden');
  lap('edge');
  const y0 = role === 'S' ? STOCK_TOP : -12;
  const y1 = role === 'S' ? 132 : FOIL_BOTTOM;
  const piece = ([[PIECE_X0, y0], [PIECE_X1, y0], [PIECE_X1, y1], [PIECE_X0, y1]] as Pt[]).map(([x, y]) => applyH(pose.H, x, y));
  // Information only: the paper margin is often outside the photo when the card fills the frame.
  if (piece.some(([x, y]) => x < -2 || y < -2 || x > g.width + 2 || y > g.height + 2)) warnings.add('partial');
  const outline = ([[0, 0], [FRAME_W, 0], [FRAME_W, FRAME_H], [0, FRAME_H]] as Pt[]).map(([x, y]) => applyH(pose.H, x, y));
  const side: number[] = [];
  for (const y of [20, 50, 80, 110]) for (const x of [PIECE_X0 - 6, PIECE_X1 + 6]) side.push(discMean(g, pose.H, x, y, 1, 0.5));
  const sideRef = median(side.filter(Number.isFinite));
  lap('cells'); // outline and table reference belong to the cell stage
  const receipt = spec.receiptBox ? readReceipt(inkChannel ? inkChannel() : g, pose.H, { blurry: warnings.has('blurry'), area: panelFor(spec).area }) : undefined;
  lap('receipt');
  return {
    ...(receipt ? { receipt } : {}),
    decoded, qr, pose, cells: pr.cells, edge, edgeCoverage: coverage, paperRef: pr.paperRef, bgRef: pr.bgRef, sideRef,
    grey: pr.grey, ambiguousSurface: pr.ambiguousSurface, warnings: [...warnings], outline,
  };
}

/**
 * The partner half in a pair picture: it lies beyond this half's cut with a gap of up to 40 mm. First the window
 * where its QR must be (the QR box ± 10 mm, over every gap), then the partner's whole area. Frame mm of this half.
 * In a pair picture the foil frame starts 144 mm + the gap below the stock frame.
 */
function otherHalfHit(g: Gray, h: HalfScan, maxLevel: number): QRHit | null {
  const stock = h.decoded.role === 'S';
  const off0 = stock ? 144 : -144 - 40, off1 = stock ? 144 + 40 : -144; // where the partner frame's y = 0 can be
  const qx0 = QR_BOX.x - 10, qx1 = QR_BOX.x + QR_BOX.size + 10;
  const windows: [number, number, number, number][] = [
    [qx0, off0 + QR_BOX.y - 10, qx1, off1 + QR_BOX.y + QR_BOX.size + 10],
    [-20, off0 - 12, FRAME_W + 20, off1 + FRAME_H + 12],
  ];
  for (const [x0, y0, x1, y1] of windows) {
    const pts = ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Pt[]).map(([x, y]) => applyH(h.pose.H, x, y));
    const r = clampRoi(roiAround(pts, 0.05), g.width, g.height);
    if (r.w < 40 || r.h < 40) continue;
    const hit = findQRs(cropGray(g, r.x, r.y, r.x + r.w, r.y + r.h), 1, maxLevel)[0];
    if (hit) return { ...hit, corners: hit.corners.map(([x, y]) => [x + r.x, y + r.y] as Pt) };
  }
  return null;
}

export function scanGray(g: Gray, opts: ScanOptions = {}, inkChannel?: () => Gray, tm: StageTimes = zeroTimes()): Omit<ScanResult, 'ms'> {
  let t = clock();
  const hits = findQRs(g, opts.maxHits ?? 2, opts.maxQrLevel ?? QR_LADDER - 1, !!opts.pair);
  tm.qr += clock() - t;
  const halves: HalfScan[] = [];
  const foreign: string[] = [];
  const invalid: string[] = [];
  for (const h of hits) {
    if (!looksLikeOurs(h.data)) { foreign.push(h.data); continue; }
    const dec = decodePayload(h.data);
    if (!dec) { invalid.push(h.data); continue; }
    const half = scanHalf(g, h, dec, opts, inkChannel, tm);
    if (half) halves.push(half);
  }
  // "Check the cut": one half found, the other not. It lies just beyond the found half's wavy edge (a 1–3 cm gap),
  // so that region is read on its own (a QR in a corner of a small, blurred picture is easier to read alone)
  if (opts.pair && halves.length === 1) {
    t = clock();
    const other = otherHalfHit(g, halves[0], opts.maxQrLevel ?? QR_LADDER - 1);
    tm.qr += clock() - t;
    if (other && looksLikeOurs(other.data)) {
      const dec = decodePayload(other.data);
      if (dec && dec.role !== halves[0].decoded.role) { const half = scanHalf(g, other, dec, opts, inkChannel, tm); if (half) halves.push(half); }
    }
  }
  t = clock();
  const squaresSeen = hits.length ? undefined : detectSquares(g).length;
  tm.squares += clock() - t;
  return { width: g.width, height: g.height, halves, foreign, invalid, ...(squaresSeen !== undefined ? { squaresSeen } : {}), timing: tm };
}

export function scanImage(img: RGBAImage, opts: ScanOptions = {}): ScanResult {
  const t0 = clock();
  const tm = zeroTimes();
  let rg: Gray | undefined;
  const g = toGray(img);
  tm.gray = clock() - t0;
  // the ink channel is made only when a RECEIVED box is read; its time counts in the receipt stage
  const r = scanGray(g, opts, () => (rg ??= minRG(img)), tm);
  tm.total = clock() - t0;
  return { ...r, ms: Math.round(tm.total), timing: tm };
}

/** Punched set and unsure set of a half (for comparisons). */
export function punchSets(h: HalfScan, overrides?: Record<string, boolean>): { punched: Set<string>; unsure: Set<string>; manual: Set<string> } {
  const punched = new Set<string>();
  const unsure = new Set<string>();
  const manual = new Set<string>();
  for (const c of h.cells) {
    const o = overrides?.[c.key];
    if (o !== undefined) {
      manual.add(c.key);
      if (o) punched.add(c.key);
      continue;
    }
    if (c.punched) punched.add(c.key);
    if (c.unsure) unsure.add(c.key);
  }
  return { punched, unsure, manual };
}

// ---------------- the live camera path (scanner-speed) ----------------
// Same readers as scanImage (pose refinement, cells, edge, received mark all on the full-resolution frame); only the
// QR search is cheaper. The QR is decoded on EVERY live frame, so the card id and role are never assumed.

const pool = new Map<string, Float32Array>();
/** A reused Float32Array per purpose and size (one live scan at a time). */
function pooled(key: string, n: number): Float32Array {
  const k = key + n;
  let a = pool.get(k);
  if (!a) { if (pool.size > 8) pool.clear(); a = new Float32Array(n); pool.set(k, a); }
  return a;
}
function grayInto(img: RGBAImage, out: Float32Array): Gray {
  const d = img.data, n = img.width * img.height;
  for (let i = 0; i < n; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { width: img.width, height: img.height, data: out };
}
function minRGInto(img: RGBAImage, out: Float32Array): Gray {
  const d = img.data, n = img.width * img.height;
  for (let i = 0; i < n; i++) { const r = d[i * 4], g = d[i * 4 + 1]; out[i] = r < g ? r : g; }
  return { width: img.width, height: img.height, data: out };
}
/** Area-average a grey image down to a long side of maxDim (no change when it is already that small). */
export function shrinkGray(g: Gray, maxDim: number): { g: Gray; s: number } {
  const s = Math.max(g.width, g.height) / maxDim;
  if (s <= 1) return { g, s: 1 };
  const w = Math.round(g.width / s), h = Math.round(g.height / s);
  const out = pooled('shrink', w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * s), y1 = Math.min(g.height, Math.max(y0 + 1, Math.floor((y + 1) * s)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * s), x1 = Math.min(g.width, Math.max(x0 + 1, Math.floor((x + 1) * s)));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += g.data[yy * g.width + xx];
      out[y * w + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return { g: { width: w, height: h, data: out }, s };
}

/** The size of the small copy the live loop searches first. */
export const LIVE_FIND_PX = 800;
/** Live QR ladder (R6): raw → blur 1 → unsharp, at 1×, normal (not inverted) only. */
const LIVE_STEPS = [0, 1, 3];

function liveLadder(g: Gray, maxHits: number): QRHit[] {
  let b1: Gray | undefined;
  const blur1 = () => (b1 ??= boxBlur(g, 1));
  const make: Record<number, () => Gray> = { 0: () => g, 1: blur1, 3: () => unsharp(blur1(), 1.5, 3) };
  for (const lv of LIVE_STEPS) {
    const hits = runJsQR(make[lv](), 1, maxHits, lv, 'dontInvert');
    if (hits.length) return hits;
  }
  return [];
}

/**
 * Exact QR corners at full resolution inside one window (a QR seen in the last frame, a box the browser's detector
 * found, or a QR found on the small copy). Tries raw, blur 1, then a 2× upscale of the small window.
 */
function decodeIn(g: Gray, win: Roi): QRHit | null {
  const r = clampRoi(win, g.width, g.height);
  if (r.w < 24 || r.h < 24) return null;
  const c = cropGray(g, r.x, r.y, r.x + r.w, r.y + r.h);
  const tries: [() => Gray, number, number][] = [[() => c, 1, 0], [() => boxBlur(c, 1), 1, 1], [() => upscale2(unsharp(boxBlur(c, 1), 1.5, 3)), 2, 4]];
  for (const [mk, sc, lv] of tries) {
    const h = runJsQR(mk(), sc, 1, lv, lv === 4 ? 'attemptBoth' : 'dontInvert')[0];
    if (h) return { ...h, corners: h.corners.map(([x, y]) => [x + r.x, y + r.y] as Pt) };
  }
  return null;
}
/** A window around a QR quad: its box grown by 60% on every side. */
const qrWindow = (quad: Pt[]): Roi => roiAround(quad, 0.6);

/** The live QR search: last positions → the browser's boxes → the small copy → the full frame at raw. */
export function liveQRs(g: Gray, opts: ScanOptions, maxHits = 2, info: { squares?: number } = {}): QRHit[] {
  const out: QRHit[] = [];
  const add = (h: QRHit | null) => { if (h && !out.some((o) => o.data === h.data)) out.push(h); };
  for (const q of opts.hint?.qr ?? []) { if (out.length >= maxHits) break; add(decodeIn(g, qrWindow(q))); }
  for (const l of opts.located ?? []) { if (out.length >= maxHits) break; add(decodeIn(g, roiAround([[l.box.x, l.box.y], [l.box.x + l.box.w, l.box.y + l.box.h]], 0.35))); }
  if (out.length) return out;
  const small = shrinkGray(g, LIVE_FIND_PX);
  for (const h of liveLadder(small.g, maxHits)) {
    const full = small.s === 1 ? h : decodeIn(g, qrWindow(h.corners.map(([x, y]) => [x * small.s, y * small.s] as Pt)));
    add(full);
  }
  if (out.length) return out;
  // nothing on the small copy: when corner-square blobs show that a card is there (too small or too blurred for the
  // copy), try the full frame once; an empty table skips this
  info.squares = detectSquares(small.g).length;
  if (small.s !== 1 && info.squares >= 3) for (const h of runJsQR(g, 1, maxHits, 0, 'dontInvert')) add(h);
  return out;
}

/** One live camera frame: the fast QR search, then exactly the same readers as scanImage. */
export function scanLive(img: RGBAImage, opts: ScanOptions = {}): ScanResult {
  const t0 = clock();
  const tm = zeroTimes();
  const n = img.width * img.height;
  const g = grayInto(img, pooled('gray', n));
  tm.gray = clock() - t0;
  let t = clock();
  const info: { squares?: number } = {};
  const hits = liveQRs(g, opts, opts.maxHits ?? 2, info);
  tm.qr = clock() - t;
  const o: ScanOptions = { ...opts, live: true };
  let rg: Gray | undefined;
  const ink = () => (rg ??= minRGInto(img, pooled('ink', n)));
  const halves: HalfScan[] = [], foreign: string[] = [], invalid: string[] = [];
  for (const h of hits) {
    if (!looksLikeOurs(h.data)) { foreign.push(h.data); continue; }
    const dec = decodePayload(h.data);
    if (!dec) { invalid.push(h.data); continue; }
    const half = scanHalf(g, h, dec, o, ink, tm);
    if (half) halves.push(half);
  }
  t = clock();
  // when nothing decoded, how many corner-square blobs the small copy showed (counted during the search)
  const squaresSeen = hits.length ? undefined : info.squares ?? detectSquares(shrinkGray(g, LIVE_FIND_PX).g).length;
  tm.squares = clock() - t;
  tm.total = clock() - t0;
  return { width: g.width, height: g.height, halves, foreign, invalid, ms: Math.round(tm.total), timing: tm, ...(squaresSeen !== undefined ? { squaresSeen } : {}) };
}
