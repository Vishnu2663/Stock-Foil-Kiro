// "Mark as paid": hand over the notes, the worker presses an inked thumb in the RECEIVED box on both halves,
// then both halves are shown to the camera. Fallbacks: a signature instead, or paying without a mark (with a
// reason). Closing changes nothing.
import { useState } from 'react';
import { Sheet } from './Popover';
import { NoteStacks } from './Banknote';
import { Select } from './Select';
import type { CashBreakdown } from '../../core/cash';
import type { NoMarkReason } from '../../core/received';
import { useApp } from '../ctx';

/** A stylised violet thumbprint (drawn, never a photo). */
export function ThumbArt({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={'thumb-art ' + className} width={size} height={size * 1.25} viewBox="0 0 40 50" aria-hidden="true">
      <ellipse cx="20" cy="25" rx="16" ry="21" className="ta-ink" />
      {[3, 6, 9, 12, 15].map((r) => <path key={r} d={`M${20 - r} ${30} Q${20 - r} ${30 - r * 1.5} 20 ${30 - r * 1.6} Q${20 + r} ${30 - r * 1.5} ${20 + r} ${30}`} className="ta-ridge" />)}
      {[4, 8, 12].map((r) => <path key={'b' + r} d={`M${20 - r} ${33} Q20 ${38 + r * 0.6} ${20 + r} ${33}`} className="ta-ridge" />)}
    </svg>
  );
}

export function PaySteps({ open, onClose, amountText, cash, currency, worker, hasBox, onScan, onSignature, onNoMark }: {
  open: boolean; onClose: () => void; amountText: string; cash: CashBreakdown | null; currency: string; worker: string; hasBox: boolean;
  onScan: () => void; onSignature: () => void; onNoMark: (reason: NoMarkReason) => void;
}) {
  const { t } = useApp();
  const [skip, setSkip] = useState(false);
  const [reason, setReason] = useState<NoMarkReason>('no-ink');
  return (
    <Sheet open={open} onClose={() => { setSkip(false); onClose(); }} label={t('Mark as paid')} className="pay-steps" dialogFrom={768}>
      <h2 className="sheet-title">{t('Mark as paid')}</h2>
      <ol className="ps-steps">
        <li><span className="ps-n">1</span><div><b>{t('Hand over {0}', amountText)}</b>{cash && cash.notes.length > 0 && <NoteStacks cash={cash} currency={currency} compact dealKey={'ps' + amountText} />}</div></li>
        <li><span className="ps-n">2</span><div><b>{hasBox ? t('{0} presses his inked thumb in the RECEIVED box on BOTH halves', worker) : t('This card has no RECEIVED box. Pay without a mark, or ask for a signature.')}</b>{hasBox && <span className="ps-thumb" aria-hidden="true"><span className="ps-box-label">RECEIVED</span><ThumbArt size={48} className="roll" /></span>}</div></li>
        <li><span className="ps-n">3</span><div><b>{t('Show both halves to the camera')}</b>
          {hasBox && <div className="row"><button className="btn primary" onClick={onScan}>📷 {t('Open camera')}</button></div>}
        </div></li>
      </ol>
      <div className="ps-alt">
        {hasBox && <button className="btn small" onClick={onSignature}>✍ {t('Use a signature instead')}</button>}
        {!skip
          ? <button className="btn small ghost warn-text" onClick={() => setSkip(true)}>{t('Pay without a received mark')}</button>
          : (
            <div className="ps-skip">
              <Select label={t('Why?')} value={reason} onChange={(v) => setReason(v as NoMarkReason)} options={[
                { value: 'no-ink', label: t('No ink pad') }, { value: 'absent', label: t('Worker absent') }, { value: 'other', label: t('Other') },
              ]} />
              <button className="btn small warn" onClick={() => onNoMark(reason)}>{t('Record payment without a mark')}</button>
            </div>
          )}
      </div>
    </Sheet>
  );
}
