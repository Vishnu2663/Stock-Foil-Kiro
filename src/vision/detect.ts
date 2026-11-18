// Scanner pipeline per photo (§6.5): QR search, pose, punch reading, edge trace, warnings. Pure, no DOM.
import jsQR from 'jsqr';
import { decodePayload, looksLikeOurs, type DecodedHalf, type CardSpec, type Role } from '../core/card';
import { applyH, invertH, solveHomography, localScale, type Hom, type Pt } from '../core/homography';
import {
  FIDUCIALS, QR_BOX, SAMPLE_R, targetsFor, PIECE_X0, PIECE_X1, STOCK_TOP, FOIL_BOTTOM, FRAME_W, FRAME_H,
} from '../core/layout';
import { qrGeometry } from '../render/sheet';
import {
  toGray, grayToRGBA, sample, median3, unsharp, upscale2, median, integral, boxMean, type Gray, type RGBAImage,
} from './image';

// ---------------- thresholds (§6.5.3) ----------------
export const T = {
  punch: 0.62,
  unsureLo: 0.48,
  unsureHi: 0.78,
  discNominal: 0.62,
  discWindow: 0.17,
  discHole: 0.15,
  discUnsure: 0.0825,
  ambiguous: 0.26,
};

export type WarningCode =
  | 'partial' | 'few-fiducials' | 'low-contrast' | 'dark-surface' | 'ambiguous-surface'
  | 'far' | 'blurry' | 'dark-photo';

export const WARNING_TEXT: Record<WarningCode, string> = {
  partial: 'Part of the half is outside the photo. Show the whole half.',
  'few-fiducials': 'Fewer than 3 corner squares found. Show all four corners.',
  'low-contrast': 'Low contrast. Use more light.',
  'dark-surface': 'Place the card on a dark plain surface.',
  'ambiguous-surface': 'The surface is too close to the grey discs. Use a dark or white surface.',
  far: 'The card is too far away. Move closer.',
  blurry: 'The photo is blurred or bent. Hold still and keep the card flat.',
  'dark-photo': 'The photo is too dark. Use more light.',
};

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

function runJsQR(g: Gray, scale: number, maxHits: number, level: number): QRHit[] {
  const rgba = grayToRGBA(g);
  const hits: QRHit[] = [];
  for (let k = 0; k < maxHits; k++) {
    const r = jsQR(rgba, g.width, g.height, { inversionAttempts: 'dontInvert' });
    if (!r || !r.data) break;
    const L = r.location;
    const quad: Pt[] = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => [p.x, p.y]);
    hits.push({ data: r.data, corners: quad.map(([x, y]) => [x / scale, y / scale] as Pt), version: r.version, level });
    fillQuad(rgba, g.width, g.height, quad, 1.25);
  }
  return hits;
}

/** jsQR repeated with masking (up to 2 hits); escalate denoise → unsharp → 2× upscale only when needed. */
export function findQRs(g: Gray, maxHits = 2, maxLevel = 3): QRHit[] {
  let hits = runJsQR(g, 1, maxHits, 0);
  if (hits.length || maxLevel < 1) return hits;
  const d = median3(g);
  hits = runJsQR(d, 1, maxHits, 1);
  if (hits.length || maxLevel < 2) return hits;
  const u = unsharp(d);
  hits = runJsQR(u, 1, maxHits, 2);
  if (hits.length || maxLevel < 3) return hits;
  return runJsQR(upscale2(u), 2, maxHits, 3);
}

// ---------------- pose ----------------

export interface Pose {
  H: Hom;
  fiducials: (Pt | null)[];
  fiducialsFound: number;
  fitError: number;
  pxPerMm: number;
}

interface Blob { x: number; y: number; area: number; mm: Pt }

