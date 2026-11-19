// Pair verification (§6.6): edge match, punched-together alignment, checks, verdict and pay. Pure, no DOM.
import { cardCode, type CardSpec } from '../core/card';
import { verifyPairing, type PairingStatus } from '../core/pairing';
import { targetsFor } from '../core/layout';
import { compareSets, threeViews, type Comparison, type PayTerms, type RateChange, type ThreeViews, type WageSchedule } from '../core/wages';
import { punchSets, EDGE_XS, type HalfScan } from './detect';
import { makeWave } from '../core/wave';
import type { Verdict } from '../core/history';

// ---------------- edge match ----------------

export type EdgeStatus = 'match' | 'mismatch' | 'inconclusive';
export interface EdgeMatch {
  status: EdgeStatus;
  coverage: number;
  rms: number; // spread of the stock − foil gap, mm
  c: number; // shape correlation of the two edges; NaN when undefined
  score: number;
  n: number;
  /** each edge against the card's own designed wave (NaN when undefined) */
  cDesignStock: number;
  cDesignFoil: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Pearson correlation; NaN with fewer than 3 points or when either side has no variance. */
export function corr(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 3) return NaN;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 1e-9 && db > 1e-9 ? num / Math.sqrt(da * db) : NaN;
}

/**
 * Do the two photographed cut edges fit? Needs coverage ≥ 0.4. Match when rms ≤ 1.3 mm AND c ≥ 0.8;
 * mismatch when rms > 1.5 mm OR c < 0.75; otherwise (or when c is undefined) inconclusive.
 */
export function edgeMatch(stock: number[], foil: number[], waveId?: string): EdgeMatch {
  const total = Math.min(stock.length, foil.length);
  const a: number[] = [], b: number[] = [];
  const wave = waveId ? makeWave(waveId) : null;
  const sAll: number[] = [], dS: number[] = [], fAll: number[] = [], dF: number[] = [];
  for (let i = 0; i < total; i++) {
    const x = EDGE_XS[i];
    if (wave && Number.isFinite(stock[i])) { sAll.push(stock[i]); dS.push(wave.at(x)); }
    if (wave && Number.isFinite(foil[i])) { fAll.push(foil[i]); dF.push(wave.at(x)); }
    if (Number.isFinite(stock[i]) && Number.isFinite(foil[i])) { a.push(stock[i]); b.push(foil[i]); }
  }
  const n = a.length;
  const coverage = total ? n / total : 0;
  const cDesignStock = corr(sAll, dS), cDesignFoil = corr(fAll, dF);
  if (n < 3) return { status: 'inconclusive', coverage, rms: NaN, c: NaN, score: 0, n, cDesignStock, cDesignFoil };
  const d = a.map((v, i) => v - b[i]);
  const md = d.reduce((s, v) => s + v, 0) / n;
  const rms = Math.sqrt(d.reduce((s, v) => s + (v - md) ** 2, 0) / n);
  const c = corr(a, b);
  let status: EdgeStatus = 'inconclusive';
  if (coverage >= 0.4 && Number.isFinite(c)) {
    if (rms <= 1.3 && c >= 0.8) status = 'match';
    else if (rms > 1.5 || c < 0.75) status = 'mismatch';
  }
  const score = Number.isFinite(c) ? clamp01((c - 0.3) / 0.65) * clamp01((2.5 - rms) / 2) * 100 : 0;
  return { status, coverage, rms, c, score, n, cDesignStock, cDesignFoil };
}

// ---------------- alignment (holes punched together) ----------------

export interface AlignHole { key: string; s: [number, number]; f: [number, number]; clipped?: boolean }
export interface Alignment { checked: boolean; shared: number; flagged: string[]; residuals: Record<string, number>; tolerance: number; maxResidual: number }

/** Least-squares rigid transform (rotation + shift) mapping pts p onto q. */
export function fitRigid(p: [number, number][], q: [number, number][]): { a: number; tx: number; ty: number } {
  const n = p.length;
  let px = 0, py = 0, qx = 0, qy = 0;
  for (let i = 0; i < n; i++) { px += p[i][0]; py += p[i][1]; qx += q[i][0]; qy += q[i][1]; }
  px /= n; py /= n; qx /= n; qy /= n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const ax = p[i][0] - px, ay = p[i][1] - py, bx = q[i][0] - qx, by = q[i][1] - qy;
    sxx += ax * bx + ay * by;
    sxy += ax * by - ay * bx;
  }
  const a = Math.atan2(sxy, sxx);
  const c = Math.cos(a), s = Math.sin(a);
  return { a, tx: qx - (c * px - s * py), ty: qy - (s * px + c * py) };
}

