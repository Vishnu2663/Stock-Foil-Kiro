import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useApp } from '../ctx';
import { Camera } from '../components/Camera';
import { PaydayCard, HalfView, ChecksList, Slip, PayBreakdown, spokenResult, Money } from '../components/Result';
import { Switch, Field } from '../components/Controls';
import { Icon } from '../components/Icon';
import { fileToImage, printHTML } from '../imageIO';
import { scanImages } from '../scanAsync';
import { verifyPair, pickHalves, type PairResult } from '../../vision/pair';
import type { HalfScan } from '../../vision/detect';
import { disputedDays, type RateChange } from '../../core/wages';
import { addReceipt, loadLedger, loadCrew, saveCrew } from '../../store/index';
import { paidInfo } from '../../core/settlement';
import { monthKey, parseMajor, clampAmount, formatMoney, type CardSpec } from '../../core/card';
import type { ReceiptData } from '../../core/history';
import { speak, stopSpeaking } from '../../ai/speech';
import { explain, type PayFacts } from '../../ai/index';
import { langInfo } from '../../i18n/index';

export function factsOf(result: PairResult, rateChange?: RateChange): PayFacts | null {
  const v = result.pay?.agreed;
  const spec = result.spec;
  if (!v || !spec || !result.comparison || !result.pay) return null;
  const dd = disputedDays(result.comparison);
  return {
    verdict: result.verdict, currency: spec.currency, fullDays: v.fullDays, halfDays: v.halfDays, days: v.days,
    rateMinor: spec.rateMinor, advCount: v.advCount, advMinor: spec.advMinor, carryMinor: v.carry, netMinor: v.net,
    disputedMinor: result.pay.disputed, stockOnlyDays: dd.stock, foilOnlyDays: dd.foil, rateChange,
  };
}

export function receiptOf(result: PairResult, rateChange?: RateChange): ReceiptData | null {
  const spec = result.spec, v = result.pay?.agreed, cmp = result.comparison;
  if (!spec || !v || !cmp || !result.pay) return null;
  const days = (s: Set<string>) => [...new Set([...s].filter((k) => k[0] === 'd').map((k) => Number(/\d+/.exec(k)![0])))].sort((a, b) => a - b);
  const r: ReceiptData = {
    at: new Date().toISOString(), cardId: spec.id, month: monthKey(spec.year, spec.month), worker: spec.worker, employer: spec.employer,
    verdict: result.verdict, agreedDays: days(cmp.agreed), stockOnlyDays: days(cmp.stockOnly), foilOnlyDays: days(cmp.foilOnly),
    agreedAdv: v.advCount, netMinor: v.net, disputedMinor: result.pay.disputed, currency: spec.currency,
  };
  if (rateChange) r.rateChange = rateChange;
  if (spec.halves) r.halfUnits = v.halfUnits;
  return r;
}

