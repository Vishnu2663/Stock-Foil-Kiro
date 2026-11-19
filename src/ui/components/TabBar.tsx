import { useCallback, useEffect, useRef, useState } from 'react';
import { ROUTES, TABS, routeDef, type RouteId } from '../routes';
import { Icon } from './Icon';
import { Sheet } from './Popover';
import { useApp } from '../ctx';

const SHEET = ROUTES.filter((r) => !TABS.includes(r.id));

/** Phone tab bar: Home · New card · [PAYDAY SCAN] · Members · More. The scan tab is the big red one. */
export function TabBar({ route }: { route: RouteId }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [route]);
  const close = useCallback((refocus?: boolean) => { setOpen(false); if (refocus) moreBtn.current?.focus(); }, []);
  const inMore = !TABS.includes(route);
  return (
    <>
      <nav className="tabbar phone-only" aria-label="Tabs">
        {TABS.map((id) => {
          const r = routeDef(id);
          const scan = id === 'scan';
          return (
            <a
              key={id}
              href={`#/${id}`}
              className={(id === route ? 'active' : '') + (scan ? ' tab-scan' : '')}
              aria-current={id === route ? 'page' : undefined}
              onClick={scan ? () => { try { navigator.vibrate?.(10); } catch { /* not supported */ } } : undefined}
            >
              {scan
                ? <span className="scan-btn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="8" y="8" width="3" height="3" /><rect x="13" y="8" width="3" height="3" /><rect x="8" y="13" width="3" height="3" /><path d="M13 13h3v3M3 12h18" className="beam" /></svg></span>
                : <Icon name={r.icon} />}
              <span>{t(r.title)}</span>
            </a>
          );
        })}
        <button ref={moreBtn} className={inMore ? 'active' : ''} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <Icon name="more" />
          <span>{t('More')}</span>
        </button>
      </nav>
      <Sheet open={open} onClose={close} label={t('More')} className="more-sheet">
        <div className="more-grid">
          {SHEET.map((r) => (
            <a key={r.id} href={`#/${r.id}`} className={'more-tile' + (r.id === route ? ' active' : '')} onClick={() => setOpen(false)}>
              <span className="tile"><Icon name={r.icon} /></span>
              <b>{t(r.title)}</b>
              {r.hint && <small>{t(r.hint)}</small>}
            </a>
          ))}
        </div>
      </Sheet>
    </>
  );
}
