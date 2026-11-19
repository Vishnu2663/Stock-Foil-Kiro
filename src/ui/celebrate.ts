// How loudly to react to a payday result. Pure: the verdict rules stay in vision/pair.ts; this only decides
// how a result is PRESENTED, so an honest "cut not checked" with every hole matching still feels like success.
import type { PairResult } from '../vision/pair';
import type { HalfScan } from '../vision/detect';

export type Level = 'full' | 'match' | 'warn' | 'bad' | 'none';

export function celebrationLevel(r: PairResult): Level {
  const v = r.verdict;
  if (v === 'genuine-consistent' || v === 'paid') return 'full';
  if (v === 'unreliable') return 'none';
  if (v === 'pair-mismatch') return 'bad';
  if (v === 'inconclusive') {
    const ok = (id: string) => r.checks.find((c) => c.id === id)?.ok === true;
    const holesAgree = !!r.comparison && r.comparison.consistent;
    if (ok('stock') && ok('foil') && ok('id') && ok('code') && holesAgree && r.pairOk) return 'match';
    return 'warn';
  }
  return 'warn'; // review, genuine-disputed
}

/** Stamp text and tone per level (translated by the caller). */
export function stampFor(r: PairResult, level: Level, verdictLabel: string): { text: string; tone: 'good' | 'warn' | 'bad' | 'grey' } {
  if (level === 'match') return { text: 'Holes match · cut not checked', tone: 'warn' };
  if (level === 'full') return { text: verdictLabel, tone: 'good' };
  if (level === 'bad') return { text: verdictLabel, tone: 'bad' };
  if (level === 'none') return { text: verdictLabel, tone: 'grey' };
  void r;
  return { text: verdictLabel, tone: 'warn' };
}

/** Confetti pieces per level; none with reduced motion, half on phones ("lite"). */
export function particleCount(level: Level, env: { reduced: boolean; lite: boolean }): number {
  if (env.reduced) return 0;
  const n = level === 'full' ? 90 : level === 'match' ? 40 : 0;
  return env.lite ? Math.round(n / 2) : n;
}

/** One id per distinct result, so the reveal and the celebration play once (not on every re-render). */
export function resultKey(r: PairResult, stock?: HalfScan, foil?: HalfScan): string {
  const agreed = r.comparison ? [...r.comparison.agreed].sort().join(',') : '';
  return [r.verdict, r.spec?.id ?? '', stock?.decoded.raw.length ?? 0, foil?.decoded.raw.length ?? 0, agreed, r.pay?.agreed.net ?? ''].join('|');
}

/**
 * The value shown while a money amount rolls up: whole major units only (never paise mid-roll),
 * and the exact amount once k reaches 1.
 */
export function rollValue(minor: number, k: number): number {
  if (k >= 1) return minor;
  const e = 1 - Math.pow(1 - Math.max(0, k), 3);
  const major = Math.trunc(minor / 100);
  return Math.round(major * e) * 100;
}
