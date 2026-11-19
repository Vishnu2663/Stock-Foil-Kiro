// Stylised banknotes (not copies of real notes: no emblems, portraits or real artwork) and the stacks that
// are dealt out of a cash box whenever the amount to pay changes.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CashBreakdown } from '../../core/cash';
import { formatMoney } from '../../core/card';
import { createScope, motionEnv, paperFlick, type Scope } from '../anim';
import { useApp } from '../ctx';

/** Rough real-life tints for INR values (just the colour family); other currencies get a hue from the value. */
const INR_TINT: Record<number, number> = { 2000: 330, 500: 40, 200: 38, 100: 265, 50: 190, 20: 75, 10: 25 };
export function noteTint(value: number, currency: string): { paper: string; ink: string; line: string } {
  if (currency === 'INR' && value === 500) return { paper: '#d9d6cc', ink: '#3f3d36', line: '#8f8a7c' }; // stone grey
  if (currency === 'INR' && value === 10) return { paper: '#d6b89a', ink: '#4a2c16', line: '#8a5a36' }; // chocolate
  const hue = currency === 'INR' && INR_TINT[value] !== undefined ? INR_TINT[value] : Math.round(Math.log10(Math.max(1, value)) * 83 + 20) % 360;
  const sat = currency === 'INR' && value === 200 ? 78 : 42;
  return { paper: `hsl(${hue} ${sat}% 80%)`, ink: `hsl(${hue} 45% 22%)`, line: `hsl(${hue} 35% 45%)` };
}

/** One note: paper grain, guilloche border, big typewriter value, currency seal, serial line. */
export function Banknote({ value, currency, serial = '' }: { value: number; currency: string; serial?: string }) {
  const c = noteTint(value, currency);
  const waves = [0, 1, 2].map((k) => {
    let d = '';
    for (let x = 4; x <= 116; x += 2) d += `${x === 4 ? 'M' : 'L'}${x} ${(6 + k * 1.6 + Math.sin(x / (3 + k)) * 1.2).toFixed(2)}`;
    return d;
  });
  const id = `ng${value}${currency}`;
  return (
    <svg className="banknote" viewBox="0 0 120 60" aria-hidden="true">
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed={value % 97} /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .12 0" /><feComposite in2="SourceGraphic" operator="in" /></filter>
      </defs>
      <rect x="1" y="1" width="118" height="58" rx="3" fill={c.paper} stroke={c.line} strokeWidth="1.2" />
      <rect x="1" y="1" width="118" height="58" rx="3" fill="#000" filter={`url(#${id})`} />
      <g fill="none" stroke={c.line} strokeWidth=".55" opacity=".8">
        {waves.map((d, i) => <path key={i} d={d} />)}
        {waves.map((d, i) => <path key={'b' + i} d={d} transform="translate(0 44)" />)}
        <rect x="6" y="14" width="108" height="32" rx="2" strokeDasharray="1 1.4" />
      </g>
      <text x="12" y="40" fontFamily="'Courier Prime','Courier New',monospace" fontWeight="800" fontSize="22" fill={c.ink}>{value}</text>
      <circle cx="95" cy="30" r="10" fill="none" stroke={c.ink} strokeWidth="1" />
      <circle cx="95" cy="30" r="7.5" fill="none" stroke={c.line} strokeWidth=".6" strokeDasharray="1 1" />
      <text x="95" y="33" textAnchor="middle" fontFamily="system-ui,sans-serif" fontWeight="800" fontSize="6.5" fill={c.ink}>{currency}</text>
      <text x="12" y="52" fontFamily="'Courier Prime','Courier New',monospace" fontSize="5" fill={c.ink} opacity=".75">{serial}</text>
    </svg>
  );
}

const serialOf = (v: number, i: number) => `SF ${String((v * 7919 + i * 104729) % 1000000).padStart(6, '0')}`;
const MAX_LAYERS = 10;

/**
 * The actual notes as stacks (one per value, up to 10 visible layers + a ×N badge). New notes are dealt from the
 * cash box on the left, removed ones fly out to the right. Hover or tap fans a stack: "3 × ₹500 = ₹1,500".
 */
