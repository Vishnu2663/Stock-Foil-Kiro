import { useEffect, useRef, useState } from 'react';
import { ROUTES, TABS, routeDef, type RouteId } from '../routes';
import { Icon } from './Icon';

const SHEET = ROUTES.filter((r) => !TABS.includes(r.id));

export function TabBar({ route }: { route: RouteId }) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); moreBtn.current?.focus(); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  const inMore = !TABS.includes(route);
  return (
    <>
      <nav className="tabbar phone-only" aria-label="Tabs">
        {TABS.map((id) => {
          const r = routeDef(id);
          return (
            <a key={id} href={`#/${id}`} className={(id === route ? 'active' : '') + (id === 'scan' ? ' tab-scan' : '')} aria-current={id === route ? 'page' : undefined}>
              <Icon name={r.icon} />
              <span>{r.title}</span>
            </a>
          );
        })}
        <button ref={moreBtn} className={inMore ? 'active' : ''} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>
      {open && (
        <>
          <button className="backdrop" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="More" ref={sheet}>
            <div className="grab" aria-hidden="true" />
            {SHEET.map((r) => (
              <a key={r.id} href={`#/${r.id}`} className={r.id === route ? 'active' : ''} onClick={() => setOpen(false)}>
                <span className="tile"><Icon name={r.icon} /></span>
                <span><b>{r.title}</b>{r.hint && <small>{r.hint}</small>}</span>
                <Icon name="chevron" className="chev" />
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
