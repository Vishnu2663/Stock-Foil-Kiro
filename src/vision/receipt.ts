// The "received" mark in the printed RECEIVED box: is there an inked mark, and does it look like a thumb mark,
// a signature or a smudge? Pure, no DOM. This is NOT fingerprint recognition: it never identifies anyone,
// keeps no picture and only looks at the shape and texture of the ink inside one box.
import { applyH, type Hom, type Pt } from '../core/homography';
import { RECEIPT_AREA } from '../core/layout';
import { boxBlur, median, sample, type Gray } from './image';

export type ReceiptStatus = 'present' | 'absent' | 'unclear';
export type ReceiptKind = 'thumb' | 'signature' | 'smudge';
export interface ReceiptRead {
  status: ReceiptStatus;
  kind: ReceiptKind | null;
  /** share of the area that is ink (0..1) */
  coverage: number;
  /** centre of the mark in frame mm, when there is one */
  centre: Pt | null;
  /** 0..1: how clear the reading is */
  quality: number;
  /** why it is unclear */
  why?: 'out' | 'glare' | 'blur' | 'flood' | 'finger';
  /** measurements, for the debug line and the tests */
  m?: { blob: number; wMm: number; hMm: number; ratio: number; fill: number; texture: number; coherence: number; stroke: number };
}

/** The rules, in one place (0..1 relative to the paper, mm, shares of the area). */
export const RT = {
  pxPerMm: 4, ink: 0.6, absent: 0.03, flood: 0.7, glareLum: 250, glareShare: 0.15,
  blobMin: 0.08, blobMax: 0.7, minW: 10, minH: 12, oval: [0.55, 0.95] as [number, number],
  texture: 0.075, coherence: 0.35, signatureMax: 0.2, strokeMm: 2.2,
};

/** min(R, G) of an RGBA picture as a grey image: violet, blue and black ink are all dark in it. */
export function minRG(img: { width: number; height: number; data: Uint8ClampedArray }): Gray {
  const n = img.width * img.height, out = new Float32Array(n), d = img.data;
  for (let i = 0; i < n; i++) out[i] = Math.min(d[i * 4], d[i * 4 + 1]);
  return { width: img.width, height: img.height, data: out };
}

const pctl = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };

/**
 * Read the mark. `g` is the min(R, G) channel (0..255), `H` maps frame mm to image px.
 * absent < 3% ink; present = one blob of 8–70% at least 10 × 12 mm; thumb = oval (0.55–0.95) with texture and
 * coherent flow; signature = thin long strokes under 20%; smudge = solid without texture; unclear on glare
 * (> 250 in > 15%), a finger or the box out of the photo, blur, or flooded ink (> 70%).
 */
