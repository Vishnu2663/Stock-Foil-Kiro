import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ROUTES, type RouteId } from '../routes';
import { Icon } from './Icon';
import { Brand } from './Brand';
import { Popover } from './Popover';

const MAIN = ROUTES.filter((r) => r.group === 'main');
const RECORDS = ROUTES.filter((r) => r.group === 'records');
const MORE = ROUTES.filter((r) => r.group === 'more');

function Menu({ id, label, items, route, open, setOpen }: {
  id: string; label: string; items: typeof ROUTES; route: RouteId; open: boolean; setOpen: (v: string | null) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const active = items.some((i) => i.id === route);
  const focusItem = (last: boolean) => requestAnimationFrame(() => {
    const links = document.querySelectorAll<HTMLAnchorElement>(`#menu-${id} [role="menuitem"]`);
    links[last ? links.length - 1 : 0]?.focus();
  });
  const onKeyBtn = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(id); focusItem(false); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(id); focusItem(true); }
  };
  const close = useCallback(() => setOpen(null), [setOpen]);
  return (
    <div className="menu-wrap" data-nav={id}>
      <button
        ref={btn}
        className={'nav-item' + (active ? ' active' : '')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`menu-${id}`}
        onClick={() => setOpen(open ? null : id)}
        onKeyDown={onKeyBtn}
      >
        <Icon name={id === 'records' ? 'clock' : 'more'} className="ico" />
        <span>{label}</span>
        <Icon name="down" className="caret" />
      </button>
      <Popover open={open} onClose={close} anchor={btn} label={label} id={`menu-${id}`} className="nav-pop">
        {items.map((r, i) => (
          <a key={r.id} role="menuitem" href={`#/${r.id}`} className={r.id === route ? 'active' : ''} style={{ ['--i' as string]: i }} onClick={close} onKeyDown={(e) => { if (e.key === 'Tab') close(); }}>
            <span className="tile"><Icon name={r.icon} /></span>
            <span><b>{r.title}</b><small>{r.hint}</small></span>
            <Icon name="chevron" className="chev" />
          </a>
        ))}
      </Popover>
    </div>
  );
}

export function Header({ route }: { route: RouteId }) {
  const [open, setOpen] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  const movePill = useCallback((el: Element | null) => {
    const p = pill.current, n = nav.current;
    if (!p || !n) return;
    if (!el) { p.style.opacity = '0'; return; }
    const target = el.matches('.nav-item') ? el : el.querySelector('.nav-item');
    if (!target) return;
    const a = (target as HTMLElement).getBoundingClientRect();
    const b = n.getBoundingClientRect();
    p.style.setProperty('--x', `${a.left - b.left}px`);
    p.style.setProperty('--w', `${a.width}px`);
    p.style.opacity = target.classList.contains('scan') ? '0' : '1';
  }, []);

  const activeEl = useCallback(() => nav.current?.querySelector('.nav-item.active') ?? null, []);

  useLayoutEffect(() => { movePill(activeEl()); }, [route, movePill, activeEl]);
  useEffect(() => {
    // Fonts change label widths: re-measure once they are ready and after the splash lands.
    const again = () => movePill(activeEl());
    document.fonts?.ready.then(again).catch(() => undefined);
    const t1 = setTimeout(again, 400);
    const t2 = setTimeout(again, 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [route, movePill, activeEl]);
  useEffect(() => {
    const n = nav.current;
    if (!n) return;
    const ro = new ResizeObserver(() => movePill(activeEl()));
    ro.observe(n);
    return () => ro.disconnect();
  }, [movePill, activeEl]);
  useEffect(() => setOpen(null), [route]);

  return (
    <header className="header">
      <div className="header-row">
        <Brand />
        <span className="divider desk-only" aria-hidden="true" />
        <nav
          className="nav desk-only"
          ref={nav}
          aria-label="Main"
          onPointerOver={(e) => { const it = (e.target as Element).closest('.nav-item'); if (it) movePill(it); }}
          onPointerLeave={() => movePill(activeEl())}
        >
          <span className="pill" ref={pill} aria-hidden="true" />
          {MAIN.map((r) => (
            <a
              key={r.id}
              href={`#/${r.id}`}
              className={'nav-item' + (r.id === route ? ' active' : '') + (r.id === 'scan' ? ' scan' : '') + (r.id === 'story' ? ' story' : '')}
              aria-current={r.id === route ? 'page' : undefined}
            >
              <Icon name={r.icon} className="ico" />
              <span>{r.title}</span>
            </a>
          ))}
          <Menu id="records" label="Records" items={RECORDS} route={route} open={open === 'records'} setOpen={setOpen} />
          <Menu id="more" label="More" items={MORE} route={route} open={open === 'more'} setOpen={setOpen} />
        </nav>
        <a className="settings-btn desk-only" href="#/settings" aria-current={route === 'settings' ? 'page' : undefined}>
          <Icon name="gear" /> <span>Settings</span>
        </a>
        <div className="phone-actions phone-only">
          <a className="gear-btn" href="#/settings" aria-label="Settings"><Icon name="gear" /></a>
        </div>
      </div>
    </header>
  );
}
