import { useEffect, useRef, type ReactNode } from 'react';
import type { PairResult } from '../../vision/pair';
import { verdictTone, VERDICT_LABEL } from '../../vision/pair';
import { WARNING_TEXT, type HalfScan, type WarningCode } from '../../vision/detect';
import { formatMoney, MONTH_NAMES, type CardSpec } from '../../core/card';
import { daysInMonth, firstWeekday, targetsFor } from '../../core/layout';
import type { PayView, RateChange } from '../../core/wages';
import { cashBreakdown } from '../../core/cash';
import { slipDict, fill } from '../../i18n/index';
import { partyPops } from '../fx';
import { CountUp, Money } from './Controls';
import { useApp } from '../ctx';

export const daysText = (v: PayView) => (v.days % 1 ? `${Math.floor(v.days)}½` : String(v.days));
export const warningText = (w: WarningCode) => WARNING_TEXT[w];

export function PaydayCard({ result, children, compact, rateChange }: { result: PairResult; children?: ReactNode; compact?: boolean; rateChange?: RateChange }) {
  const { t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const tone = verdictTone(result.verdict);
  const genuine = result.verdict === 'genuine-consistent';
  useEffect(() => {
    if (genuine && ref.current) partyPops(ref.current);
  }, [genuine, result]);
  const spec = result.spec;
  const pay = result.pay?.agreed;
  return (
    <div ref={ref} className={`panel payday tone-${tone}`} data-tilt={genuine ? '3' : undefined}>
      <div className="spread">
        <div>
          <div className="kicker" data-notranslate>{spec ? `${MONTH_NAMES[spec.month - 1]} ${spec.year}` : ''}</div>
          {spec && <h2 style={{ margin: 0 }} data-notranslate>{spec.worker} · {spec.employer}</h2>}
        </div>
        <span className={`stamp ${tone}`} role="status">{t(VERDICT_LABEL[result.verdict])}</span>
      </div>
      {pay && spec && result.verdict !== 'pair-mismatch' && (
        <div style={{ marginTop: 14 }}>
          <div className="muted small ui">{pay.net < 0 ? t('Worker owes') : t('To pay')}</div>
          <div className="total-big" data-speak>
            {result.verdict === 'unreliable' ? <span className="muted">—</span> : <CountUp value={Math.abs(pay.net)} currency={spec.currency} />}
          </div>
          {!compact && <PayBreakdown view={pay} spec={spec} rateChange={rateChange} />}
        </div>
      )}
      {children}
    </div>
  );
}

export function PayBreakdown({ view, spec, label, rateChange }: { view: PayView; spec: CardSpec; label?: string; rateChange?: RateChange }) {
  const { t } = useApp();
  const m = (x: number) => formatMoney(x, spec.currency);
  const daysPart = spec.halves
    ? t('{0} full days + {1} half days = {2} days', view.fullDays, view.halfDays, daysText(view))
    : t('{0} days', daysText(view));
  const ratePart = rateChange && view.unitsAfter > 0
    ? ` (${view.unitsBefore / 2} × ${m(spec.rateMinor)} + ${view.unitsAfter / 2} × ${m(rateChange.rateMinor)})`
    : ` × ${m(spec.rateMinor)}`;
  const carryPart = view.carry !== 0 ? ` ${view.carry < 0 ? '−' : '+'} ${m(Math.abs(view.carry))}` : '';
  return (
    <div className="formula" style={{ marginTop: 8 }}>
      {label && <b>{label}: </b>}
      <span>{daysPart}</span>
      <span data-notranslate>
        {ratePart} = {m(view.gross)} − {view.advCount} × {m(spec.advMinor)}{carryPart} = <span className="t">{m(view.net)}</span>
      </span>
    </div>
  );
}

/** A grid view of one scanned half, Monday first, with one-sided and unsure circles highlighted. */
export function HalfView({ half, title, oneSided, overrides, onToggle }: {
  half: HalfScan; title: string; oneSided: Set<string>; overrides?: Record<string, boolean>; onToggle?: (key: string) => void;
}) {
  const { t } = useApp();
  const spec = half.decoded.spec;
  const cells = new Map(half.cells.map((c) => [c.key, c]));
  const off = firstWeekday(spec.year, spec.month);
  const dim = daysInMonth(spec.year, spec.month);
  const keysFor = (d: number) => (spec.halves ? [`d${d}a`, `d${d}b`] : [`d${d}`]);
  const isOn = (k: string) => overrides?.[k] ?? cells.get(k)?.punched ?? false;
  const isUnsure = (k: string) => !!cells.get(k)?.unsure && overrides?.[k] === undefined;
  const boxes: ReactNode[] = [];
  for (let i = 0; i < off; i++) boxes.push(<span key={'b' + i} className="cell blank" aria-hidden="true" />);
  for (let d = 1; d <= dim; d++) {
    const ks = keysFor(d);
    const unsure = ks.some(isUnsure);
    const manual = ks.some((k) => overrides?.[k] !== undefined);
    const one = ks.some((k) => oneSided.has(k));
    const dots = <span className="dots">{ks.map((k) => <span key={k} className={'dot' + (isOn(k) ? ' on' : '') + (isUnsure(k) ? ' unsure' : '')} />)}</span>;
    const cls = 'cell' + (one ? ' oneside' : '') + (manual ? ' manual' : '');
    const label = t('Day {0}', d) + ': ' + ks.map((k) => (isOn(k) ? t('punched') : t('not punched'))).join(', ') + (unsure ? ', ' + t('unsure') : '');
    if (onToggle && (unsure || manual)) {
      const key = ks.find((k) => isUnsure(k) || overrides?.[k] !== undefined) ?? ks[0];
      boxes.push(<button key={d} type="button" className={cls} aria-label={label} onClick={() => onToggle(key)}><span className="n">{d}</span>{dots}</button>);
    } else {
      boxes.push(<span key={d} className={cls} aria-label={label} role="img"><span className="n" aria-hidden="true">{d}</span>{dots}</span>);
    }
  }
  const adv = targetsFor(spec).filter((x) => x.kind === 'adv');
  return (
    <div className="panel flat">
      <div className="spread"><h3 style={{ margin: 0 }}>{title}</h3><span className="chip" data-notranslate>{spec.id}</span></div>
      <div className="halfgrid" style={{ marginTop: 10 }}>{boxes}</div>
      <div className="row small ui" style={{ marginTop: 8 }}>
        <span>{t('Advances')}</span>
        <span className="halfgrid" style={{ display: 'flex', gap: 4 }}>
          {adv.map((a) => (
            onToggle && (isUnsure(a.key) || overrides?.[a.key] !== undefined)
              ? <button key={a.key} type="button" className="btn small icon" aria-label={t('Advance {0}', a.n)} onClick={() => onToggle(a.key)}><span className={'dot' + (isOn(a.key) ? ' on' : '') + (isUnsure(a.key) ? ' unsure' : '')} /></button>
              : <span key={a.key} className={'dot' + (isOn(a.key) ? ' on' : '') + (isUnsure(a.key) ? ' unsure' : '')} style={{ outline: oneSided.has(a.key) ? '2px solid var(--amber)' : 'none', outlineOffset: 2 }} />
          ))}
        </span>
      </div>
      {half.warnings.length > 0 && <div className="note" style={{ marginTop: 10 }}>{half.warnings.map((w) => <div key={w}>{t(warningText(w))}</div>)}</div>}
    </div>
  );
}

export function ChecksList({ result }: { result: PairResult }) {
  const { t } = useApp();
  return (
    <ul className="checks">
      {result.checks.map((c) => (
        <li key={c.id}>
          <span className={c.ok === true ? 'ok' : c.ok === false ? 'no' : 'unk'} aria-hidden="true">{c.ok === true ? '✔' : c.ok === false ? '✖' : '–'}</span>
          <span>
            {t(c.label)} <span className="sr-only">{c.ok === true ? t('passed') : c.ok === false ? t('failed') : t('not decided')}</span>
            {c.detail && (
              <span className="detail" data-notranslate={c.id === 'id' || c.id === 'code' ? '' : undefined}>
                {c.detail.split(' · ').map((part, i) => <span key={i}>{i > 0 && ' · '}<span>{part}</span></span>)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------- picture pay slip ----------------

export function Sun({ half }: { half?: boolean }) {
  return (
    <svg className="sun" viewBox="0 0 40 40" aria-hidden="true">
      <g style={half ? { clipPath: 'inset(0 50% 0 0)' } : undefined}>
        {Array.from({ length: 8 }, (_, i) => <line key={i} x1="20" y1="3" x2="20" y2="9" stroke="#e0832f" strokeWidth="3" strokeLinecap="round" transform={`rotate(${i * 45} 20 20)`} />)}
        <circle cx="20" cy="20" r="9" fill="#f0a43a" stroke="#b36b00" strokeWidth="1.5" />
      </g>
      {half && <circle cx="20" cy="20" r="9" fill="none" stroke="#b36b00" strokeWidth="1" strokeDasharray="2 2" />}
    </svg>
  );
}

export function Coin() {
  return (
    <svg className="coin" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="15" fill="#c9a76b" stroke="#7a5a1e" strokeWidth="2" />
      <circle cx="20" cy="20" r="10" fill="none" stroke="#7a5a1e" strokeWidth="1" />
    </svg>
  );
}

export function NotePic({ value, currency }: { value: number; currency: string }) {
  const hue = Math.round(Math.log10(Math.max(1, value)) * 70) % 360;
  return (
    <svg viewBox="0 0 76 40" aria-hidden="true">
      <rect x="1" y="1" width="74" height="38" rx="4" fill={`hsl(${hue} 45% 78%)`} stroke={`hsl(${hue} 40% 35%)`} strokeWidth="1.5" />
      <circle cx="58" cy="20" r="11" fill="none" stroke={`hsl(${hue} 40% 35%)`} strokeWidth="1" />
      <text x="8" y="26" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="15" fill={`hsl(${hue} 40% 20%)`}>{value}</text>
      <text x="50" y="24" fontFamily="system-ui, sans-serif" fontSize="9" fill={`hsl(${hue} 40% 25%)`}>{currency}</text>
    </svg>
  );
}

export function Slip({ spec, view, disputedDays }: { spec: CardSpec; view: PayView; disputedDays: number[] }) {
  const L = slipDict(spec.lang);
  const cash = cashBreakdown(view.net, spec.currency);
  const suns: ReactNode[] = [];
  for (let i = 0; i < view.fullDays; i++) suns.push(<Sun key={'f' + i} />);
  for (let i = 0; i < view.halfDays; i++) suns.push(<Sun key={'h' + i} half />);
  return (
    <div className="slip" lang={spec.lang} data-notranslate>
      <div className="spread">
        <h3 style={{ margin: 0 }}>{L.title}</h3>
        <span>{L.month}: {MONTH_NAMES[spec.month - 1].slice(0, 3)} {spec.year}</span>
      </div>
      <p style={{ margin: '6px 0 12px' }}><b>{spec.worker}</b> · {spec.employer}</p>
      <div><b>{L.days}: {daysText(view)}</b> {spec.halves && <span>({L.fullDays} {view.fullDays}, {L.halfDays} {view.halfDays})</span>}</div>
      <div className="slip-pics" role="img" aria-label={`${L.days} ${daysText(view)}`}>{suns}</div>
      <div style={{ marginTop: 10 }}><b>{L.advances}: {view.advCount}</b> × {formatMoney(spec.advMinor, spec.currency)}</div>
      <div className="slip-pics">{Array.from({ length: view.advCount }, (_, i) => <Coin key={i} />)}</div>
      {view.carry !== 0 && <div style={{ marginTop: 10 }}><b>{L.carried}:</b> {formatMoney(view.carry, spec.currency)}</div>}
      <hr />
      <div className="spread">
        <span>{view.net < 0 ? L.owes : L.total}</span>
        <span className="total">{formatMoney(Math.abs(view.net), spec.currency)}</span>
      </div>
      {cash.notes.length > 0 && (
        <>
          <div style={{ marginTop: 8 }}><b>{L.notes}</b></div>
          <div className="notes">
            {cash.notes.map((n) => <span key={n.value} className="note-pic"><NotePic value={n.value} currency={spec.currency} /><span>× {n.count}</span></span>)}
            {cash.remainderMinor > 0 && <span className="note-pic">+ {formatMoney(cash.remainderMinor, spec.currency)}</span>}
          </div>
        </>
      )}
      <div style={{ marginTop: 10 }}>{disputedDays.length ? <span>⚠ {L.disputed}: {disputedDays.join(', ')}</span> : <span>✔ {L.noDispute}</span>}</div>
    </div>
  );
}

export function spokenResult(spec: CardSpec, view: PayView): string {
  const L = slipDict(spec.lang);
  return fill(view.net < 0 ? L.spokenOwes : L.spoken, daysText(view), formatMoney(Math.abs(view.net), spec.currency));
}

export { Money };