export function readReceipt(g: Gray, H: Hom, opts: { blurry?: boolean; area?: { x0: number; x1: number; y0: number; y1: number } } = {}): ReceiptRead {
  const k = RT.pxPerMm;
  const { x0, x1, y0, y1 } = opts.area ?? RECEIPT_AREA;
  const W = Math.round((x1 - x0) * k), Hh = Math.round((y1 - y0) * k);
  const at = (x: number, y: number) => { const [u, v] = applyH(H, x, y); return sample(g, u, v); };
  const raw = new Float32Array(W * Hh);
  let out = 0, hot = 0;
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const v = at(x0 + (i + 0.5) / k, y0 + (j + 0.5) / k);
    raw[j * W + i] = v;
    if (!Number.isFinite(v)) out++;
    else if (v > RT.glareLum) hot++;
  }
  const none: ReceiptRead = { status: 'unclear', kind: null, coverage: 0, centre: null, quality: 0 };
  if (out > 0.02 * W * Hh) return { ...none, why: 'out' };
  if (hot > RT.glareShare * W * Hh) return { ...none, why: 'glare' };
  // the local paper: the clear band between the frame and the area (left and right), or the brightest area pixels
  const ring: number[] = [];
  for (let y = y0 + 0.5; y <= y1 - 0.5; y += 0.5) for (const x of [x0 - 0.6, x1 + 0.6]) { const v = at(x, y); if (Number.isFinite(v)) ring.push(v); }
  const areaVals = Array.from(raw);
  const p90 = pctl(areaVals, 0.9);
  const ringMed = ring.length ? median(ring) : NaN;
  const paper = Math.max(Number.isFinite(ringMed) ? ringMed : 0, p90 * 0.97, 1);
  const n = raw.map((v) => v / paper);
  const ink = new Uint8Array(W * Hh);
  let cnt = 0;
  for (let i = 0; i < n.length; i++) if (n[i] < RT.ink) { ink[i] = 1; cnt++; }
  const coverage = cnt / (W * Hh);
  // a finger (or anything else) over the box: darker than paper at the area's border AND in the paper band beyond it
  let edgeDim = 0, edgeN = 0;
  const dim = (s0: number) => (n[s0] < 0.85 ? 1 : 0);
  for (let i = 0; i < W; i++) { edgeDim += dim(i) + dim((Hh - 1) * W + i); edgeN += 2; }
  for (let j = 0; j < Hh; j++) { edgeDim += dim(j * W) + dim(j * W + W - 1); edgeN += 2; }
  const ringDark = ring.filter((v) => v < paper * 0.8).length / Math.max(1, ring.length);
  if (edgeDim / edgeN > 0.1 && ringDark > 0.2) return { ...none, coverage, why: 'finger' };
  if (coverage < RT.absent) return { status: opts.blurry ? 'unclear' : 'absent', kind: null, coverage, centre: null, quality: opts.blurry ? 0.3 : 1 - coverage / RT.absent * 0.5, ...(opts.blurry ? { why: 'blur' as const } : {}) };
  if (coverage > RT.flood) return { ...none, coverage, why: 'flood' };
  if (opts.blurry) return { ...none, coverage, why: 'blur' };
  // group nearby ink into blobs (dilate 0.5 mm), keep the largest
  const R = 2;
  const dil = new Uint8Array(W * Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    if (!ink[j * W + i]) continue;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < W && b < Hh && di * di + dj * dj <= R * R) dil[b * W + a] = 1;
    }
  }
  const lab = new Int32Array(W * Hh);
  let best = 0, bestN = 0, next = 0;
  for (let s = 0; s < W * Hh; s++) {
    if (!dil[s] || lab[s]) continue;
    next++;
    const st = [s]; lab[s] = next; let c = 0;
    while (st.length) {
      const q = st.pop()!; c++;
      const i = q % W, j = (q - i) / W;
      for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        if (a < 0 || b < 0 || a >= W || b >= Hh) continue;
        const t = b * W + a;
        if (dil[t] && !lab[t]) { lab[t] = next; st.push(t); }
      }
    }
    if (c > bestN) { bestN = c; best = next; }
  }
  // shape of the largest blob: bounding box, second moments, ink inside it
  let sx = 0, sy = 0, minI = W, maxI = 0, minJ = Hh, maxJ = 0, inkIn = 0;
  for (let s = 0; s < W * Hh; s++) if (lab[s] === best) {
    const i = s % W, j = (s - i) / W;
    sx += i; sy += j; minI = Math.min(minI, i); maxI = Math.max(maxI, i); minJ = Math.min(minJ, j); maxJ = Math.max(maxJ, j);
    if (ink[s]) inkIn++;
  }
  const mx = sx / bestN, my = sy / bestN;
  let cxx = 0, cyy = 0, cxy = 0;
  for (let s = 0; s < W * Hh; s++) if (lab[s] === best) { const i = s % W, j = (s - i) / W; cxx += (i - mx) ** 2; cyy += (j - my) ** 2; cxy += (i - mx) * (j - my); }
  cxx /= bestN; cyy /= bestN; cxy /= bestN;
  const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const ratio = Math.sqrt(Math.max(1e-9, tr / 2 - disc) / Math.max(1e-9, tr / 2 + disc));
  const blob = bestN / (W * Hh);
  const wMm = (maxI - minI + 1) / k, hMm = (maxJ - minJ + 1) / k;
  const fill = inkIn / bestN;
  // texture: band-pass energy (detail between ~0.5 and ~2 mm) inside the blob, relative to the mark's contrast;
  // coherence: how much the local texture flows in one direction (structure tensor of the band-pass)
  // the blob's interior (1 mm in from its outline), so the outline itself is not taken for texture
  const inner = new Uint8Array(W * Hh);
  const E = 4;
  for (let j = E; j < Hh - E; j++) for (let i = E; i < W - E; i++) {
    const s0 = j * W + i;
    if (lab[s0] !== best) continue;
    let ok = true;
    for (const [di, dj] of [[E, 0], [-E, 0], [0, E], [0, -E], [3, 3], [-3, 3], [3, -3], [-3, -3]]) if (lab[(j + dj) * W + i + di] !== best) { ok = false; break; }
    if (ok) inner[s0] = 1;
  }
  const G: Gray = { width: W, height: Hh, data: n };
  const b1 = boxBlur(G, 1), b2 = boxBlur(G, 4);
  const bp = new Float32Array(W * Hh);
  for (let i = 0; i < bp.length; i++) bp[i] = b1.data[i] - b2.data[i];
  let e = 0, en = 0, jxx = 0, jyy = 0, jxy = 0, inkSum = 0;
  for (let j = 1; j < Hh - 1; j++) for (let i = 1; i < W - 1; i++) {
    const s = j * W + i;
    if (!inner[s]) continue;
    e += bp[s] * bp[s]; en++; inkSum += 1 - n[s];
    const gx = (bp[s + 1] - bp[s - 1]) / 2, gy = (bp[s + W] - bp[s - W]) / 2;
    jxx += gx * gx; jyy += gy * gy; jxy += gx * gy;
  }
  void jxx; void jyy; void jxy;
  const contrast = Math.max(0.05, inkSum / Math.max(1, en));
  const texture = Math.sqrt(e / Math.max(1, en)) / contrast;
  const coherence = localCoherence(bp, inner, 1, W, Hh);
  const stroke = (inkIn / (k * k)) / Math.max(1, (perimeter(ink, W, Hh) / k) / 2); // mean stroke width, mm
  const m = { blob, wMm, hMm, ratio, fill, texture, coherence, stroke };
  const centre: Pt = [x0 + (mx + 0.5) / k, y0 + (my + 0.5) / k];
  const one = inkIn >= 0.7 * cnt;
  const big = Math.min(wMm, hMm) >= RT.minW && Math.max(wMm, hMm) >= RT.minH;
  // a signature: thin strokes, long, little ink
  if (coverage < RT.signatureMax && stroke < RT.strokeMm && Math.max(wMm, hMm) >= 12 && ratio < RT.oval[0]) {
    return { status: 'present', kind: 'signature', coverage, centre, quality: 0.8, m };
  }
  if (!(one && big && blob >= RT.blobMin && blob <= RT.blobMax)) return { status: 'unclear', kind: null, coverage, centre, quality: 0.3, m };
  const oval = ratio >= RT.oval[0] && ratio <= RT.oval[1];
  if (oval && texture >= RT.texture && coherence >= RT.coherence) return { status: 'present', kind: 'thumb', coverage, centre, quality: Math.min(1, 0.5 + coherence), m };
  return { status: 'present', kind: 'smudge', coverage, centre, quality: 0.6, m };
}