function darkBlobs(g: Gray, ppm: number): Blob[] {
  const { width: w, height: h } = g;
  const I = integral(g);
  const R = Math.max(6, Math.round(8 * ppm));
  const mask = new Uint8Array(w * h);
  // Coarse local mean on a grid for speed.
  const step = Math.max(2, Math.round(R / 4));
  const gw = Math.ceil(w / step) + 1, gh = Math.ceil(h / step) + 1;
  const lm = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = i * step, y = j * step;
    lm[j * gw + i] = boxMean(I, w, h, x - R, y - R, x + R, y + R);
  }
  for (let y = 0; y < h; y++) {
    const j = Math.min(gh - 1, Math.round(y / step));
    for (let x = 0; x < w; x++) {
      const m = lm[j * gw + Math.min(gw - 1, Math.round(x / step))];
      if (g.data[y * w + x] < 0.55 * m && g.data[y * w + x] < 140) mask[y * w + x] = 1;
    }
  }
  const minA = 0.2 * 49 * ppm * ppm;
  const maxA = 4 * 49 * ppm * ppm;
  const blobs: Blob[] = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== 1) continue;
    let sp = 0;
    stack[sp++] = start;
    mask[start] = 2;
    let area = 0, sx = 0, sy = 0, minx = w, maxx = 0, miny = h, maxy = 0, border = false;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w, y = (p - x) / w;
      area++; sx += x + 0.5; sy += y + 0.5;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      if (x > 0 && mask[p - 1] === 1) { mask[p - 1] = 2; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] === 1) { mask[p + 1] = 2; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] === 1) { mask[p - w] = 2; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] === 1) { mask[p + w] = 2; stack[sp++] = p + w; }
    }
    if (border || area < minA || area > maxA) continue;
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    if (Math.max(bw, bh) / Math.min(bw, bh) > 2.4) continue;
    if (area / (bw * bh) < 0.42) continue;
    blobs.push({ x: sx / area, y: sy / area, area, mm: [0, 0] });
  }
  return blobs;
}

