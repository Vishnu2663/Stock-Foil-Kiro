// The one dropdown for every choice (currency, language, provider…): a button plus a listbox in the shared
// Popover (desktop) or bottom Sheet (phone). Searchable when there are more than 8 options. The listbox uses
// aria-activedescendant, so focus stays on the button or the search box while arrows move the highlight.
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Popover, Sheet, useIsPhone } from './Popover';
import { Icon } from './Icon';

export interface SelectOption { value: string; label: string; hint?: string }

/** Filter by a search string, ignoring case and accents. */
export function filterOptions(options: SelectOption[], q: string): SelectOption[] {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const n = norm(q.trim());
  return n ? options.filter((o) => norm(o.label).includes(n) || norm(o.value).includes(n) || (o.hint ? norm(o.hint).includes(n) : false)) : options;
}

export function Select({ value, options, onChange, label, className = '', disabled }: {
  value: string; options: (SelectOption | string)[]; onChange: (v: string) => void; label: string; className?: string; disabled?: boolean;
}) {
  const opts = useMemo(() => options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)), [options]);
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const uid = useId().replace(/:/g, '');
  const searchable = opts.length > 8;
  const shown = filterOptions(opts, q);
  const cur = opts.find((o) => o.value === value);
  const show = () => { setQ(''); setAct(Math.max(0, opts.findIndex((o) => o.value === value))); setOpen(true); };
  const close = (refocus?: boolean) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const pick = (v: string) => { onChange(v); close(true); };
  const scrollTo = (i: number) => requestAnimationFrame(() => document.getElementById(`${uid}-${i}`)?.scrollIntoView({ block: 'nearest' }));
  const keys = (e: KeyboardEvent) => {
    const n = shown.length;
    const go = (i: number) => { const k = n ? ((i % n) + n) % n : 0; setAct(k); scrollTo(k); e.preventDefault(); };
    if (e.key === 'ArrowDown') go(act + 1);
    else if (e.key === 'ArrowUp') go(act - 1);
    else if (e.key === 'Home' && !searchable) go(0);
    else if (e.key === 'End' && !searchable) go(n - 1);
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[act]) pick(shown[act].value); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close();
    else if (!searchable && e.key.length === 1) {
      const c = e.key.toLowerCase();
      const order = [...shown.keys()].map((i) => (act + 1 + i) % n);
      const hit = order.find((i) => shown[i].label.toLowerCase().startsWith(c));
      if (hit !== undefined) go(hit);
    }
  };
  const activeId = shown[act] ? `${uid}-${act}` : undefined;
  const head = searchable ? (
    <div className="sel-search">
      <input
        autoFocus
        className="input"
        value={q}
        placeholder={label}
        aria-label={label}
        role="combobox"
        aria-expanded="true"
        aria-controls={uid}
        aria-activedescendant={activeId}
        onChange={(e) => { setQ(e.target.value); setAct(0); }}
        onKeyDown={keys}
      />
    </div>
  ) : null;
  const items = shown.length ? shown.map((o, i) => (
    <div
      key={o.value}
      id={`${uid}-${i}`}
      role="option"
      aria-selected={o.value === value}
      className={'sel-opt' + (i === act ? ' act' : '') + (o.value === value ? ' active' : '')}
      onPointerEnter={() => setAct(i)}
      onClick={() => pick(o.value)}
    >
      <span><b>{o.label}</b>{o.hint && <small>{o.hint}</small>}</span>
      {o.value === value && <Icon name="check" className="chev" />}
    </div>
  )) : <div className="sel-empty muted small">—</div>;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={'select-btn input ' + className}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label + (cur ? ': ' + cur.label : '')}
        aria-controls={open ? uid : undefined}
        aria-activedescendant={open && !searchable ? activeId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); show(); return; }
          if (open) keys(e);
        }}
      >
        <span className="sel-val">{cur?.label ?? value}</span>
        <Icon name="down" className="caret" />
      </button>
      {phone
        ? <Sheet open={open} onClose={close} label={label} head={<><div className="sheet-title">{label}</div>{head}</>} onKeyDown={searchable ? () => undefined : keys} className="sel-sheet"><div id={uid} role="listbox" aria-label={label} aria-activedescendant={searchable ? undefined : activeId} tabIndex={searchable ? undefined : 0}>{items}</div></Sheet>
        : <Popover open={open} onClose={close} anchor={btn} label={label} role="listbox" id={uid} head={head} onKeyDown={searchable ? () => undefined : keys} className="sel-pop" width={Math.max(220, btn.current?.offsetWidth ?? 0)}>{items}</Popover>}
    </>
  );
}
