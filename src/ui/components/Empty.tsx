// Empty state: a small punch-card drawing, one line of text and one action.
import type { ReactNode } from 'react';

export function Empty({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel empty-state">
      <svg className="empty-art" viewBox="0 0 120 80" aria-hidden="true">
        <path d="M8 8h104v44q-9 7-18 0t-18 0-18 0-18 0-18 0-14 0z" className="ea-paper" />
        <path d="M8 60q9 -7 18 0t18 0 18 0 18 0 18 0 14 0v12H8z" className="ea-paper lo" />
        {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={22 + i * 15} cy={24} r={4.2} className={i === 1 || i === 4 ? 'ea-hole' : 'ea-ring'} />)}
        {[0, 1, 2, 3, 4, 5].map((i) => <circle key={'b' + i} cx={22 + i * 15} cy={38} r={4.2} className="ea-ring" />)}
        <rect x="92" y="12" width="14" height="14" className="ea-qr" />
      </svg>
      <div>
        {title && <h2>{title}</h2>}
        <p className="ui">{children}</p>
        {action}
      </div>
    </div>
  );
}