export function estimatePose(g: Gray, qr: QRHit): Pose | null {
  const size = 17 + 4 * qr.version;
  const qg = qrGeometry(size);
  const H0 = solveHomography(qg.corners, qr.corners);
  if (!H0) return null;
  const ppm0 = localScale(H0, FRAME_W / 2, FRAME_H / 2);
  if (!Number.isFinite(ppm0) || ppm0 < 0.8) return null;
  const inv0 = invertH(H0);
  const blobs = darkBlobs(g, ppm0).filter((b) => {
    b.mm = applyH(inv0, b.x, b.y);
    const [x, y] = b.mm;
    const inQr = x > QR_BOX.x - 2 && x < QR_BOX.x + QR_BOX.size + 2 && y > QR_BOX.y - 2 && y < QR_BOX.y + QR_BOX.size + 2;
    return !inQr && x > -30 && x < FRAME_W + 30 && y > -30 && y < FRAME_H + 30;
  });
  const cands: Blob[][] = FIDUCIALS.map(([fx, fy]) =>
    blobs
      .map((b) => ({ b, d: Math.hypot(b.mm[0] - fx, b.mm[1] - fy) }))
      .filter((o) => o.d < 45)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((o) => o.b),
  );
  type Fit = { H: Hom; pick: (Blob | null)[]; k: number; err: number };
  let best: Fit | null = null;
  const pick: (Blob | null)[] = [null, null, null, null];
  const evaluate = () => {
    const used = pick.filter(Boolean) as Blob[];
    if (new Set(used).size !== used.length) return;
    const k = used.length;
    if (best && k < best.k) return;
    const src: Pt[] = [...qg.corners];
    const dst: Pt[] = [...qr.corners];
    const wts = [1, 1, 1, 1];
    pick.forEach((b, i) => { if (b) { src.push(FIDUCIALS[i]); dst.push([b.x, b.y]); wts.push(k >= 3 ? 6 : 2); } });
    const H = k === 0 ? H0 : solveHomography(src, dst, wts);
    if (!H) return;
    const ppm = localScale(H, FRAME_W / 2, FRAME_H / 2);
    let err = 0;
    for (let i = 0; i < 4; i++) {
      const b = pick[i];
      if (!b) continue;
      const [px, py] = applyH(H, FIDUCIALS[i][0], FIDUCIALS[i][1]);
      const r = Math.hypot(px - b.x, py - b.y) / ppm;
      if (r > 1.2) return;
      const s = localScale(H, FIDUCIALS[i][0], FIDUCIALS[i][1]);
      const mmArea = b.area / (s * s);
      if (mmArea < 33 || mmArea > 70) return;
      err += r * r;
    }
    for (let i = 0; i < 4; i++) {
      const [px, py] = applyH(H, qg.corners[i][0], qg.corners[i][1]);
      const r = Math.hypot(px - qr.corners[i][0], py - qr.corners[i][1]) / ppm;
      if (r > 2.0) return;
      err += (r * r) / 8;
    }
    const cur: Fit | null = best;
    if (!cur || k > cur.k || (k === cur.k && err < cur.err)) best = { H, pick: [...pick], k, err };
  };
  const rec = (i: number) => {
    if (i === 4) { evaluate(); return; }
    pick[i] = null;
    rec(i + 1);
    for (const b of cands[i]) { pick[i] = b; rec(i + 1); }
    pick[i] = null;
  };
  rec(0);
  const fit = best as Fit | null;
  const H = fit ? fit.H : H0;
  const fid = fit ? fit.pick.map((b) => (b ? ([b.x, b.y] as Pt) : null)) : [null, null, null, null];
  let se = 0, n = 0;
  fid.forEach((p, i) => {
    if (!p) return;
    const [px, py] = applyH(H, FIDUCIALS[i][0], FIDUCIALS[i][1]);
    se += (px - p[0]) ** 2 + (py - p[1]) ** 2;
    n++;
  });
  qg.corners.forEach(([x, y], i) => {
    const [px, py] = applyH(H, x, y);
    se += (px - qr.corners[i][0]) ** 2 + (py - qr.corners[i][1]) ** 2;
    n++;
  });
  return {
    H,
    fiducials: fid,
    fiducialsFound: fid.filter(Boolean).length,
    fitError: Math.sqrt(se / n),
    pxPerMm: localScale(H, FRAME_W / 2, FRAME_H / 2),
  };
}

// ---------------- punches ----------------

export interface HoleInfo { dx: number; dy: number; r: number; clipped: boolean }

export interface CellReading {
  key: string;
  kind: 'day' | 'adv';
  n: number;
  half: 0 | 1 | null;
  ratio: number;
  punched: boolean;
  unsure: boolean;
  hole?: HoleInfo;
}

export interface Calibration { threshold?: number; tolerance?: number }

const DISC_PTS: Pt[] = (() => {
  const p: Pt[] = [];
  for (let y = -SAMPLE_R; y <= SAMPLE_R + 1e-9; y += 0.4)
    for (let x = -SAMPLE_R; x <= SAMPLE_R + 1e-9; x += 0.4) if (x * x + y * y <= SAMPLE_R * SAMPLE_R) p.push([x, y]);
  return p;
})();

function sampleMm(g: Gray, H: Hom, x: number, y: number): number {
  const [u, v] = applyH(H, x, y);
  return sample(g, u, v);
}

function patchMean(g: Gray, H: Hom, x: number, y: number, step: number, n: number): number {
  let s = 0, c = 0;
  const h = (n - 1) / 2;
  for (let j = -h; j <= h; j++) for (let i = -h; i <= h; i++) {
    const v = sampleMm(g, H, x + i * step, y + j * step);
    if (Number.isNaN(v)) return NaN;
    s += v; c++;
  }
  return s / c;
}

function bgPoints(role: Role): Pt[] {
  return role === 'S'
    ? [[-20, 40], [-20, 90], [FRAME_W + 20, 40], [FRAME_W + 20, 90], [40, -20], [140, -20], [40, 150], [93, 150], [150, 150]]
    : [[-20, 30], [-20, 90], [FRAME_W + 20, 30], [FRAME_W + 20, 90], [40, -30], [93, -30], [150, -30], [60, 150], [130, 150]];
}