const mapRigid = (t: { a: number; tx: number; ty: number }, [x, y]: [number, number]): [number, number] =>
  [Math.cos(t.a) * x - Math.sin(t.a) * y + t.tx, Math.sin(t.a) * x + Math.cos(t.a) * y + t.ty];

/** Residual of hole h against a rigid fit made from the other holes of `set` (foil → stock). */
function leaveOneOut(set: AlignHole[], h: AlignHole): number {
  const rest = set.filter((x) => x !== h);
  const t = fitRigid(rest.map((x) => x.f), rest.map((x) => x.s));
  const [mx, my] = mapRigid(t, h.f);
  return Math.hypot(mx - h.s[0], my - h.s[1]);
}

/**
 * "Punched together": needs ≥ 4 shared holes. Clipped holes (far from their target) are taken out first and
 * flagged with a residual of at least 3 mm. Then the worst outlier is removed and the fit redone, again and
 * again, until every remaining hole is within tolerance. Every removed hole is judged against the final fit.
 */
export function alignment(holes: AlignHole[], tolerance = 1.2): Alignment {
  const shared = holes.length;
  if (shared < 4) return { checked: false, shared, flagged: [], residuals: {}, tolerance, maxResidual: 0 };
  let act = holes.filter((h) => !h.clipped);
  const removed = holes.filter((h) => h.clipped);
  while (act.length >= 4) {
    const worstRes = Math.max(...act.map((h) => leaveOneOut(act, h)));
    if (worstRes <= tolerance) break;
    // The worst outlier is the hole whose removal leaves the others fitting best. (Taking the largest
    // leave-one-out residual instead can pick an honest hole with high leverage and pass a forged one.)
    let worst = act[0], bestRest = Infinity, bestOwn = -1;
    for (const h of act) {
      const rest = act.filter((x) => x !== h);
      const restMax = Math.max(...rest.map((x) => leaveOneOut(rest, x)));
      const own = leaveOneOut(act, h);
      if (restMax < bestRest - 1e-9 || (Math.abs(restMax - bestRest) <= 1e-9 && own > bestOwn)) { bestRest = restMax; bestOwn = own; worst = h; }
    }
    removed.push(worst);
    act = act.filter((h) => h !== worst);
  }
  const residuals: Record<string, number> = {};
  const fit = act.length >= 3 ? fitRigid(act.map((h) => h.f), act.map((h) => h.s)) : null;
  for (const h of act) residuals[h.key] = act.length >= 4 ? leaveOneOut(act, h) : 0;
  const flagged: string[] = [];
  for (const h of removed) {
    const [mx, my] = fit ? mapRigid(fit, h.f) : h.f;
    residuals[h.key] = Math.max(Math.hypot(mx - h.s[0], my - h.s[1]), h.clipped ? 3 : 0);
    flagged.push(h.key);
  }
  const maxResidual = act.length >= 4 ? Math.max(...act.map((h) => residuals[h.key])) : 0;
  return { checked: true, shared, flagged, residuals, tolerance, maxResidual };
}

export function holesFromScans(stock: HalfScan, foil: HalfScan): AlignHole[] {
  const ts = new Map(targetsFor(stock.decoded.spec).map((t) => [t.key, t]));
  const fc = new Map(foil.cells.map((c) => [c.key, c]));
  const out: AlignHole[] = [];
  for (const c of stock.cells) {
    const d = fc.get(c.key);
    const t = ts.get(c.key);
    if (!t || !d || !c.punched || !d.punched || !c.hole || !d.hole) continue;
    out.push({ key: c.key, s: [t.cx + c.hole.dx, t.cy + c.hole.dy], f: [t.cx + d.hole.dx, t.cy + d.hole.dy], clipped: c.hole.clipped || d.hole.clipped });
  }
  return out;
}

// ---------------- verdict ----------------

export interface Check { id: string; label: string; ok: boolean | null; detail: string }

