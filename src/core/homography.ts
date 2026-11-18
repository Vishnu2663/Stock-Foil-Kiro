// Planar homography (frame mm → image px). Pure, no DOM.

export type Hom = number[]; // 9 numbers, row-major
export type Pt = [number, number];

export function applyH(h: Hom, x: number, y: number): Pt {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

export function mulH(a: Hom, b: Hom): Hom {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

export function invertH(m: Hom): Hom {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const inv = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ].map((v) => v / det);
  return normalize(inv);
}

function normalize(h: Hom): Hom {
  const s = h[8] !== 0 ? h[8] : 1;
  return h.map((v) => v / s);
}

/** Solve A x = b (n×n) with partial pivoting. Returns null when singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function normTransform(pts: Pt[]): Hom {
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= pts.length; my /= pts.length;
  let d = 0;
  for (const [x, y] of pts) d += Math.hypot(x - mx, y - my);
  d /= pts.length;
  const s = d > 0 ? Math.SQRT2 / d : 1;
  return [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1];
}

/** Least-squares homography from ≥4 correspondences (normalised DLT with h33 = 1). */
export function solveHomography(src: Pt[], dst: Pt[], weights?: number[]): Hom | null {
  if (src.length < 4 || src.length !== dst.length) return null;
  const Ts = normTransform(src);
  const Td = normTransform(dst);
  const s = src.map(([x, y]) => applyH(Ts, x, y));
  const d = dst.map(([x, y]) => applyH(Td, x, y));
  const AtA = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const Atb = new Array<number>(8).fill(0);
  const addRow = (row: number[], rhs: number, wt: number) => {
    for (let i = 0; i < 8; i++) {
      if (row[i] === 0) continue;
      Atb[i] += wt * row[i] * rhs;
      for (let j = 0; j < 8; j++) AtA[i][j] += wt * row[i] * row[j];
    }
  };
  for (let k = 0; k < s.length; k++) {
    const [x, y] = s[k];
    const [u, v] = d[k];
    const wt = weights ? weights[k] : 1;
    addRow([x, y, 1, 0, 0, 0, -u * x, -u * y], u, wt);
    addRow([0, 0, 0, x, y, 1, -v * x, -v * y], v, wt);
  }
  const hv = solveLinear(AtA, Atb);
  if (!hv || hv.some((v) => !Number.isFinite(v))) return null;
  const Hn: Hom = [...hv, 1];
  return normalize(mulH(invertH(Td), mulH(Hn, Ts)));
}

/** Local scale (px per mm) of the mapping at a point. */
export function localScale(h: Hom, x: number, y: number): number {
  const e = 0.5;
  const [x0, y0] = applyH(h, x - e, y);
  const [x1, y1] = applyH(h, x + e, y);
  const [x2, y2] = applyH(h, x, y - e);
  const [x3, y3] = applyH(h, x, y + e);
  const ax = (x1 - x0) / (2 * e), ay = (y1 - y0) / (2 * e);
  const bx = (x3 - x2) / (2 * e), by = (y3 - y2) / (2 * e);
  return Math.sqrt(Math.abs(ax * by - ay * bx));
}
