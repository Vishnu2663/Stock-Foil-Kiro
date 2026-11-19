import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useApp } from '../ctx';
import { Camera } from '../components/Camera';
import { PayBreakdown, spokenResult } from '../components/Result';
import { ResultHero, TallyPair, CheckTimeline, SlipPrint, WarningBanner, Section } from '../components/ResultView';
import { celebrationLevel, resultKey } from '../celebrate';
import { flushSync } from 'react-dom';
import type { CameraMode } from '../components/Camera';
import { Icon } from '../components/Icon';
import { fileToImage, printHTML } from '../imageIO';
import { scanImages } from '../scanAsync';
import { verifyPair, pickHalves, type PairResult } from '../../vision/pair';
import type { HalfScan } from '../../vision/detect';
import { disputedDays, wageScheduleFor, defaultWageSource, applyChanges, sameSchedule, type RateChange, type WageSchedule, type WageSource } from '../../core/wages';
import { memberForCard, wagesOf } from '../../core/members';
import { paydayModel } from '../payday';
import { PaySlip } from '../components/PaySlip';
import { addReceipt, loadLedger, loadCrew, saveCrew, loadMembers, loadCards } from '../../store/index';
import { paidInfo } from '../../core/settlement';
import { monthKey, parseMajor, clampAmount, formatMoney, type CardSpec } from '../../core/card';
import type { ReceiptData } from '../../core/history';
import { speak, stopSpeaking } from '../../ai/speech';
import { explain, type PayFacts } from '../../ai/index';
import { langInfo } from '../../i18n/index';

export function factsOf(result: PairResult, rateChange?: RateChange, wage?: WageSchedule): PayFacts | null {
  const v = result.pay?.agreed;
  const spec = result.spec;
  if (!v || !spec || !result.comparison || !result.pay) return null;
  const dd = disputedDays(result.comparison);
  return {
    verdict: result.verdict, currency: spec.currency, fullDays: v.fullDays, halfDays: v.halfDays, days: v.days,
    rateMinor: spec.rateMinor, advCount: v.advCount, advMinor: spec.advMinor, carryMinor: v.carry, netMinor: v.net,
    disputedMinor: result.pay.disputed, stockOnlyDays: dd.stock, foilOnlyDays: dd.foil, rateChange,
    ...(wage ? { advMinor: wage.advMinor, rateMinor: wage.ranges[0].rateMinor, ranges: v.lines.map((l) => ({ fromDay: l.fromDay, toDay: l.toDay, rateMinor: l.rateMinor, days: l.days })) } : {}),
  };
}

export function receiptOf(result: PairResult, rateChange?: RateChange, wage?: WageSchedule): ReceiptData | null {
  const spec = result.spec, v = result.pay?.agreed, cmp = result.comparison;
  if (!spec || !v || !cmp || !result.pay) return null;
  const days = (s: Set<string>) => [...new Set([...s].filter((k) => k[0] === 'd').map((k) => Number(/\d+/.exec(k)![0])))].sort((a, b) => a - b);
  const r: ReceiptData = {
    at: new Date().toISOString(), cardId: spec.id, month: monthKey(spec.year, spec.month), worker: spec.worker, employer: spec.employer,
    verdict: result.verdict, agreedDays: days(cmp.agreed), stockOnlyDays: days(cmp.stockOnly), foilOnlyDays: days(cmp.foilOnly),
    agreedAdv: v.advCount, netMinor: v.net, disputedMinor: result.pay.disputed, currency: spec.currency,
  };
  if (rateChange) r.rateChange = rateChange;
  if (wage?.adjusted) r.wage = { source: wage.source, ranges: wage.ranges, advMinor: wage.advMinor };
  if (spec.halves) r.halfUnits = v.halfUnits;
  return r;
}

