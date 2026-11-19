// The payday result as a retro time-clock: stamp slam, odometer amount, typed formula, the two halves as
// sepia paper cards with real holes, a check timeline and a pay slip that prints out of a slot.
// The verdict itself comes from vision/pair.ts unchanged; only its presentation is decided here.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PairResult, Check } from '../../vision/pair';
import { VERDICT_LABEL } from '../../vision/pair';
import { WARNING_TEXT, type HalfScan, type WarningCode } from '../../vision/detect';
import { formatMoney, type CardSpec, type Role } from '../../core/card';
import { daysInMonth, firstWeekday, targetsFor } from '../../core/layout';
import { cashBreakdown } from '../../core/cash';
import { makeWave } from '../../core/wave';
import { stampFor, type Level } from '../celebrate';
import { confetti, createScope, motionEnv, revealPlan, type Scope } from '../anim';
import { Odometer, Typer } from './Motion';
import { NotePic } from './Result';
import { useApp } from '../ctx';

/** Short weekday names (Monday first) in the card's language. */
const week = (lang: string) => Array.from({ length: 7 }, (_, i) => { try { return new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))).replace('.', ''); } catch { return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]; } });

/** The plain formula line, e.g. "3 days × ₹700 = ₹2,100 − 2 × ₹100 = ₹1,900". */
export function formulaText(r: PairResult, t: (s: string, ...a: (string | number)[]) => string): string {
  const v = r.pay?.agreed, spec = r.spec;
  if (!v || !spec) return '';
  const m = (x: number) => formatMoney(x, spec.currency);
  const days = v.days % 1 ? `${Math.floor(v.days)}½` : String(v.days);
  let s = `${t('{0} days', days)} × ${m(spec.rateMinor)} = ${m(v.gross)}`;
  if (v.advCount) s += ` − ${v.advCount} × ${m(spec.advMinor)}`;
  if (v.carry) s += ` ${v.carry < 0 ? '−' : '+'} ${m(Math.abs(v.carry))}`;
  return s + ` = ${m(v.net)}`;
}

/** Ink blots under the stamp (decoration). */
function Splatter({ tone }: { tone: string }) {
  return (
    <svg className={'splat ' + tone} viewBox="0 0 120 60" aria-hidden="true">
      <circle cx="18" cy="40" r="5" /><circle cx="27" cy="48" r="2.5" /><circle cx="98" cy="14" r="4" /><circle cx="106" cy="22" r="2" />
      <ellipse cx="60" cy="52" rx="9" ry="3" /><circle cx="84" cy="50" r="2.2" /><circle cx="12" cy="18" r="1.8" />
    </svg>
  );
}

export interface HeroProps {
  result: PairResult;
  rkey: string;
  level: Level;
  children?: ReactNode;
  actions: ReactNode;
  onJoin?: () => void;
}

