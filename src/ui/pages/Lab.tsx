import { useMemo, useRef, useState } from 'react';
import { useApp } from '../ctx';
import { Field, OptionCard } from '../components/Controls';
import { SimView } from '../components/SimView';
import { demoCard, runPair, randomCase, type ScenarioRun } from '../sim';
import { encodePayload, clampCarry, parseMajor } from '../../core/card';
import { mulberry32 } from '../../core/prng';
import type { PairInput, PhotoOpts } from '../../render/scene';
import { sheetSvg } from '../../render/sheet';
import { sheetBitmap } from '../imageIO';
import { roundTrip } from '../scanAsync';
import { verifyPair, pickHalves } from '../../vision/pair';
import { Select } from '../components/Select';

type Tamper = 'none' | 'extra' | 'covered' | 'separate' | 'forgedCut' | 'rate' | 'foreign';

const TAMPERS: { id: Tamper; label: string; hint: string }[] = [
  { id: 'none', label: 'Honest pair', hint: 'Both halves identical.' },
  { id: 'extra', label: 'Extra hole', hint: 'One more hole punched into the worker half only.' },
  { id: 'covered', label: 'Covered hole', hint: 'One hole on the worker half is missing from the employer half.' },
  { id: 'separate', label: 'Punched separately', hint: 'One day was punched on each half separately, 2.5 mm off.' },
  { id: 'forgedCut', label: 'Forged cut', hint: 'A card without a pairing code, with a foil cut on a different wave.' },
  { id: 'rate', label: 'Changed rate', hint: 'The employer half claims a different daily wage, so the card code fails.' },
  { id: 'foreign', label: 'Foreign card', hint: 'The employer half belongs to another card.' },
];

const SLIDERS: { k: keyof PhotoOpts; label: string; min: number; max: number; step: number }[] = [
  { k: 'rotationDeg', label: 'Rotation (±°)', min: 0, max: 40, step: 1 },
  { k: 'blur', label: 'Blur (px)', min: 0, max: 4, step: 0.1 },
  { k: 'noise', label: 'Sensor noise', min: 0, max: 0.12, step: 0.005 },
  { k: 'light', label: 'Uneven light', min: 0, max: 0.8, step: 0.05 },
  { k: 'tiltXDeg', label: 'Perspective tilt (°)', min: 0, max: 25, step: 1 },
  { k: 'pxPerMm', label: 'Scale (px per mm)', min: 1.6, max: 6, step: 0.1 },
  { k: 'background', label: 'Background brightness', min: 0, max: 1, step: 0.01 },
  { k: 'crop', label: 'Cut off the right side', min: 0, max: 0.5, step: 0.01 },
];