export default function Scan() {
  const { t, toast, settings, startCard } = useApp();
  const [halves, setHalves] = useState<HalfScan[]>([]);
  const [camera, setCamera] = useState(false);
  const [camMode, setCamMode] = useState<CameraMode>('halves');
  const resultRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [overrides, setOverrides] = useState<{ S: Record<string, boolean>; F: Record<string, boolean> }>({ S: {}, F: {} });
  const [wageSrc, setWageSrc] = useState<WageSource | null>(null);
  const [custom, setCustom] = useState<{ ranges: { fromDay: number; toDay: number; rateMinor: number }[]; advMinor: number } | null>(null);
  const [fromDay, setFromDay] = useState('16');
  const [newWage, setNewWage] = useState('');
  const [explainText, setExplainText] = useState<{ text: string; note?: string } | null>(null);
  const [savedKey, setSavedKey] = useState('');
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const slipRef = useRef<HTMLDivElement>(null);

  const { stock, foil } = useMemo(() => pickHalves(halves), [halves]);
  const have = { S: !!stock, F: !!foil };

  const rateChange = undefined as RateChange | undefined;
  // The member behind this card (by the issued card's memberId, then by name) and their wage history.
  const spec0 = stock?.decoded.spec ?? foil?.decoded.spec;
  const member = useMemo(() => (spec0 ? memberForCard(loadMembers(), loadCards(), spec0) : undefined), [spec0?.id, spec0?.worker, spec0?.employer]); // eslint-disable-line react-hooks/exhaustive-deps
  const history = member ? wagesOf(member) : undefined;
  const wageDefault: WageSource = spec0 ? defaultWageSource(spec0, history) : 'card';
  const source: WageSource = wageSrc ?? wageDefault;
  const wage: WageSchedule | null = useMemo(() => (spec0 ? wageScheduleFor(spec0, history, source, custom ?? undefined) : null), [spec0, history, source, custom]);
  const currentDiffers = useMemo(() => {
    if (!spec0) return false;
    const c = wageScheduleFor(spec0, history, 'current');
    return !sameSchedule(c.ranges, wageScheduleFor(spec0, history, 'card').ranges) || c.advMinor !== spec0.advMinor;
  }, [spec0, history]);

  const result = useMemo(() => (stock && foil ? verifyPair(stock, foil, { alignTolMm: settings.calibration.alignTolMm, overrides, wage: wage ?? undefined }) : null), [stock, foil, overrides, wage, settings.calibration.alignTolMm]);
  const canSave = !!result && result.verdict !== 'unreliable' && result.verdict !== 'pair-mismatch';
  const spec: CardSpec | null = result?.spec ?? null;
  const model = useMemo(() => (result?.pay && spec && wage ? paydayModel(result.pay.agreed, spec, wage, t, settings.notesOff?.[spec.currency] ?? []) : null), [result, spec, wage, t, settings.notesOff]);
  const paid = useMemo(() => (spec && result?.pay ? paidInfo(loadLedger(), spec.id, result.pay.agreed.net) : null), [spec, result, ledgerVersion]);

  const addHalf = useCallback((h: HalfScan) => {
    setHalves((list) => {
      const rest = list.filter((x) => !(x.decoded.role === h.decoded.role));
      return [...rest, h];
    });
  }, []);

  const closeCamera = useCallback(() => {
    const go = () => flushSync(() => setCamera(false));
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (d.startViewTransition && !document.body.classList.contains('reduced')) d.startViewTransition(go);
    else go();
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: document.body.classList.contains('reduced') ? 'auto' : 'smooth', block: 'start' }));
  }, []);
  const openJoin = useCallback(() => { setCamMode('join'); setCamera(true); window.scrollTo({ top: 0 }); }, []);

  // Save the scan to the ledger once per result (never for an unreliable photo).
  const saveScan = useCallback((force = false) => {
    if (!result || !canSave) return false;
    const r = receiptOf(result, rateChange, wage ?? undefined);
    if (!r) return false;
    const key = JSON.stringify({ ...r, at: '' });
    if (!force && key === savedKey) return true;
    addReceipt(r);
    setSavedKey(key);
    setLedgerVersion((v) => v + 1);
    return true;
  }, [result, canSave, rateChange, savedKey, wage]);

  useEffect(() => {
    if (result && canSave && !savedKey) saveScan();
  }, [result, canSave, savedKey, saveScan]);

  useEffect(() => {
    if (result && settings.simple && spec && result.pay && canSave) {
      speak((model?.listen ?? '') + ' ' + spokenResult(spec, result.pay.agreed), { lang: langInfo(spec.lang).speech, rate: settings.speakRate });
    }
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.verdict, spec?.id]);

  const readFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!list.length) return;
    setBusy(true);
    try {
      const imgs = await Promise.all(list.map((f) => fileToImage(f, 1600)));
      const res = await scanImages(imgs, { calibration: settings.calibration });
      let found = 0;
      const roles = new Set<string>();
      res.forEach((r, i) => {
        r.halves.forEach((h) => { addHalf(h); found++; roles.add(h.decoded.role); });
        if (r.foreign.length) toast(t('Photo {0}: that QR code is not a Stock & Foil card.', i + 1), 'warn');
        else if (r.invalid.length) toast(t('Photo {0}: the card code is damaged or edited.', i + 1), 'bad');
        else if (!r.halves.length) toast(t('Photo {0}: no card found. Show the whole half on a dark surface.', i + 1), 'warn');
      });
      if (found) {
        const nowS = have.S || roles.has('S'), nowF = have.F || roles.has('F');
        toast(nowS && nowF ? t('Both halves read. Checking the pair…')
          : nowS ? t('Worker half scanned. Next: add the employer half (foil).')
          : t('Employer half scanned. Next: add the worker half (stock).'), 'good');
      }
    } catch (e) {
      toast(t('Could not read the photo: {0}', (e as Error).message), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files?.length) readFiles(e.dataTransfer.files); };

  const reset = () => {
    setHalves([]); setOverrides({ S: {}, F: {} }); setWageSrc(null); setCustom(null); setExplainText(null); setSavedKey(''); stopSpeaking();
  };

  const toggle = (role: 'S' | 'F') => (key: string) => {
    const h = role === 'S' ? stock : foil;
    const cell = h?.cells.find((c) => c.key === key);
    setOverrides((o) => {
      const cur = o[role][key];
      const next = { ...o[role] };
      if (cur === undefined) next[key] = !(cell?.punched ?? false);
      else if (cur === !(cell?.punched ?? false)) next[key] = !!cell?.punched;
      else delete next[key];
      return { ...o, [role]: next };
    });
    setSavedKey('');
  };

  const markPaid = () => {
    if (!result || !canSave || !result.pay) return;
    saveScan();
    const r = receiptOf(result, rateChange, wage ?? undefined)!;
    addReceipt({ ...r, verdict: 'paid', at: new Date().toISOString() });
    setLedgerVersion((v) => v + 1);
    toast(t('Marked as paid: {0}', formatMoney(result.pay.agreed.net, spec!.currency)), 'good');
  };

  const addToCrew = () => {
    if (!result || !spec || !result.pay || !canSave) return;
    const crew = loadCrew().filter((c) => c.cardId !== spec.id);
    crew.push({
      id: spec.id + Date.now().toString(36), cardId: spec.id, worker: spec.worker, employer: spec.employer, month: monthKey(spec.year, spec.month),
      currency: spec.currency, agreedDays: result.pay.agreed.days, netMinor: result.pay.agreed.net, disputedMinor: result.pay.disputed, verdict: result.verdict,
    });
    saveCrew(crew);
    toast(t('Added to the crew payroll.'), 'good');
  };

  const printSlip = () => { if (slipRef.current) printHTML(slipRef.current.innerHTML, 'slip'); };

  const listen = () => {
    if (!spec || !result?.pay) return;
    speak((model?.listen ?? '') + ' ' + spokenResult(spec, result.pay.agreed), { lang: langInfo(spec.lang).speech, rate: settings.speakRate });
  };

  const doExplain = async () => {
    if (!result || !spec) return;
    const f = factsOf(result, rateChange, wage ?? undefined);
    if (!f) return;
    setExplainText({ text: t('Thinking…') });
    const r = await explain(settings, f, spec.lang);
    setExplainText({ text: r.text, note: r.note });
  };

  const carryOn = () => {
    if (!spec || !result?.pay) return;
    const next = spec.month === 12 ? { year: spec.year + 1, month: 1 } : { year: spec.year, month: spec.month + 1 };
    startCard({
      // next month's card uses the member's CURRENT wage, not the old card's
      worker: spec.worker, employer: spec.employer, year: next.year, month: next.month, rateMinor: member?.rateMinor ?? spec.rateMinor, advMinor: member?.advMinor ?? spec.advMinor, memberId: member?.id,
      currency: spec.currency, lang: spec.lang, carryMinor: result.pay.agreed.net, halves: spec.halves, discs: spec.discs,
    });
  };

  const applyCustom = (d: number, rateMinor: number, advMinor = wage?.advMinor ?? spec0?.advMinor ?? 0) => {
    if (!spec0) return;
    const dim = new Date(Date.UTC(spec0.year, spec0.month, 0)).getUTCDate();
    setCustom({ ranges: applyChanges(dim, spec0.rateMinor, d > 1 ? [{ fromDay: d, rateMinor }] : [{ fromDay: 1, rateMinor }]), advMinor });
    setWageSrc('custom'); setSavedKey('');
  };
  const onEdit = (edit: { kind: 'rate'; range: number } | { kind: 'adv' }, minor: number) => {
    if (!wage) return;
    const v = clampAmount(minor);
    if (edit.kind === 'adv') setCustom({ ranges: wage.ranges, advMinor: v });
    else setCustom({ ranges: wage.ranges.map((r, i) => (i === edit.range ? { ...r, rateMinor: v } : r)), advMinor: wage.advMinor });
    setWageSrc('custom'); setSavedKey('');
  };
  const pick = (src: WageSource) => {
    if (src === 'custom' && !custom && wage) setCustom({ ranges: wage.ranges, advMinor: wage.advMinor });
    setWageSrc(src); setSavedKey('');
  };
  const cardRate = spec0 ? formatMoney(spec0.rateMinor, spec0.currency) : '';
  const curRate = spec0 && member ? formatMoney(wageScheduleFor(spec0, history, 'current').ranges.slice(-1)[0].rateMinor, spec0.currency) : '';
  const wageControl = spec0 && wage ? (
    <div className="wage-src" onClick={(e) => e.stopPropagation()}>
      <div className="seg" role="radiogroup" aria-label={t('Pay by')}>
        <button type="button" role="radio" aria-checked={source === 'card'} className={source === 'card' ? 'on' : ''} onClick={() => pick('card')}>{t('Card wage {0}', cardRate)}</button>
        {currentDiffers && <button type="button" role="radio" aria-checked={source === 'current'} className={source === 'current' ? 'on' : ''} onClick={() => pick('current')}>{t('Current wage {0}', curRate)}</button>}
        <button type="button" role="radio" aria-checked={source === 'custom'} className={source === 'custom' ? 'on' : ''} onClick={() => pick('custom')}>{t('Custom')}</button>
      </div>
      <span className={'wage-used' + (wage.adjusted ? ' adj' : '')}>{wage.adjusted ? t('Wage adjusted: not the printed card wage') : t('Paid by the wage printed on the card')}</span>
      {model?.wageNote && <div className="wage-banner">{model.wageNote}</div>}
      {source === 'custom' && (
        <div className="wage-custom">
          <label>{t('From day')}<input inputMode="numeric" value={fromDay} onChange={(e) => setFromDay(e.target.value)} /></label>
          <label>{t('New daily wage')}<input inputMode="decimal" value={newWage} placeholder={String(spec0.rateMinor / 100)} onChange={(e) => setNewWage(e.target.value)} /></label>
          <button type="button" className="btn small" onClick={() => {
            const d = Math.trunc(Number(fromDay)), w = parseMajor(newWage);
            const dim = new Date(Date.UTC(spec0.year, spec0.month, 0)).getUTCDate();
            if (!Number.isFinite(d) || d < 1 || d > dim || !Number.isFinite(w) || w < 0) { toast(t('Enter a day of this month and a wage of 0 or more.'), 'warn'); return; }
            applyCustom(d, clampAmount(w));
          }}>{t('Apply')}</button>
        </div>
      )}
    </div>
  ) : null;

  const level = result ? celebrationLevel(result) : 'none';
  const rkey = result ? resultKey(result, stock, foil) : '';
  const showResult = !!result && !!spec && !camera;
  const oneS = new Set(result?.comparison ? [...result.comparison.stockOnly, ...result.comparison.foilOnly] : []);
  const dd = result?.comparison ? disputedDays(result.comparison) : { stock: [], foil: [] };

  return (
    <div className="stack">
      <h1>Payday scan</h1>
      <p className="lead">Photograph each half on a dark table. Keep all four corner squares and the wavy edge in view. You can also drag and drop photos here; they are read automatically.</p>

      {!showResult && (
        <div className="stack" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }} onDrop={onDrop}>
          <div className="panel cam-card">
            {camera
              ? <Camera have={have} onHalf={addHalf} onClose={() => { setCamera(false); setCamMode('halves'); }} onDone={() => { closeCamera(); setCamMode('halves'); }} mode={camMode} />
              : (
                <div className="cam-intro">
                  <svg className="phone-art" viewBox="0 0 70 120" aria-hidden="true">
                    <rect x="2" y="2" width="66" height="116" rx="10" fill="#1a1512" stroke="#6b5e4c" strokeWidth="2" />
                    <rect x="10" y="12" width="50" height="3" rx="1.5" fill="#d0503f" />
                    <path d="M12 20 v6 M12 20 h6 M58 20 v6 M58 20 h-6 M12 100 v-6 M12 100 h6 M58 100 v-6 M58 100 h-6" stroke="#cdbb8f" strokeWidth="2" fill="none" />
                    <path d="M14 46 h42" stroke="#6b5e4c" strokeDasharray="2 2" />
                    <path d="M14 56 q7 -7 14 0 t14 0 t14 0" stroke="#e0832f" strokeWidth="2" fill="none" className="phone-wave" />
                  </svg>
                  <div>
                    <h2>Scan with the camera</h2>
                    <p className="muted">Show each half in turn. It focuses, reads and captures by itself, no button to press.</p>
                    <button className="btn primary" onClick={() => { setCamMode('halves'); setCamera(true); }}><Icon name="camera" /> Start camera</button>
                  </div>
                </div>
              )}
          </div>

          {busy && <div className="reading-shimmer" role="status" aria-label={t('Reading…')} />}
          <ol className="scan-steps" aria-label={t('Progress')}>
            <li className={have.S ? 'done' : 'on'}><span className="dot">{have.S ? '✓' : '1'}</span> {t('Worker half')}</li>
            <li className={have.F ? 'done' : have.S ? 'on' : ''}><span className="dot">{have.F ? '✓' : '2'}</span> {t('Employer half')}</li>
            <li><span className="dot">3</span> {t('Result')}</li>
          </ol>
          <div className="or-rule ui"><span>{t('OR ADD PHOTOS')}</span></div>

          <div className="grid cols-2">
            {(['S', 'F'] as const).map((role) => {
              const got = role === 'S' ? stock : foil;
              return (
                <div key={role} className={'drop-zone' + (over ? ' over' : '') + (got ? ' got' : '')}>
                  <h3>{role === 'S' ? t('Worker half (stock)') : t('Employer half (foil)')}</h3>
                  <svg className="half-art" viewBox="0 0 72 50" aria-hidden="true">
                    <path d="M3 3 H69 V38 Q60 44 50 38 T30 40 T3 38 Z" fill="none" stroke={got ? '#4cc38a' : '#8d7f66'} strokeWidth="2" strokeDasharray="5 4" />
                    <circle cx="25" cy="21" r="6" fill="none" stroke={got ? '#4cc38a' : '#8d7f66'} strokeWidth="2" />
                    <circle cx="45" cy="21" r="6" fill="none" stroke={got ? '#4cc38a' : '#8d7f66'} strokeWidth="2" />
                  </svg>
                  <p className="small ui muted">{got ? t('Read: card {0}', got.decoded.spec.id) : role === 'S' ? t('Worker keeps this half') : t('Employer keeps this half')}</p>
                  <label className="btn">
                    <Icon name="image" /> {busy ? t('Reading…') : t('Choose photo')}
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => { if (e.target.files) readFiles(e.target.files); e.target.value = ''; }} />
                  </label>
                </div>
              );
            })}
          </div>
          <div className="row">
            <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" aria-label="Choose photos" onChange={(e) => { if (e.target.files) readFiles(e.target.files); e.target.value = ''; }} />
            <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy}><Icon name="image" /> {t('Choose photos (one or both at once)')}</button>
            <span className="small ui muted">{t('You can also drop photos anywhere on this page.')}</span>
            {halves.length > 0 && <button className="btn small ghost" onClick={reset}>{t('Start again')}</button>}
          </div>
          <div className="tips">
            <div className="panel tip"><span className="tip-ico" aria-hidden="true">☾</span><b>Plain surface</b><span>Cards with grey discs work on any plain table. Older cards need a dark cloth so holes and the cut edge show.</span></div>
            <div className="panel tip"><span className="tip-ico" aria-hidden="true">⌗</span><b>Whole half in view</b><span>The four black corner squares, the QR and the wavy edge.</span></div>
            <div className="panel tip"><span className="tip-ico" aria-hidden="true">∠</span><b>Hold it above</b><span>Roughly parallel to the table. Tilt and rotation are fine.</span></div>
            <div className="panel tip"><span className="tip-ico" aria-hidden="true">💡</span><b>Even light</b><span>No glare or shadows across the holes. Add light if asked.</span></div>
          </div>
        </div>
      )}

      {showResult && result && spec && (
        <div className="rv" ref={resultRef}>
          <WarningBanner halves={[stock, foil]} />
          {paid && (
            <div className={'note ' + (paid.changed ? 'bad' : 'good')}>
              {t('Already paid on {0}', new Date(paid.at).toLocaleDateString())}
              {paid.changed && <> · {t('Warning: the amount now differs from the payment ({0}).', formatMoney(paid.paid.netMinor, spec.currency))}</>}
            </div>
          )}
          <ResultHero
            result={result}
            rkey={rkey}
            level={level}
            onJoin={openJoin}
            model={model ?? undefined}
            onEdit={onEdit}
            wageControl={wageControl}
            actions={(
              <>
                <button className="btn good big rv-paid" onClick={markPaid} disabled={!canSave || (!!paid && !paid.changed)}>💰 {t('Mark as paid')}</button>
                <div className="rv-icons">
                  <button className="btn icon-btn" onClick={addToCrew} disabled={!canSave} title={t('Add to crew')}><Icon name="crew" /><span>{t('Add to crew')}</span></button>
                  <button className="btn icon-btn" onClick={printSlip} disabled={!canSave} title={t('Print slip')}><Icon name="print" /><span>{t('Print slip')}</span></button>
                  <button className="btn icon-btn" onClick={listen} disabled={!canSave} title={t('Listen')}><Icon name="speaker" /><span>{t('Listen')}</span></button>
                  <button className="btn icon-btn" onClick={doExplain} disabled={!result.pay || settings.aiProvider === 'off'} title={t('Explain')}>💬<span>{t('Explain')}</span></button>
                  {result.pay && result.pay.agreed.net < 0 && canSave && <button className="btn icon-btn" onClick={carryOn} title={t('Carry this balance to next month')}>↪<span>{t('Carry over')}</span></button>}
                  <button className="btn icon-btn" onClick={reset} title={t('Scan another')}><Icon name="scan" /><span>{t('Scan another')}</span></button>
                </div>
              </>
            )}
          >
            {result.pay && result.pay.disputed > 0 && (
              <div className="note" style={{ marginTop: 12 }}>
                <div>{t('Disputed amount: {0}. It is not paid until both sides agree.', formatMoney(result.pay.disputed, spec.currency))}</div>
                {dd.stock.length > 0 && <div>{t('Only on the worker half: day {0}', dd.stock.join(', '))}</div>}
                {dd.foil.length > 0 && <div>{t('Only on the employer half: day {0}', dd.foil.join(', '))}</div>}
                <PayBreakdown view={result.pay.worker} spec={spec} label={t('Worker view')} rateChange={rateChange} />
                <PayBreakdown view={result.pay.employer} spec={spec} label={t('Employer view')} rateChange={rateChange} />
              </div>
            )}
            {result.verdict === 'unreliable' && <div className="note bad" style={{ marginTop: 12 }}>{t('Fewer than 3 corner squares were found on a half. Take the photos again. The slip and the ledger save are disabled.')}</div>}
            {result.verdict === 'pair-mismatch' && <div className="note bad" style={{ marginTop: 12 }}>{t('These two halves do not belong together. Nothing is paid.')}</div>}
            {explainText && (
              <div className="note" style={{ marginTop: 12, whiteSpace: 'pre-line' }} data-notranslate>
                {explainText.note && <div className="muted small">{explainText.note}</div>}
                {explainText.text}
              </div>
            )}
          </ResultHero>

          <div className="rv-grid">
            <div className="rv-main">
              <Section title={t('The tally')}>
                <TallyPair stock={stock} foil={foil} oneSided={oneS} overrides={overrides} onToggle={toggle} level={level} rkey={rkey} />
                {result.comparison && result.comparison.unsureCount > 0 && <p className="small ui rv-hint">{t('Dashed amber circles are unsure. Tap a day to correct it. Corrections are marked manual.')}</p>}
              </Section>
              <Section title={t('Checks')} extra={<span className="chip check-sum">{t('{0}/{1} checks passed', result.checks.filter((c) => c.ok === true).length, result.checks.length)}</span>}>
                <CheckTimeline result={result} onJoin={openJoin} rkey={rkey} />
              </Section>
            </div>
            <aside className="rv-side">
              {canSave && result.pay && model && wage
                ? <SlipPrint rkey={rkey}><div ref={slipRef} className="slip-holder"><PaySlip spec={spec} view={result.pay.agreed} model={model} wage={wage} level={level} disputed={result.pay.disputed > 0} paidAt={paid && !paid.changed ? paid.at : undefined} dealKey={rkey + ':' + model.net} /></div></SlipPrint>
                : <div className="panel"><p className="muted">{t('The slip is available for a verified pair with clear photos.')}</p></div>}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