/**
 * Hole centre by an iterative (mean-shift) centroid of dark pixels in a window that follows the hole.
 * The window (3.7mm) holds a whole 3mm hole but not the printed number or a neighbouring hole, so a hole
 * punched up to ~3mm off its circle is still measured instead of being clipped away.
 */
function holeCentre(g: Gray, H: Hom, cx: number, cy: number, paper: number, thr: number, maxShift: number): HoleInfo | undefined {
  const win = 3.7;
  const step = 0.25;
  let ex = 0, ey = 0, sw = 0, rim = 0;
  for (let iter = 0; iter < 6; iter++) {
    let sx = 0, sy = 0;
    sw = 0; rim = 0;
    for (let y = -win; y <= win + 1e-9; y += step) {
      for (let x = -win; x <= win + 1e-9; x += step) {
        const rr = Math.hypot(x, y);
        if (rr > win) continue;
        const v = sampleMm(g, H, cx + ex + x, cy + ey + y);
        if (Number.isNaN(v)) return undefined;
        const wgt = Math.max(0, Math.min(1, (thr - v / paper) / 0.12 + 0.5));
        if (wgt <= 0) continue;
        sw += wgt; sx += wgt * x; sy += wgt * y;
        if (rr > win - 0.3 && wgt > 0.5) rim++;
      }
    }
    if (sw <= 0) return undefined;
    const nx = ex + sx / sw, ny = ey + sy / sw;
    const moved = Math.hypot(nx - ex, ny - ey);
    ex = nx; ey = ny;
    if (Math.hypot(ex, ey) > maxShift) break;
    if (moved < 0.02) break;
  }
  const r = Math.sqrt((sw * step * step) / Math.PI);
  return { dx: ex, dy: ey, r, clipped: rim > 3 || r < 2.3 || r > 3.6 || Math.hypot(ex, ey) > maxShift };
}

export interface PunchResult {
  cells: CellReading[];
  paperRef: number;
  bgRef: number;
  grey?: number;
  ambiguousSurface: boolean;
  allUnsure: boolean;
  warnings: WarningCode[];
}

