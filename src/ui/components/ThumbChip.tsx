// The received-mark icon for payment rows: green = the worker's mark on both halves, amber = paid without one.
import { paidWithMark, type PaidMark } from '../../core/received';
import { useApp } from '../ctx';

export function ThumbChip({ rec }: { rec?: { receipt?: PaidMark['receipt']; noMark?: PaidMark['noMark'] } | null }) {
  const { t } = useApp();
  if (!rec) return null;
  const ok = paidWithMark(rec);
  const label = ok ? t('Received mark on both halves') : t('Paid without received mark');
  return (
    <span className={'thumb-chip ' + (ok ? 'good' : 'warn')} title={label} aria-label={label} role="img">
      <svg viewBox="0 0 20 24" aria-hidden="true"><ellipse cx="10" cy="12" rx="8" ry="10.5" /><path d="M5 15q0-8 5-8t5 8M7.5 15.5q0-5 2.5-5t2.5 5" /></svg>
    </span>
  );
}
