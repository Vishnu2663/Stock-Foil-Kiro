// Pair verification (§6.6): edge match, punched-together alignment, checks, verdict and pay. Pure, no DOM.
import { cardCode, type CardSpec } from '../core/card';
import { verifyPairing, type PairingStatus } from '../core/pairing';
import { targetsFor } from '../core/layout';
import { compareSets, threeViews, type Comparison, type PayTerms, type RateChange, type ThreeViews } from '../core/wages';
import { punchSets, type HalfScan } from './detect';
import type { Verdict } from '../core/history';

// ---------------- edge match ----------------

export type EdgeStatus = 'match' | 'mismatch' | 'inconclusive';
export interface EdgeMatch { status: EdgeStatus; coverage: number; rms: number; c: number; score: number; n: number }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function edgeMatch(stock: number[], foil: number[]): EdgeMatch {
  const total = Math.min(stock.length, foil.length);
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < total; i++) if (Number.isFinite(stock[i]) && Number.isFinite(foil[i])) { a.push(stock[i]); b.push(foil[i]); }
  const n = a.length;
  const coverage = total ? n / total : 0;
  if (n < 3) return { status: 'inconclusive', coverage, rms: NaN, c: NaN, score: 0, n };
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0, sd = 0, sdd = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
    const d = a[i] - b[i];
    sd += d; sdd += d * d;
  }
  const md = sd / n;
  const rms = Math.sqrt(Math.max(0, sdd / n - md * md));
  const c = saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
  const score = clamp01((c - 0.3) / 0.65) * clamp01((2.5 - rms) / 2) * 100;
  let status: EdgeStatus = 'inconclusive';
  if (coverage >= 0.4) {
    if (rms <= 1.3 && c >= 0.8) status = 'match';
    else if (rms > 1.5 || c < 0.75) status = 'mismatch';
  }
  return { status, coverage, rms, c, score, n };
}

// ---------------- alignment (holes punched together) ----------------

export interface AlignHole { key: string; s: [number, number]; f: [number, number] }
export interface Alignment { checked: boolean; shared: number; flagged: string[]; residuals: Record<string, number>; tolerance: number }

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

export function alignment(holes: AlignHole[], tolerance = 1.2): Alignment {
  const shared = holes.length;
  if (shared < 4) return { checked: false, shared, flagged: [], residuals: {}, tolerance };
  const flagged: string[] = [];
  const residuals: Record<string, number> = {};
  for (let i = 0; i < shared; i++) {
    const others = holes.filter((_, j) => j !== i);
    const t = fitRigid(others.map((h) => h.f), others.map((h) => h.s));
    const [fx, fy] = holes[i].f;
    const c = Math.cos(t.a), s = Math.sin(t.a);
    const mx = c * fx - s * fy + t.tx, my = s * fx + c * fy + t.ty;
    const r = Math.hypot(mx - holes[i].s[0], my - holes[i].s[1]);
    residuals[holes[i].key] = r;
    if (r > tolerance) flagged.push(holes[i].key);
  }
  return { checked: true, shared, flagged, residuals, tolerance };
}

export function holesFromScans(stock: HalfScan, foil: HalfScan): AlignHole[] {
  const ts = new Map(targetsFor(stock.decoded.spec).map((t) => [t.key, t]));
  const fc = new Map(foil.cells.map((c) => [c.key, c]));
  const out: AlignHole[] = [];
  for (const c of stock.cells) {
    const d = fc.get(c.key);
    const t = ts.get(c.key);
    if (!t || !d || !c.hole || !d.hole || c.hole.clipped || d.hole.clipped || c.unsure || d.unsure) continue;
    out.push({ key: c.key, s: [t.cx + c.hole.dx, t.cy + c.hole.dy], f: [t.cx + d.hole.dx, t.cy + d.hole.dy] });
  }
  return out;
}

// ---------------- verdict ----------------

export interface Check { id: string; label: string; ok: boolean | null; detail: string }

export interface PairOptions {
  tolerance?: number;
  overrides?: { S?: Record<string, boolean>; F?: Record<string, boolean> };
  rateChange?: RateChange;
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
  const edge = both ? edgeMatch(stock!.edge, foil!.edge) : null;
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
  const spec = both ? stock!.decoded.spec : stock?.decoded.spec ?? foil?.decoded.spec ?? null;
  if (both && sameId) {
    const s = punchSets(stock!, opts.overrides?.S);
    const f = punchSets(foil!, opts.overrides?.F);
    const unsure = new Set([...s.unsure, ...f.unsure]);
    const manual = new Set([...s.manual, ...f.manual]);
    comparison = compareSets(stock!.decoded.spec, s.punched, f.punched, unsure, manual);
    const terms: PayTerms = {
      rateMinor: stock!.decoded.spec.rateMinor, advMinor: stock!.decoded.spec.advMinor,
      carryMinor: stock!.decoded.spec.carryMinor, halves: stock!.decoded.spec.halves, rateChange: opts.rateChange,
    };
    pay = threeViews(comparison, terms);
    align = alignment(holesFromScans(stock!, foil!), opts.tolerance ?? 1.2);
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
    detail: align ? (align.checked ? (align.flagged.length ? `${align.flagged.length} hole(s) look punched separately` : `${align.shared} holes line up`) : 'Fewer than 4 shared holes: not checked') : '',
  });
  const minFiducials = Math.min(stock?.pose.fiducialsFound ?? 0, foil?.pose.fiducialsFound ?? 0);
  const poseOk = both && minFiducials >= 3;
  checks.push({ id: 'photo', label: 'Photos sharp and complete enough', ok: both ? poseOk : null, detail: both ? `${minFiducials} of 4 corner squares` : '' });

  let verdict: Verdict;
  if (!poseOk && pairOk) verdict = 'unreliable';
  else if (!pairOk) verdict = 'pair-mismatch';
  else if (!comparison!.consistent) verdict = 'genuine-disputed';
  else if (align!.flagged.length > 0 || comparison!.unsureCount > 0) verdict = 'review';
  else if (edge!.status === 'inconclusive' && pairing === 'legacy') verdict = 'inconclusive';
  else verdict = 'genuine-consistent';
  return { verdict, checks, pairing, edge, align, comparison, pay, spec, poseOk, pairOk, minFiducials };
}

/** Pick the worker and employer halves from many scanned photos. */
export function pickHalves(halves: HalfScan[]): { stock?: HalfScan; foil?: HalfScan } {
  const stock = halves.find((h) => h.decoded.role === 'S');
  const foil = halves.find((h) => h.decoded.role === 'F' && (!stock || h.decoded.spec.id === stock.decoded.spec.id)) ?? halves.find((h) => h.decoded.role === 'F');
  return { stock, foil };
}