export function readPunches(g: Gray, H: Hom, spec: CardSpec, role: Role, cal: Calibration = {}): PunchResult {
  const targets = targetsFor(spec);
  const warnings = new Set<WarningCode>();
  const raw = targets.map((t) => {
    let s = 0, n = 0, nan = false;
    for (const [dx, dy] of DISC_PTS) {
      const v = sampleMm(g, H, t.cx + dx, t.cy + dy);
      if (Number.isNaN(v)) { nan = true; break; }
      s += v; n++;
    }
    const refs = t.refs.map(([x, y]) => patchMean(g, H, x, y, 0.3, 3));
    const paper = median(refs);
    return { t, centre: nan ? NaN : s / n, paper };
  });
  const paperRef = median(raw.map((r) => r.paper));
  const bgVals = bgPoints(role).map(([x, y]) => {
    const vals: number[] = [];
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) vals.push(sampleMm(g, H, x + i * 1.2, y + j * 1.2));
    return vals.some(Number.isNaN) ? NaN : median(vals);
  });
  const bgRef = median(bgVals);
  const bgRatio = bgRef / paperRef;
  if (raw.some((r) => Number.isNaN(r.centre) || Number.isNaN(r.paper))) warnings.add('partial');
  if (Number.isNaN(bgRef)) warnings.add('partial');
  if (paperRef < 50) warnings.add('dark-photo');
  const ratios = raw.map((r) => r.centre / r.paper);
  let grey: number | undefined;
  let ambiguousSurface = false;
  let allUnsure = false;
  const thr = cal.threshold ?? T.punch;
  const lo = cal.threshold !== undefined ? thr - (T.punch - T.unsureLo) : T.unsureLo;
  const hi = cal.threshold !== undefined ? thr + (T.unsureHi - T.punch) : T.unsureHi;
  const cells: CellReading[] = raw.map((r, i) => {
    const ratio = ratios[i];
    const base = { key: r.t.key, kind: r.t.kind, n: r.t.n, half: r.t.half, ratio };
    return { ...base, punched: false, unsure: true };
  });
  if (spec.discs) {
    const near = ratios.filter((x) => Number.isFinite(x) && Math.abs(x - T.discNominal) <= T.discWindow);
    grey = near.length ? median(near) : T.discNominal;
    if (Number.isFinite(bgRatio) && Math.abs(bgRatio - grey) < T.ambiguous) {
      ambiguousSurface = true;
      warnings.add('ambiguous-surface');
    }
    for (const c of cells) {
      if (!Number.isFinite(c.ratio)) continue;
      const d = Math.abs(c.ratio - grey);
      c.punched = d > T.discHole;
      c.unsure = ambiguousSurface || (d > T.discUnsure && d <= T.discHole);
    }
  } else {
    if (!Number.isFinite(bgRatio) || bgRatio >= T.unsureLo) {
      warnings.add('dark-surface');
      allUnsure = true;
    }
    for (const c of cells) {
      if (!Number.isFinite(c.ratio)) continue;
      c.punched = c.ratio < thr;
      c.unsure = allUnsure || (c.ratio >= lo && c.ratio <= hi);
    }
  }
  if (Number.isNaN(bgRef)) allUnsure = true;
  if (allUnsure) for (const c of cells) c.unsure = true;
  // Hole centres for alignment: only holes darker than the paper/grey.
  const maxShift = spec.halves ? 3.0 : 3.6;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c.punched || !Number.isFinite(c.ratio) || !Number.isFinite(bgRatio)) continue;
    let darkThr: number;
    if (spec.discs) {
      if (!(c.ratio < (grey as number))) continue;
      darkThr = ((grey as number) + bgRatio) / 2;
    } else {
      if (bgRatio >= T.unsureLo) continue;
      darkThr = (1 + bgRatio) / 2;
    }
    const t = raw[i].t;
    const h = holeCentre(g, H, t.cx, t.cy, raw[i].paper, darkThr, maxShift);
    if (h) {
      c.hole = h;
      // A whole, unclipped 3mm hole found next to the circle confirms an off-centre punch.
      if (c.unsure && !allUnsure && !ambiguousSurface && !h.clipped && Math.abs(h.r - 3) < 0.45) c.unsure = false;
    }
  }
  // Fiducial contrast.
  const fidL = median(FIDUCIALS.map(([x, y]) => sampleMm(g, H, x, y)));
  if (Number.isFinite(fidL) && fidL / paperRef > 0.45) warnings.add('low-contrast');
  return { cells, paperRef, bgRef, grey, ambiguousSurface, allUnsure, warnings: [...warnings] };
}

// ---------------- edge ----------------

export const EDGE_STEP = 2;
export const EDGE_N = 94; // x = 0..186 step 2

export function traceEdge(g: Gray, H: Hom, role: Role): { edge: number[]; coverage: number } {
  const edge: number[] = [];
  for (let k = 0; k < EDGE_N; k++) {
    const x = k * EDGE_STEP;
    const yIn = role === 'S' ? 121 : -1;
    const yOut = role === 'S' ? 146 : -26;
    const dir = role === 'S' ? 1 : -1;
    const pIn = patchMean(g, H, x, yIn, 0.4, 3);
    const pOut = patchMean(g, H, x, yOut, 0.4, 3);
    if (!Number.isFinite(pIn) || !Number.isFinite(pOut) || Math.abs(pIn - pOut) < 0.18 * pIn) { edge.push(NaN); continue; }
    const mid = (pIn + pOut) / 2;
    const sIn = Math.sign(pIn - mid);
    let found = NaN;
    let prevV = pIn, prevY = yIn;
    for (let y = yIn; dir > 0 ? y <= yOut : y >= yOut; y += dir * 0.1) {
      const v = sampleMm(g, H, x, y);
      if (Number.isNaN(v)) break;
      if (Math.sign(v - mid) !== sIn) {
        // confirm it stays on the outside for 1.5mm
        const v2 = sampleMm(g, H, x, y + dir * 1.5);
        if (Number.isFinite(v2) && Math.sign(v2 - mid) !== sIn) {
          const t = (prevV - mid) / (prevV - v || 1);
          found = prevY + (y - prevY) * Math.max(0, Math.min(1, t));
          break;
        }
      }
      prevV = v; prevY = y;
    }
    if (Number.isFinite(found)) {
      const off = role === 'S' ? found - 132 : found + 12;
      edge.push(Math.abs(off) <= 8 ? off : NaN);
    } else edge.push(NaN);
  }
  const coverage = edge.filter(Number.isFinite).length / edge.length;
  return { edge, coverage };
}