export interface PairOptions {
  /** punched-together tolerance in mm (calibrated alignTolMm), default 1.2 */
  alignTolMm?: number;
  overrides?: { S?: Record<string, boolean>; F?: Record<string, boolean> };
  rateChange?: RateChange;
  /** the wage schedule to pay by (from the card, the member's history or custom); default: the printed card */
  wage?: WageSchedule;
}

export interface PairResult {
  verdict: Verdict;
  checks: Check[];
  pairing: PairingStatus | null;
  edge: EdgeMatch | null;
  align: Alignment | null;
  comparison: Comparison | null;
  pay: ThreeViews | null;
  spec: CardSpec | null;
  poseOk: boolean;
  pairOk: boolean;
  /** cells punched on BOTH halves (alignment needs their hole centres, which may not be measurable) */
  sharedPunched: number;
  minFiducials: number;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  'genuine-consistent': 'Genuine pair',
  'genuine-disputed': 'Genuine pair, holes differ',
  review: 'Genuine pair, check the holes',
  inconclusive: 'Cut not clear',
  'pair-mismatch': 'Halves do not match',
  unreliable: 'Photo not reliable',
  paid: 'Paid',
};

export function verdictTone(v: Verdict): 'good' | 'warn' | 'bad' | 'grey' {
  if (v === 'genuine-consistent' || v === 'paid') return 'good';
  if (v === 'genuine-disputed' || v === 'review') return 'warn';
  if (v === 'pair-mismatch') return 'bad';
  return 'grey';
}