/** Mean local coherence of the structure tensor over 2 mm windows inside the blob (0 = no direction, 1 = one direction). */
function localCoherence(bp: Float32Array, lab: Uint8Array | Int32Array, best: number, W: number, H: number): number {
  const win = 8;
  let sum = 0, wsum = 0;
  for (let by = 1; by + win < H - 1; by += win / 2) for (let bx = 1; bx + win < W - 1; bx += win / 2) {
    let jxx = 0, jyy = 0, jxy = 0, inside = 0;
    for (let j = by; j < by + win; j++) for (let i = bx; i < bx + win; i++) {
      const s = j * W + i;
      if (lab[s] !== best) continue;
      inside++;
      const gx = (bp[s + 1] - bp[s - 1]) / 2, gy = (bp[s + W] - bp[s - W]) / 2;
      jxx += gx * gx; jyy += gy * gy; jxy += gx * gy;
    }
    if (inside < win * win * 0.6) continue;
    const t = jxx + jyy;
    if (t < 1e-6) continue;
    const c = Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / t;
    sum += c * t; wsum += t;
  }
  return wsum ? sum / wsum : 0;
}

/** Ink pixels with a non-ink 4-neighbour. */
function perimeter(ink: Uint8Array, W: number, H: number): number {
  let p = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const s = j * W + i;
    if (!ink[s]) continue;
    if (i === 0 || j === 0 || i === W - 1 || j === H - 1 || !ink[s - 1] || !ink[s + 1] || !ink[s - W] || !ink[s + W]) p++;
  }
  return p;
}