// ---------------- the whole half ----------------

export interface HalfScan {
  decoded: DecodedHalf;
  qr: QRHit;
  pose: Pose;
  cells: CellReading[];
  edge: number[];
  edgeCoverage: number;
  paperRef: number;
  bgRef: number;
  grey?: number;
  ambiguousSurface: boolean;
  warnings: WarningCode[];
  outline: Pt[]; // piece corners in image px
}

export interface ScanResult { width: number; height: number; halves: HalfScan[]; foreign: string[]; invalid: string[]; ms: number }

export interface ScanOptions { calibration?: Calibration; maxQrLevel?: number; maxHits?: number }

export function scanHalf(g: Gray, qr: QRHit, decoded: DecodedHalf, opts: ScanOptions = {}): HalfScan | null {
  const pose = estimatePose(g, qr);
  if (!pose) return null;
  const { spec, role } = decoded;
  const pr = readPunches(g, pose.H, spec, role, opts.calibration);
  const warnings = new Set<WarningCode>(pr.warnings);
  if (pose.fiducialsFound < 3) warnings.add('few-fiducials');
  if (pose.pxPerMm < 2.4) warnings.add('far');
  if (pose.fitError > 0.9 * pose.pxPerMm) warnings.add('blurry');
  const { edge, coverage } = traceEdge(g, pose.H, role);
  const y0 = role === 'S' ? STOCK_TOP : -12;
  const y1 = role === 'S' ? 132 : FOIL_BOTTOM;
  const outline = ([[PIECE_X0, y0], [PIECE_X1, y0], [PIECE_X1, y1], [PIECE_X0, y1]] as Pt[]).map(([x, y]) => applyH(pose.H, x, y));
  if (outline.some(([x, y]) => x < -2 || y < -2 || x > g.width + 2 || y > g.height + 2)) warnings.add('partial');
  return {
    decoded, qr, pose, cells: pr.cells, edge, edgeCoverage: coverage, paperRef: pr.paperRef, bgRef: pr.bgRef,
    grey: pr.grey, ambiguousSurface: pr.ambiguousSurface, warnings: [...warnings], outline,
  };
}

export function scanGray(g: Gray, opts: ScanOptions = {}): Omit<ScanResult, 'ms'> {
  const hits = findQRs(g, opts.maxHits ?? 2, opts.maxQrLevel ?? 3);
  const halves: HalfScan[] = [];
  const foreign: string[] = [];
  const invalid: string[] = [];
  for (const h of hits) {
    if (!looksLikeOurs(h.data)) { foreign.push(h.data); continue; }
    const dec = decodePayload(h.data);
    if (!dec) { invalid.push(h.data); continue; }
    const half = scanHalf(g, h, dec, opts);
    if (half) halves.push(half);
  }
  return { width: g.width, height: g.height, halves, foreign, invalid };
}

export function scanImage(img: RGBAImage, opts: ScanOptions = {}): ScanResult {
  const t0 = Date.now();
  const r = scanGray(toGray(img), opts);
  return { ...r, ms: Date.now() - t0 };
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