export default function Lab() {
  const { t, settings } = useApp();
  const [days, setDays] = useState('2, 3, 4, 5, 9, 10');
  const [carry, setCarry] = useState('0');
  const [tamper, setTamper] = useState<Tamper>('none');
  const [photo, setPhoto] = useState<PhotoOpts>({ rotationDeg: 8, tiltXDeg: 3, pxPerMm: 3.6, blur: 0.5, noise: 0.015, light: 0.2, background: 0.1, crop: 0 });
  const [jitter, setJitter] = useState(0);
  const [discs, setDiscs] = useState(false);
  const [halves, setHalves] = useState(false);
  const [run, setRun] = useState<ScenarioRun | null>(null);
  const [busy, setBusy] = useState('');
  const [stress, setStress] = useState<{ n: number; done: number; exact: number; flagged: number; wrong: number; fails: string[] } | null>(null);
  const stop = useRef(false);

  const dayList = useMemo(() => [...new Set(days.split(/[\s,]+/).map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 30))], [days]);

  const build = (): PairInput => {
    const spec = demoCard({ discs, halves, carryMinor: clampCarry(parseMajor(carry) || 0) });
    const keys = [...dayList.flatMap((d) => (halves ? [`d${d}a`, `d${d}b`] : [`d${d}`])), 'a1'];
    const rot = photo.rotationDeg ?? 0;
    const input: PairInput = {
      spec, stockPunched: keys, foilPunched: keys, seed: 11,
      photoStock: { ...photo, rotationDeg: rot }, photoFoil: { ...photo, seed: 99, rotationDeg: -rot, tiltXDeg: -(photo.tiltXDeg ?? 0) },
      stockCutJitter: jitter, foilCutJitter: jitter,
    };
    const extraKey = halves ? 'd28a' : 'd28';
    if (tamper === 'extra') input.stockPunched = [...keys, extraKey];
    if (tamper === 'covered') input.foilPunched = keys.slice(1);
    if (tamper === 'separate') { input.separate = [keys[0]]; input.separateOffset = 2.5; }
    if (tamper === 'forgedCut') { input.spec = demoCard({ discs, halves, pairing: false }); input.forgeCutFoil = true; }
    if (tamper === 'rate') input.foilPayload = encodePayload({ ...spec, rateMinor: spec.rateMinor + 10000 }, 'F');
    if (tamper === 'foreign') input.foilPayload = encodePayload({ ...demoCard({ discs, halves }, 'F0RE1GN0'), pairing: { sa: 'AAAAAAAAAAAA', sf: 'BBBBBBBBBBBB' } }, 'F');
    return input;
  };

  const go = async () => {
    setBusy(t('Rendering photos and scanning…')); setRun(null);
    try { setRun(await runPair(build(), settings.calibration)); } finally { setBusy(''); }
  };

  const printTrip = async () => {
    setBusy(t('Rasterising the real sheet, cutting, punching, photographing and scanning…')); setRun(null);
    try {
      const input = build();
      const bmp = await sheetBitmap(sheetSvg(input.spec), 6);
      const sim = await roundTrip(input, bmp, { calibration: settings.calibration });
      const { stock, foil } = pickHalves(sim.scans.flatMap((s) => s.halves));
      setRun({ sim, stock, foil, result: verifyPair(stock, foil, { alignTolMm: settings.calibration.alignTolMm }) });
    } finally { setBusy(''); }
  };

  const runStress = async (n: number) => {
    stop.current = false;
    const rnd = mulberry32(Date.now() >>> 0);
    const st = { n, done: 0, exact: 0, flagged: 0, wrong: 0, fails: [] as string[] };
    setStress({ ...st });
    for (let i = 0; i < n && !stop.current; i++) {
      const input = randomCase(rnd);
      try {
        const r = await runPair(input);
        const truth = new Set(input.stockPunched);
        const read = r.result.comparison?.agreed ?? new Set<string>();
        const same = read.size === truth.size && [...truth].every((k) => read.has(k));
        const warned = !r.stock || !r.foil || r.result.verdict !== 'genuine-consistent' || (r.result.comparison?.unsureCount ?? 0) > 0 || [...(r.stock?.warnings ?? []), ...(r.foil?.warnings ?? [])].length > 0;
        if (same && !warned) st.exact++;
        else if (warned) { st.flagged++; st.fails.push(`#${i + 1}: ${r.result.verdict}${r.result.comparison?.unsureCount ? `, ${r.result.comparison.unsureCount} unsure` : ''}`); }
        else { st.wrong++; st.fails.push(`#${i + 1}: SILENTLY WRONG`); }
      } catch (e) { st.flagged++; st.fails.push(`#${i + 1}: ${(e as Error).message}`); }
      st.done = i + 1;
      setStress({ ...st, fails: [...st.fails] });
    }
  };

  const tp = TAMPERS.find((x) => x.id === tamper)!;
  return (
    <div className="stack">
      <h1>Test lab</h1>
      <p className="lead">A photo simulator renders both halves as a phone would see them, then the <em>real</em> scanner reads them. Same engine the property-based tests (Kiro / fast-check) hammer thousands of times.</p>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="panel stack">
          <h2>Scenario</h2>
          <Field label={t('Days punched (1–30)')}><input value={days} onChange={(e) => setDays(e.target.value)} /></Field>
          <Field label={t('Balance brought forward (negative = worker owes)')}><input inputMode="decimal" value={carry} onChange={(e) => setCarry(e.target.value)} /></Field>
          <Field label={t('Tampering')} hint={t(tp.hint)}>
            <Select label={t('Tamper')} value={tamper} onChange={(v) => setTamper(v as Tamper)} options={TAMPERS.map((x) => ({ value: x.id, label: t(x.label) }))} />
          </Field>
          <h3>Camera conditions</h3>
          {SLIDERS.map((s) => (
            <label key={s.k} className="field">
              <span data-notranslate>{t(s.label)}: {Number(photo[s.k] ?? 0).toFixed(s.step < 0.01 ? 3 : s.step < 1 ? 2 : 0)}</span>
              <input type="range" min={s.min} max={s.max} step={s.step} value={Number(photo[s.k] ?? 0)} onChange={(e) => setPhoto({ ...photo, [s.k]: Number(e.target.value) })} />
            </label>
          ))}
          <label className="field"><span data-notranslate>{t('Sloppy cut (mm)')}: {jitter.toFixed(1)}</span><input type="range" min={0} max={4} step={0.1} value={jitter} onChange={(e) => setJitter(Number(e.target.value))} /></label>
          <OptionCard checked={discs} onChange={setDiscs} title={t('Printed grey discs')} text={t('Grey discs in every circle, readable on any plain surface.')} />
          <OptionCard checked={halves} onChange={setHalves} title={t('Half-day circles')} text={t('Two circles per date.')} />
          <div className="row">
            <button className="btn primary" onClick={go} disabled={!!busy}>▶ {t('Render & scan')}</button>
            <button className="btn" onClick={printTrip} disabled={!!busy}>🖨️ {t('Print round-trip')}</button>
          </div>
        </div>
        <div className="panel stack">
          <h2>Stress test</h2>
          <p className="small ui muted">{t('Random in-envelope photos (rotation, tilt, blur, noise, shadows, exposure). Counts exact reads, flagged-for-review, and silently wrong reads (should be 0).')}</p>
          <div className="row">
            {[10, 30, 100].map((n) => <button key={n} className="btn" disabled={!!busy || (!!stress && stress.done < stress.n)} onClick={() => runStress(n)}>{t('Run {0}', n)}</button>)}
            <button className="btn" onClick={() => (stop.current = true)}>{t('Stop')}</button>
          </div>
          {stress && (
            <div role="status" className="stack">
              <div className="grid cols-3">
                <div className="panel stat"><div className="kicker">{t('EXACT')}</div><div className="big">{stress.exact}</div></div>
                <div className="panel stat"><div className="kicker">{t('FLAGGED')}</div><div className="big">{stress.flagged}</div></div>
                <div className="panel stat"><div className="kicker">{t('SILENTLY WRONG')}</div><div className="big" style={{ color: stress.wrong ? 'var(--bad)' : 'var(--green)' }}>{stress.wrong}</div></div>
              </div>
              <p className="small ui">{t('{0} of {1} done · success rate {2}%', stress.done, stress.n, stress.done ? Math.round((stress.exact / stress.done) * 100) : 0)}</p>
              {stress.fails.length > 0 && <ul className="small" data-notranslate>{stress.fails.slice(-30).map((f, i) => <li key={i}>{f}</li>)}</ul>}
            </div>
          )}
        </div>
      </div>
      {busy && <p className="ui muted" role="status">{busy}</p>}
      {run && <SimView run={run} />}
    </div>
  );
}
