import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { rollValue } from '../celebrate';
import { MONTH_NAMES, formatMoney } from '../../core/card';

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />
      <span>
        {label}
        {hint && <span className="muted small" style={{ display: 'block' }}>{hint}</span>}
      </span>
    </label>
  );
}

/** A switch inside a bordered card with a title, an optional green badge and a description. */
export function OptionCard({ checked, onChange, title, badge, text }: { checked: boolean; onChange: (v: boolean) => void; title: string; badge?: string; text: string }) {
  return (
    <label className={'option' + (checked ? ' on' : '')}>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />
      <span>
        <b>{title}</b>{badge && <> <span className="chip badge-green">{badge}</span></>}
        <p>{text}</p>
      </span>
    </label>
  );
}

export function SectionHead({ n, title }: { n: number; title: string }) {
  return <div className="section-head"><span className="num-dot" aria-hidden="true">{n}</span><h3>{title}</h3></div>;
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** A custom month picker (not the native one). */
export function MonthPicker({ year, month, onChange, label = 'Month' }: { year: number; month: number; onChange: (y: number, m: number) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [y, setY] = useState(year);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => setY(year), [year]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="monthpick field" ref={ref}>
      <span id={id + 'l'} style={{ fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 600 }}>{label}</span>
      <button type="button" className="btn" style={{ justifyContent: 'space-between', borderRadius: 10, width: '100%' }} aria-haspopup="dialog" aria-expanded={open} aria-labelledby={id + 'l'} onClick={() => setOpen(!open)}>
        <span className="nowrap">{MONTH_NAMES[month - 1]} {year}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="pop" role="dialog" aria-label="Choose a month">
          <div className="spread">
            <button type="button" className="btn small icon" aria-label="Previous year" onClick={() => setY(y - 1)}>‹</button>
            <b className="ui" data-notranslate>{y}</b>
            <button type="button" className="btn small icon" aria-label="Next year" onClick={() => setY(y + 1)}>›</button>
          </div>
          <div className="months" role="listbox" aria-label="Months">
            {MONTH_NAMES.map((n, i) => (
              <button type="button" key={n} role="option" aria-selected={y === year && i + 1 === month} onClick={() => { onChange(y, i + 1); setOpen(false); }}>
                {n.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Money({ minor, currency }: { minor: number; currency: string }) {
  return <span className="nowrap" data-notranslate>{formatMoney(minor, currency)}</span>;
}

/** Counts up once the total scrolls into view (whole units while rolling, the exact value at the end). */
export function CountUp({ value, currency, duration = 900 }: { value: number; currency: string; duration?: number }) {
  const [v, setV] = useState(value);
  const host = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (document.body.classList.contains('reduced')) { setV(value); return; }
    if (!seen) { setV(0); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setV(rollValue(value, k)); // whole rupees while rolling, the exact amount at the end
      void e;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, seen]);
  return <span ref={host}><Money minor={v} currency={currency} /></span>;
}