export default function Scan() {
  const { t, toast, settings, startCard } = useApp();
  const [halves, setHalves] = useState<HalfScan[]>([]);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [overrides, setOverrides] = useState<{ S: Record<string, boolean>; F: Record<string, boolean> }>({ S: {}, F: {} });
  const [wageChange, setWageChange] = useState(false);
  const [fromDay, setFromDay] = useState('16');
  const [newWage, setNewWage] = useState('');
  const [explainText, setExplainText] = useState<{ text: string; note?: string } | null>(null);
  const [savedKey, setSavedKey] = useState('');
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const slipRef = useRef<HTMLDivElement>(null);

  const { stock, foil } = useMemo(() => pickHalves(halves), [halves]);
  const have = { S: !!stock, F: !!foil };

  const rateChange: RateChange | undefined = useMemo(() => {
    if (!wageChange) return undefined;
    const d = Math.trunc(Number(fromDay));
    const w = parseMajor(newWage);
    if (!Number.isFinite(d) || d < 2 || d > 31 || !Number.isFinite(w)) return undefined;
    return { fromDay: d, rateMinor: clampAmount(w) };
  }, [wageChange, fromDay, newWage]);

  const result = useMemo(() => (stock && foil ? verifyPair(stock, foil, { tolerance: settings.calibration.tolerance, overrides, rateChange }) : null), [stock, foil, overrides, rateChange, settings.calibration.tolerance]);
  const canSave = !!result && result.verdict !== 'unreliable' && result.verdict !== 'pair-mismatch';
  const spec: CardSpec | null = result?.spec ?? null;
  const paid = useMemo(() => (spec && result?.pay ? paidInfo(loadLedger(), spec.id, result.pay.agreed.net) : null), [spec, result, ledgerVersion]);

  const addHalf = useCallback((h: HalfScan) => {
    setHalves((list) => {
      const rest = list.filter((x) => !(x.decoded.role === h.decoded.role));
      return [...rest, h];
    });
  }, []);

  useEffect(() => { if (have.S && have.F) setCamera(false); }, [have.S, have.F]);

  // Save the scan to the ledger once per result (never for an unreliable photo).
  const saveScan = useCallback((force = false) => {
    if (!result || !canSave) return false;
    const r = receiptOf(result, rateChange);
    if (!r) return false;
    const key = JSON.stringify({ ...r, at: '' });
    if (!force && key === savedKey) return true;
    addReceipt(r);
    setSavedKey(key);
    setLedgerVersion((v) => v + 1);
    return true;
  }, [result, canSave, rateChange, savedKey]);

  useEffect(() => {
    if (result && canSave && !savedKey) saveScan();
  }, [result, canSave, savedKey, saveScan]);

  useEffect(() => {
    if (result && settings.simple && spec && result.pay && canSave) {
      speak(spokenResult(spec, result.pay.agreed), { lang: langInfo(spec.lang).speech, rate: settings.speakRate });
    }
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.verdict, spec?.id]);

  const readFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!list.length) return;
    setBusy(true);
    try {
      const imgs = await Promise.all(list.map((f) => fileToImage(f, 1800)));
      const res = await scanImages(imgs);
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
    setHalves([]); setOverrides({ S: {}, F: {} }); setWageChange(false); setExplainText(null); setSavedKey(''); stopSpeaking();
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
    const r = receiptOf(result, rateChange)!;
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
    speak(spokenResult(spec, result.pay.agreed), { lang: langInfo(spec.lang).speech, rate: settings.speakRate });
  };

  const doExplain = async () => {
    if (!result || !spec) return;
    const f = factsOf(result, rateChange);
    if (!f) return;
    setExplainText({ text: t('Thinking…') });
    const r = await explain(settings, f, spec.lang);
    setExplainText({ text: r.text, note: r.note });
  };

  const carryOn = () => {
    if (!spec || !result?.pay) return;
    const next = spec.month === 12 ? { year: spec.year + 1, month: 1 } : { year: spec.year, month: spec.month + 1 };
    startCard({
      worker: spec.worker, employer: spec.employer, year: next.year, month: next.month, rateMinor: spec.rateMinor, advMinor: spec.advMinor,
      currency: spec.currency, lang: spec.lang, carryMinor: result.pay.agreed.net, halves: spec.halves, discs: spec.discs,
    });
  };

  const oneS = new Set(result?.comparison ? [...result.comparison.stockOnly, ...result.comparison.foilOnly] : []);
  const dd = result?.comparison ? disputedDays(result.comparison) : { stock: [], foil: [] };

  return (
    <div className="stack">
      <h1>Payday scan</h1>
      <p className="lead">Photograph each half on a dark table. Keep all four corner squares and the wavy edge in view. You can also drag and drop photos here; they are read automatically.</p>

      {!result && (
        <div className="stack" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }} onDrop={onDrop}>
          <div className="panel cam-card">
            {camera
              ? <Camera have={have} onHalf={addHalf} onClose={() => setCamera(false)} />
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
                    <button className="btn primary" onClick={() => setCamera(true)}><Icon name="camera" /> Start camera</button>
                  </div>
                </div>
              )}
          </div>

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

      {result && spec && (
        <>
          {paid && (
            <div className={'note ' + (paid.changed ? 'bad' : 'good')}>
              {t('Already paid on {0}', new Date(paid.at).toLocaleDateString())}
              {paid.changed && <> · {t('Warning: the amount now differs from the payment ({0}).', formatMoney(paid.paid.netMinor, spec.currency))}</>}
            </div>
          )}
          <PaydayCard result={result} rateChange={rateChange}>
            {rateChange && <div className="chip warn" style={{ marginTop: 10 }}>{t('Wage changed from day {0}: {1}', rateChange.fromDay, formatMoney(rateChange.rateMinor, spec.currency))}</div>}
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
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn good" onClick={markPaid} disabled={!canSave}>💰 Mark as paid</button>
              <button className="btn" onClick={addToCrew} disabled={!canSave}><Icon name="crew" /> Add to crew</button>
              <button className="btn" onClick={printSlip} disabled={!canSave}><Icon name="print" /> Print slip</button>
              <button className="btn" onClick={listen} disabled={!canSave}><Icon name="speaker" /> Listen</button>
              <button className="btn" onClick={doExplain} disabled={!result.pay}>💬 Explain</button>
              {result.pay && result.pay.agreed.net < 0 && canSave && <button className="btn" onClick={carryOn}>↪ Carry this balance to next month&apos;s card</button>}
              <button className="btn ghost" onClick={reset}><Icon name="scan" /> Scan another</button>
            </div>
            {explainText && (
              <div className="note" style={{ marginTop: 12, whiteSpace: 'pre-line' }} data-notranslate>
                {explainText.note && <div className="muted small">{explainText.note}</div>}
                {explainText.text}
              </div>
            )}
          </PaydayCard>

          <div className="panel">
            <Switch checked={wageChange} onChange={(v) => { setWageChange(v); setSavedKey(''); }} label={t('Wage changed this month')} />
            {wageChange && (
              <div className="grid cols-2" style={{ marginTop: 8 }}>
                <Field label={t('From day')}><input inputMode="numeric" value={fromDay} onChange={(e) => setFromDay(e.target.value)} /></Field>
                <Field label={t('New daily wage')} hint={formatMoney(spec.rateMinor, spec.currency) + ' → ?'}><input inputMode="decimal" value={newWage} onChange={(e) => setNewWage(e.target.value)} placeholder="550" /></Field>
              </div>
            )}
          </div>

          <div className="grid cols-2">
            {stock && <HalfView half={stock} title={t('Worker half (stock)')} oneSided={oneS} overrides={overrides.S} onToggle={toggle('S')} />}
            {foil && <HalfView half={foil} title={t('Employer half (foil)')} oneSided={oneS} overrides={overrides.F} onToggle={toggle('F')} />}
          </div>
          {result.comparison && result.comparison.unsureCount > 0 && <p className="note">{t('Dashed circles are unsure. Tap a day to correct it. Corrections are marked manual.')}</p>}

          <div className="grid cols-2">
            <div className="panel">
              <h2>Checks</h2>
              <ChecksList result={result} />
            </div>
            <div className="panel">
              <h2>Pay slip</h2>
              {canSave && result.pay
                ? <div ref={slipRef}><Slip spec={spec} view={result.pay.agreed} disputedDays={[...new Set([...dd.stock, ...dd.foil])]} /></div>
                : <p className="muted">The slip is available for a verified pair with clear photos.</p>}
              {canSave && result.pay && <p className="small muted" style={{ marginTop: 8 }}>{t('Total')}: <Money minor={result.pay.agreed.net} currency={spec.currency} /></p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
