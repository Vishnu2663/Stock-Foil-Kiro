// The pay slip as a retro wage packet receipt: perforated edges, typewriter numbers with dotted leaders,
// the month in miniature with the worked days punched, amount in words, the notes, stamps and signatures.
// It prints on its own (Print slip) in black and white, with every line visible.
import { useEffect, useRef, useState } from 'react';
import type { CardSpec } from '../../core/card';
import { daysInMonth, firstWeekday } from '../../core/layout';
import type { PayView, WageSchedule } from '../../core/wages';
import { amountInWords } from '../../core/words';
import type { PaydayModel } from '../payday';
import type { Level } from '../celebrate';
import { createScope, motionEnv, printerBuzz } from '../anim';
import { NoteStacks } from './Banknote';
import { Avatar, partyText } from './Party';
import { Typer } from './Motion';
import { useApp } from '../ctx';
import { ThumbArt } from './PaySteps';
import type { PaidMark } from '../../core/received';

/** Decorative bars made from the card id (not a real barcode). */
function bars(id: string): number[] {
  const out: number[] = [];
  for (const ch of id) { const c = ch.charCodeAt(0); out.push(1 + (c % 3), 1 + ((c >> 2) % 2), 2 + ((c >> 3) % 2)); }
  return out;
}

export interface PaySlipProps {
  spec: CardSpec; view: PayView; model: PaydayModel; wage: WageSchedule; level: Level;
  disputed: boolean; paidAt?: string; dealKey: string;
  /** the worker's received mark recorded with the payment */
  received?: PaidMark['receipt'];
}

export function PaySlip({ spec, view, model, wage, level, disputed, paidAt, dealKey, received }: PaySlipProps) {
  const { t, settings } = useApp();
  const instant = motionEnv().reduced;
  const monthTxt = new Intl.DateTimeFormat(spec.lang || 'en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(spec.year, spec.month - 1, 1))).toUpperCase();
  const words = amountInWords(Math.max(0, model.net), spec.currency, spec.lang || 'en');
  const w = partyText('worker', spec.worker, t), e = partyText('employer', spec.employer, t);
  const off = firstWeekday(spec.year, spec.month), dim = daysInMonth(spec.year, spec.month);
  const worked = new Set(view.dayList);
  const status = disputed ? { text: t('DISPUTED'), tone: 'bad' } : level === 'full' ? { text: t('BOTH HALVES AGREE'), tone: 'good' } : level === 'match' ? { text: t('HOLES MATCH · CUT NOT CHECKED'), tone: 'warn' } : level === 'bad' ? { text: t('HALVES DO NOT MATCH'), tone: 'bad' } : { text: t('CHECK BY EYE'), tone: 'warn' };
  // PAID stamp slams when the payment is recorded while the slip is on screen
  const wasPaid = useRef(!!paidAt);
  const [slam, setSlam] = useState(false);
  useEffect(() => {
    if (paidAt && !wasPaid.current && !instant) setSlam(true);
    wasPaid.current = !!paidAt;
  }, [paidAt, instant]);
  useEffect(() => { const sc = createScope(); if (!instant) sc.timeout(() => printerBuzz(sc, settings.sounds), 1150); return () => sc.dispose(); }, [dealKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = bars(spec.id);
  let bx = 0;
  return (
    <div className={'wage-packet' + (instant ? ' still' : '')} lang={spec.lang}>
      <div className="wp-head">
        <div>
          <div className="wp-title">{t('PAY SLIP')} · <span data-notranslate>{monthTxt}</span></div>
          <div className="wp-no" data-notranslate>№ {spec.id}</div>
        </div>
        <svg className="wp-bars" viewBox={`0 0 ${b.reduce((s, x) => s + x + 1, 0)} 20`} preserveAspectRatio="none" aria-hidden="true">
          {b.map((x, i) => { const r = <rect key={i} x={bx} y="0" width={x} height="20" />; bx += x + 1; return i % 2 ? null : r; })}
        </svg>
      </div>
      <div className="wp-parties">
        <div className="wp-party"><Avatar role="worker" name={spec.worker} size={34} /><span><small>{t('PAY TO')}</small><b data-notranslate>{w.name}</b> <i>({t('worker')})</i></span></div>
        <div className="wp-party"><Avatar role="employer" name={spec.employer} size={34} /><span><small>{t('FROM')}</small><b data-notranslate>{e.name}</b> <i>({t('employer')})</i></span></div>
      </div>
      <div className="wp-days">
        <div className="wp-mini" aria-hidden="true">
          {Array.from({ length: off }, (_, i) => <span key={'b' + i} className="m blank" />)}
          {Array.from({ length: dim }, (_, i) => <span key={i} className={'m' + (worked.has(i + 1) ? ' on' : '')}>{i + 1}</span>)}
        </div>
        <div className="wp-dcount"><b className="mono">{view.days % 1 ? `${Math.floor(view.days)}½` : view.days}</b><span>{t('days')}</span></div>
      </div>
      <div className="wp-lines">
        {model.lines.map((l, i) => (
          <div key={l.label + l.kind} className={'wp-line ' + l.kind} style={{ ['--i' as string]: i }}>
            <span className="wl-l">{l.kind === 'adv' && <span className="wl-stub" aria-hidden="true" />}{l.label}</span>
            <span className="wl-q mono">{instant ? l.qty : <Typer key={l.qty} text={l.qty} every={20} />}</span>
            <span className="wl-dots" aria-hidden="true" />
            <span className="wl-a mono">{instant ? l.amount : <Typer key={l.amount} text={l.amount} every={20} />}</span>
          </div>
        ))}
        <div className="wp-total">
          <span>{model.owes ? t('WORKER OWES') : t('TO PAY')}</span>
          <span className="mono" key={model.amountText}>{model.amountText}</span>
        </div>
        {words && <div className="wp-words">{words}</div>}
      </div>
      {!model.owes && <NoteStacks cash={model.cash} currency={spec.currency} compact dealKey={dealKey} />}
      {model.checkSum && <div className="wp-sum mono" data-notranslate>{model.checkSum}</div>}
      <div className="wp-stamps">
        <span className={'wp-stamp ' + status.tone}>{status.text}</span>
        {wage.adjusted && <span className="wp-stamp warn small">{t('WAGE ADJUSTED')}</span>}
        {paidAt && <span className={'wp-stamp paid' + (slam ? ' slam' : '')}>{t('PAID')}</span>}
      </div>
      <div className="wp-sign">
        <div className="wp-received">
          <span className="wp-rbox">{received && received.stock !== 'none' && received.foil !== 'none' && <ThumbArt size={30} className="on-slip" />}</span>
          <span><small>{t('RECEIVED BY')}</small><b data-notranslate>{w.name}</b> <i>({t('worker')})</i>
            {received && <em className="wp-rnote">{(received.signature || received.stock === 'signature') ? t('signature on both halves, checked {0}', new Date(received.checkedAt).toLocaleDateString(spec.lang || undefined)) : t('thumb mark on both halves, checked {0}', new Date(received.checkedAt).toLocaleDateString(spec.lang || undefined))}</em>}
          </span>
        </div>
        <div><span className="ln" />{t('Paid by {0}', e.owner)} ✍</div>
        <div className="paid-on">{t('Paid on')} <span className="ln short">{paidAt ? new Date(paidAt).toLocaleDateString(spec.lang || undefined) : ''}</span></div>
      </div>
    </div>
  );
}