export function verifyPair(stock: HalfScan | undefined, foil: HalfScan | undefined, opts: PairOptions = {}): PairResult {
  const checks: Check[] = [];
  const sOk = !!stock && stock.decoded.role === 'S';
  const fOk = !!foil && foil.decoded.role === 'F';
  checks.push({ id: 'stock', label: 'Worker half (stock) found', ok: sOk, detail: stock ? (sOk ? 'Found' : 'This half says it is the employer half') : 'Not found yet' });
  checks.push({ id: 'foil', label: 'Employer half (foil) found', ok: fOk, detail: foil ? (fOk ? 'Found' : 'This half says it is the worker half') : 'Not found yet' });
  const both = !!stock && !!foil;
  const sameId = both && stock!.decoded.spec.id === foil!.decoded.spec.id;
  checks.push({ id: 'id', label: 'Same card id', ok: both ? sameId : null, detail: both ? `${stock!.decoded.spec.id} / ${foil!.decoded.spec.id}` : '' });
  let codesOk = false;
  if (both) {
    const a = stock!.decoded, b = foil!.decoded;
    codesOk = a.codeOk && b.codeOk && a.code === b.code && cardCode(a.spec) === cardCode(b.spec);
  }
  checks.push({ id: 'code', label: 'Card code matches on both halves', ok: both ? codesOk : null, detail: both ? `${stock!.decoded.code} / ${foil!.decoded.code}` : '' });
  const pairing: PairingStatus | null = both
    ? verifyPairing(
        { role: stock!.decoded.role, id: stock!.decoded.spec.id, paired: stock!.decoded.paired, secret: stock!.decoded.secret, tag: stock!.decoded.tag },
        { role: foil!.decoded.role, id: foil!.decoded.spec.id, paired: foil!.decoded.paired, secret: foil!.decoded.secret, tag: foil!.decoded.tag },
      )
    : null;
  checks.push({
    id: 'pairing', label: 'Pairing code', ok: pairing === 'verified' ? true : pairing === 'failed' ? false : null,
    detail: pairing === 'verified' ? 'Verified: issued together' : pairing === 'failed' ? 'Failed: these halves were not issued together' : pairing === 'legacy' ? 'No pairing code: the cut decides' : '',
  });
  const discsPaired = both && !!stock!.decoded.spec.discs && pairing === 'verified';
  const edge = both ? edgeMatch(stock!.edge, foil!.edge, stock!.decoded.spec.id) : null;
  let edgeOk: boolean | null = null;
  let edgeDetail = '';
  if (edge) {
    const extra = pairing === 'verified';
    if (edge.status === 'match') edgeOk = true;
    else if (edge.status === 'mismatch') edgeOk = extra ? null : false;
    edgeDetail = `${edge.status === 'match' ? 'Fits' : edge.status === 'mismatch' ? 'Does not fit' : 'Not clear'} (score ${Math.round(edge.score)})` +
      (extra ? ' · extra evidence' : '') + (discsPaired && edge.status !== 'match' ? ' · optional on disc cards' : '');
  }
  checks.push({ id: 'edge', label: 'Wavy cut lines fit', ok: edgeOk, detail: edgeDetail });
  const rolesRight = sOk && fOk;
  const pairOk = rolesRight && sameId && codesOk && pairing !== 'failed' && (pairing === 'verified' || edge?.status !== 'mismatch');
  let comparison: Comparison | null = null;
  let pay: ThreeViews | null = null;
  let align: Alignment | null = null;
  let sharedPunched = 0;
  const spec = both ? stock!.decoded.spec : stock?.decoded.spec ?? foil?.decoded.spec ?? null;
  if (both && sameId) {
    const s = punchSets(stock!, opts.overrides?.S);
    const f = punchSets(foil!, opts.overrides?.F);
    const unsure = new Set([...s.unsure, ...f.unsure]);
    const manual = new Set([...s.manual, ...f.manual]);
    comparison = compareSets(stock!.decoded.spec, s.punched, f.punched, unsure, manual);
    const terms: PayTerms = {
      rateMinor: stock!.decoded.spec.rateMinor, advMinor: opts.wage?.advMinor ?? stock!.decoded.spec.advMinor, schedule: opts.wage?.ranges,
      carryMinor: stock!.decoded.spec.carryMinor, halves: stock!.decoded.spec.halves, rateChange: opts.rateChange,
    };
    pay = threeViews(comparison, terms);
    align = alignment(holesFromScans(stock!, foil!), opts.alignTolMm ?? 1.2);
    sharedPunched = [...comparison.agreed].length;
  }
  const oneSided = comparison ? comparison.stockOnly.size + comparison.foilOnly.size : 0;
  checks.push({
    id: 'holes', label: 'Every punch is on both halves',
    ok: comparison ? (comparison.unsureCount > 0 ? (oneSided ? false : null) : comparison.consistent) : null,
    detail: comparison ? (oneSided ? `${oneSided} one-sided` : 'All match') + (comparison.unsureCount ? ` · ${comparison.unsureCount} unsure` : '') : '',
  });
  checks.push({
    id: 'align', label: 'Holes punched together',
    ok: align ? (align.checked ? align.flagged.length === 0 : null) : null,
    detail: align ? (align.checked ? (align.flagged.length ? `${align.flagged.length} hole(s) look punched separately` : `${align.shared} holes line up`)
      : sharedPunched >= 4 ? `${sharedPunched} holes are on both halves, but their positions show only when holes look darker than the card. Put the halves on a dark surface to check this.`
      : `Only ${sharedPunched} hole(s) on both halves: 4 are needed to check`) : '',
  });
  const minFiducials = Math.min(stock?.pose.fiducialsFound ?? 0, foil?.pose.fiducialsFound ?? 0);
  const poseOk = both && minFiducials >= 3;
  if (opts.wage?.adjusted) checks.push({ id: 'wage', label: 'Wage adjusted', ok: null, detail: opts.wage.source === 'current' ? 'Paid by the member\'s current wage, not the printed one' : 'Paid by a custom wage, not the printed one' });
  checks.push({ id: 'photo', label: 'Photos sharp and complete enough', ok: both ? poseOk : null, detail: both ? `${minFiducials} of 4 corner squares` : '' });

  let verdict: Verdict;
  if (!poseOk && pairOk) verdict = 'unreliable';
  else if (!pairOk) verdict = 'pair-mismatch';
  else if (!comparison!.consistent) verdict = 'genuine-disputed';
  else if (align!.flagged.length > 0) verdict = 'review';
  else if (edge!.status === 'inconclusive' && pairing === 'legacy') verdict = 'inconclusive';
  else verdict = 'genuine-consistent';
  return { verdict, checks, pairing, edge, align, comparison, pay, spec, poseOk, pairOk, minFiducials, sharedPunched };
}

/** Pick the worker and employer halves from many scanned photos. */
export function pickHalves(halves: HalfScan[]): { stock?: HalfScan; foil?: HalfScan } {
  const stock = halves.find((h) => h.decoded.role === 'S');
  const foil = halves.find((h) => h.decoded.role === 'F' && (!stock || h.decoded.spec.id === stock.decoded.spec.id)) ?? halves.find((h) => h.decoded.role === 'F');
  return { stock, foil };
}