export function NoteStacks({ cash, currency, compact = false, dealKey }: { cash: CashBreakdown; currency: string; compact?: boolean; dealKey: string }) {
  const { t, settings } = useApp();
  const box = useRef<HTMLDivElement>(null);
  const cashBox = useRef<HTMLSpanElement>(null);
  const prev = useRef<Map<number, number>>(new Map());
  const [ghosts, setGhosts] = useState<{ value: number; n: number; id: number }[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const scope = useRef<Scope>(createScope());
  useEffect(() => { const s = createScope(); scope.current = s; return () => s.dispose(); }, []);
  const instant = motionEnv().reduced;

  useLayoutEffect(() => {
    const now = new Map(cash.notes.map((n) => [n.value, n.count]));
    const before = prev.current;
    prev.current = now;
    const env = motionEnv();
    if (env.reduced || !box.current) return;
    const sc = scope.current;
    // removed notes fly out to the right
    const gone: { value: number; n: number; id: number }[] = [];
    for (const [v, c] of before) { const d = c - (now.get(v) ?? 0); if (d > 0) gone.push({ value: v, n: Math.min(d, MAX_LAYERS), id: Date.now() + v }); }
    if (gone.length) { setGhosts(gone); sc.timeout(() => setGhosts([]), 520); }
    // new layers are dealt from the cash box, one by one (70 ms stagger, ±6°)
    const from = cashBox.current?.getBoundingClientRect();
    const layers = [...box.current.querySelectorAll<HTMLElement>('.nlayer[data-new="1"]')];
    layers.forEach((el, i) => {
      const to = el.getBoundingClientRect();
      const dx = from ? from.left - to.left : -120, dy = from ? from.top - to.top : 0;
      const rot = (Math.random() * 12 - 6).toFixed(1);
      sc.animate(el, [
        { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(.8)`, opacity: 0 },
        { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 16}px) rotate(${-Number(rot)}deg)`, opacity: 1, offset: 0.6 },
        { transform: 'none', opacity: 1 },
      ], { duration: 380, delay: i * 70, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'backwards' });
      if (i < 6) sc.timeout(() => paperFlick(sc, settings.sounds), i * 70 + 200);
    });
  }, [dealKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = (x: number) => formatMoney(x, currency);
  if (!cash.notes.length && cash.remainderMinor <= 0) return null;
  const before = prev.current;
  return (
    <div className={'note-stacks' + (compact ? ' compact' : '') + (instant ? ' still' : '')} ref={box}>
      {!compact && <span className="cash-box" ref={cashBox} aria-hidden="true"><i /></span>}
      {cash.notes.map((n) => {
        const shown = Math.min(n.count, MAX_LAYERS);
        const had = Math.min(before.get(n.value) ?? 0, MAX_LAYERS);
        return (
          <button type="button" key={n.value} className={'nstack' + (open === n.value ? ' fan' : '')} style={{ ['--n' as string]: shown }}
            onMouseEnter={() => setOpen(n.value)} onMouseLeave={() => setOpen(null)} onFocus={() => setOpen(n.value)} onBlur={() => setOpen(null)}
            onClick={() => setOpen(open === n.value ? null : n.value)}
            aria-label={t('{0} × {1} = {2}', n.count, m(n.value * 100), m(n.value * 100 * n.count))}>
            {Array.from({ length: shown }, (_, i) => (
              <span key={i} className="nlayer" data-new={!instant && i >= had ? '1' : '0'} style={{ ['--i' as string]: i }}>
                <Banknote value={n.value} currency={currency} serial={serialOf(n.value, i)} />
              </span>
            ))}
            {n.count > 1 && <span className="nbadge" data-notranslate>×{n.count}</span>}
            {open === n.value && <span className="ntip" data-notranslate>{`${n.count} × ${m(n.value * 100)} = ${m(n.value * 100 * n.count)}`}</span>}
          </button>
        );
      })}
      {ghosts.map((g) => (
        <span key={g.id} className="nstack ghost-stack" aria-hidden="true">
          {Array.from({ length: g.n }, (_, i) => <span key={i} className="nlayer ghost" style={{ ['--i' as string]: i }}><Banknote value={g.value} currency={currency} /></span>)}
        </span>
      ))}
      {cash.remainderMinor > 0 && <span className="coin-chip" data-notranslate>+ {m(cash.remainderMinor)} {t('in coins')}</span>}
    </div>
  );
}