/** The hero: stamp slam, odometer amount, typed formula, notes fan, actions. Plays once per result key. */
export function ResultHero({ result, rkey, level, children, actions, onJoin }: HeroProps) {
  const { t } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLSpanElement>(null);
  const [skip, setSkip] = useState(false);
  const plan = useMemo(() => revealPlan(level, motionEnv()), [level, rkey]); // eslint-disable-line react-hooks/exhaustive-deps
  const spec = result.spec;
  const v = result.pay?.agreed;
  const stamp = stampFor(result, level, VERDICT_LABEL[result.verdict]);
  const showAmount = !!v && !!spec && result.verdict !== 'pair-mismatch' && result.verdict !== 'unreliable';
  const cash = showAmount ? cashBreakdown(v!.net, spec!.currency) : null;

  useEffect(() => {
    const sc = createScope();
    if (plan.instant) return () => sc.dispose();
    sc.timeout(() => {
      if (plan.shake) sc.animate(root.current, [{ transform: 'translate(0,0)' }, { transform: 'translate(3px,-2px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }], { duration: 160 });
    }, plan.stampAt + 330);
    sc.timeout(() => {
      const r = stampRef.current?.getBoundingClientRect();
      if (r && plan.particles) confetti(sc, r.left + r.width / 2, r.top + r.height / 2, plan.particles);
    }, plan.burstAt);
    if (level === 'bad') sc.timeout(() => sc.animate(root.current, [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' }], { duration: 420 }), plan.stampAt + 400);
    return () => sc.dispose();
  }, [rkey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={root} className={`rv-hero lvl-${level}` + (plan.instant || skip ? ' rv-instant' : '')} onClick={() => setSkip(true)}>
      <div className="rv-hero-top">
        <div>
          <div className="kicker" data-notranslate>{spec ? new Intl.DateTimeFormat(spec.lang || 'en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(spec.year, spec.month - 1, 1))) : ''}</div>
          {spec && <h2 className="rv-names" data-notranslate>{spec.worker || '—'} · {spec.employer || '—'}</h2>}
        </div>
        <span className="rv-stamp-wrap">
          {plan.splatter && !skip && <Splatter tone={stamp.tone} />}
          <span ref={stampRef} className={`rv-stamp ${stamp.tone}`} role="status">{t(stamp.text)}</span>
        </span>
      </div>
      {showAmount && (
        <>
          <div className="rv-label">{v!.net < 0 ? t('Worker owes') : t('To pay')}</div>
          <div className={'rv-amount' + (plan.sheen ? ' sheen' : '')}>
            {skip || plan.instant ? <span className="odo">{formatMoney(Math.abs(v!.net), spec!.currency)}</span> : <Odometer text={formatMoney(Math.abs(v!.net), spec!.currency)} delay={plan.amountAt} />}
          </div>
          <div className="rv-formula">{skip || plan.instant ? formulaText(result, t) : <Typer text={formulaText(result, t)} delay={plan.formulaAt} />}</div>
          {cash && cash.notes.length > 0 && (
            <div className="rv-notes" aria-label={t('Notes to hand over')}>
              {cash.notes.flatMap((n) => Array.from({ length: Math.min(n.count, 6) }, (_, i) => ({ n, i }))).map(({ n, i }, k, all) => (
                <span key={`${n.value}-${i}`} className="rv-note" style={{ ['--k' as string]: k, ['--n' as string]: all.length }} data-notranslate>
                  <NotePic value={n.value} currency={spec!.currency} />
                </span>
              ))}
              <span className="rv-notes-sum" data-notranslate>{cash.notes.map((n) => `${n.value}×${n.count}`).join(' · ')}</span>
            </div>
          )}
        </>
      )}
      {level === 'match' && onJoin && (
        <button className="btn small rv-join" onClick={(e) => { e.stopPropagation(); onJoin(); }}>
          ✂ {t('Check the cut: lay both halves side by side, wavy edges touching, on a dark table')}
        </button>
      )}
      {children}
      <div className="rv-actions">{actions}</div>
    </div>
  );
}

// ---------------- the tally: both halves as sepia paper ----------------

interface PaperProps {
  half: HalfScan; role: Role; oneSided: Set<string>; overrides?: Record<string, boolean>; onToggle?: (key: string) => void; firstUnsure?: string; flash?: 'warn' | 'bad' | '';
}

function wavePathFor(id: string, role: Role, w: number): string {
  const wave = makeWave(id);
  const pts: string[] = [];
  for (let x = 0; x <= w; x += 4) pts.push(`${x} ${(6 + wave.at((x / w) * 186) * 0.9).toFixed(1)}`);
  return role === 'S' ? `M0 0 L${pts.join(' L')} L${w} 0 Z` : `M0 14 L${pts.join(' L')} L${w} 14 Z`;
}

function PaperHalf({ half, role, oneSided, overrides, onToggle, firstUnsure, flash }: PaperProps) {
  const { t } = useApp();
  const spec = half.decoded.spec;
  const cells = new Map(half.cells.map((c) => [c.key, c]));
  const off = firstWeekday(spec.year, spec.month);
  const dim = daysInMonth(spec.year, spec.month);
  const keysFor = (d: number) => (spec.halves ? [`d${d}a`, `d${d}b`] : [`d${d}`]);
  const isOn = (k: string) => overrides?.[k] ?? cells.get(k)?.punched ?? false;
  const isUnsure = (k: string) => !!cells.get(k)?.unsure && overrides?.[k] === undefined;
  const isManual = (k: string) => overrides?.[k] !== undefined;
  const spot = (k: string, i: number) => {
    const cls = 'spot' + (isOn(k) ? ' hole' : '') + (isUnsure(k) ? ' unsure' : '') + (oneSided.has(k) ? ' one' : '');
    return <span key={k} className={cls} data-k={role + k} style={{ ['--j' as string]: i }} />;
  };
  const rows: ReactNode[] = [];
  for (let i = 0; i < off; i++) rows.push(<span key={'b' + i} className="pday blank" aria-hidden="true" />);
  for (let d = 1; d <= dim; d++) {
    const ks = keysFor(d);
    const row = Math.floor((off + d - 1) / 7);
    const unsure = ks.some(isUnsure), manual = ks.some(isManual), one = ks.some((k) => oneSided.has(k));
    const col = (off + d - 1) % 7;
    const label = t('Day {0}', d) + ': ' + ks.map((k) => (isOn(k) ? t('punched') : t('not punched'))).join(', ') + (unsure ? ', ' + t('unsure') : '');
    const cls = 'pday' + (col >= 5 ? ' we' : '') + (one ? ' one' : '') + (manual ? ' manual' : '') + (unsure ? ' unsure' : '');
    const inner = (
      <>
        <span className="pnum">{d}</span>
        <span className="pspots">{ks.map((k, i) => spot(k, i))}</span>
        {firstUnsure && ks.includes(firstUnsure) && <span className="ptag">{t('tap to confirm')}</span>}
        {manual && <span className="pmanual">{t('manual')}</span>}
      </>
    );
    const key = ks.find((k) => isUnsure(k) || isManual(k)) ?? ks[0];
    rows.push(onToggle && (unsure || manual)
      ? <button key={d} type="button" className={cls} style={{ ['--row' as string]: row }} aria-label={label} onClick={() => onToggle(key)}>{inner}</button>
      : <span key={d} className={cls} style={{ ['--row' as string]: row }} aria-label={label} role="img">{inner}</span>);
  }
  const adv = targetsFor(spec).filter((x) => x.kind === 'adv');
  return (
    <div className={`paper-half ${role === 'S' ? 'stock' : 'foil'}` + (flash ? ' flash-' + flash : '')}>
      {role === 'F' && <svg className="pedge top" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true"><path d={wavePathFor(spec.id, 'F', 300)} /></svg>}
      <div className="phead"><b>{role === 'S' ? 'STOCK' : 'FOIL'}</b> <i>{role === 'S' ? t('worker keeps') : t('employer keeps')}</i><span className="pid" data-notranslate>{spec.id}</span></div>
      <div className="pweek" aria-hidden="true">{week(spec.lang || 'en').map((w, i) => <span key={i} className={i >= 5 ? 'we' : ''} data-notranslate>{w.toUpperCase()}</span>)}</div>
      <div className="pgrid">{rows}</div>
      <div className="padv">
        <span className="padv-l">{t('Advances')}</span>
        {adv.map((a, i) => (
          <span key={a.key} className={'stub' + (isOn(a.key) ? ' on' : '') + (isUnsure(a.key) ? ' unsure' : '') + (oneSided.has(a.key) ? ' one' : '')} style={{ ['--i' as string]: i }} data-k={role + a.key}>
            <span className="snum">{a.n}</span>
            {onToggle && (isUnsure(a.key) || isManual(a.key))
              ? <button type="button" className="sbtn" aria-label={t('Advance {0}', a.n)} onClick={() => onToggle(a.key)} />
              : null}
            {isOn(a.key) && <span className="coin" aria-hidden="true" />}
          </span>
        ))}
      </div>
      {role === 'S' && <svg className="pedge bottom" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true"><path d={wavePathFor(spec.id, 'S', 300)} /></svg>}
    </div>
  );
}

export interface TallyProps {
  stock?: HalfScan; foil?: HalfScan; oneSided: Set<string>;
  overrides: { S: Record<string, boolean>; F: Record<string, boolean> };
  onToggle: (role: Role) => (key: string) => void; level: Level; rkey: string;
}

/** Both halves side by side (stacked on phones), with a red line joining each one-sided spot across them. */
export function TallyPair({ stock, foil, oneSided, overrides, onToggle, level, rkey }: TallyProps) {
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);
  const firstUnsure = useMemo(() => {
    for (const h of [stock, foil]) {
      const c = h?.cells.find((x) => x.unsure && (h.decoded.role === 'S' ? overrides.S : overrides.F)[x.key] === undefined);
      if (c) return { role: h!.decoded.role, key: c.key };
    }
    return null;
  }, [stock, foil, overrides]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const out: typeof lines = [];
      for (const k of oneSided) {
        const a = el.querySelector(`[data-k="S${k}"]`), c = el.querySelector(`[data-k="F${k}"]`);
        if (!a || !c) continue;
        const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect();
        out.push({ x1: ra.left + ra.width / 2 - b.left, y1: ra.top + ra.height / 2 - b.top, x2: rc.left + rc.width / 2 - b.left, y2: rc.top + rc.height / 2 - b.top });
      }
      setLines(out);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [oneSided, stock, foil]);
  // WARN: pulse the unsure spots 3 times and bring the first one into view. BAD: blink the one-sided holes.
  useEffect(() => {
    const env = motionEnv();
    const sc: Scope = createScope();
    if (level === 'warn' && firstUnsure) sc.timeout(() => {
      box.current?.classList.add('pulse-unsure');
      if (!env.reduced) box.current?.querySelector('.pday.unsure, .stub.unsure')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, env.reduced ? 0 : 1600);
    if (level === 'bad' || level === 'warn') sc.timeout(() => box.current?.classList.add('blink-one'), env.reduced ? 0 : 1500);
    return () => sc.dispose();
  }, [rkey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tally-pair" ref={box}>
      {stock && <PaperHalf half={stock} role="S" oneSided={oneSided} overrides={overrides.S} onToggle={onToggle('S')} firstUnsure={firstUnsure?.role === 'S' ? firstUnsure.key : undefined} />}
      {foil && <PaperHalf half={foil} role="F" oneSided={oneSided} overrides={overrides.F} onToggle={onToggle('F')} firstUnsure={firstUnsure?.role === 'F' ? firstUnsure.key : undefined} />}
      {lines.length > 0 && (
        <svg className="tally-lines" aria-hidden="true">
          {lines.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />)}
        </svg>
      )}
    </div>
  );
}

// ---------------- checks as a timeline ----------------

const FIX: Record<string, string> = {
  stock: 'Show the worker half (stock) to the camera.',
  foil: 'Show the employer half (foil) to the camera.',
  id: 'These halves come from different cards. Find the matching half.',
  code: 'One half was reprinted or edited. Use the original halves.',
  pairing: 'These halves were not issued together, or one was made up.',
  edge: 'Lay both halves edge to edge on a dark table and check the cut.',
  holes: 'Tap the one-sided or unsure days and check them by eye.',
  align: 'A hole looks punched separately. Check it by eye with both halves stacked.',
  photo: 'Retake the photo with all 4 corner squares in view.',
};

export function CheckTimeline({ result, onJoin, rkey }: { result: PairResult; onJoin?: () => void; rkey: string }) {
  const { t } = useApp();
  return (
    <ol className="check-line" key={rkey}>
      {result.checks.map((c: Check, i) => {
        const st = c.ok === true ? 'ok' : c.ok === false ? 'no' : 'unk';
        return (
          <li key={c.id} className={st} style={{ ['--i' as string]: i }}>
            <span className="cl-mark" aria-hidden="true">
              <svg viewBox="0 0 20 20">{st === 'ok' ? <path d="M4 10.5l4 4 8-9" pathLength={1} /> : st === 'no' ? <path d="M5 5l10 10M15 5L5 15" pathLength={1} /> : <path d="M5 10h10" pathLength={1} />}</svg>
            </span>
            <span className="cl-body">
              <b>{t(c.label)}</b> <span className="sr-only">{st === 'ok' ? t('passed') : st === 'no' ? t('failed') : t('not decided')}</span>
              {c.detail && <span className="cl-detail" data-notranslate={c.id === 'id' || c.id === 'code' ? '' : undefined}>{c.detail}</span>}
              {st === 'no' && FIX[c.id] && <span className="cl-fix">{t(FIX[c.id])}</span>}
              {c.id === 'edge' && st !== 'ok' && onJoin && <button className="btn small cl-join" onClick={onJoin}>✂ {t('Check the cut now')}</button>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The slip prints out of a slot: a clip-path reveal from the top with a little paper wobble. */
export function SlipPrint({ children, rkey }: { children: ReactNode; rkey: string }) {
  return (
    <div className="slip-slot">
      <span className="slip-mouth" aria-hidden="true" />
      <div className="slip-out" key={rkey}>{children}</div>
    </div>
  );
}

/** All photo warnings of both halves in one compact banner ('partial' is information only and is left out). */
export function WarningBanner({ halves }: { halves: (HalfScan | undefined)[] }) {
  const { t } = useApp();
  const ws = [...new Set(halves.flatMap((h) => h?.warnings ?? []))].filter((w): w is WarningCode => w !== 'partial');
  if (!ws.length) return null;
  return (
    <div className="rv-warn" role="note">
      <span aria-hidden="true">⚠</span>
      <span>{ws.map((w) => t(WARNING_TEXT[w])).join(' ')}</span>
    </div>
  );
}

/** A collapsible section (open by default; on phones it can be folded). */
export function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <details className={'panel rv-sec ' + className} open>
      <summary><h2>{title}</h2></summary>
      {children}
    </details>
  );
}

export type { CardSpec };
