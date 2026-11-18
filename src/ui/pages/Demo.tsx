import { useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { scenario, runPair, type ScenarioId, type ScenarioRun } from '../sim';
import { SimView } from '../components/SimView';

type Step = { key: string; label: string; scenario?: ScenarioId };

const STEPS: Step[] = [
  { key: 'claim', label: '1 · The claim' },
  { key: 'scan', label: '2 · Worker brings his half', scenario: 'claim' },
  { key: 'extra', label: '3 · A sneaky extra hole', scenario: 'extra' },
  { key: 'half', label: '4 · A half day', scenario: 'halfday' },
  { key: 'forged', label: '5 · A forged cut', scenario: 'forged' },
];

const MORE: ScenarioId[] = ['sloppy', 'forgedFit'];

export default function Demo() {
  const { t, settings } = useApp();
  const [step, setStep] = useState(0);
  const [extra, setExtra] = useState<ScenarioId | null>(null);
  const [run, setRun] = useState<ScenarioRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sc = extra ?? STEPS[step].scenario;

  useEffect(() => {
    if (!sc) { setRun(null); return; }
    let alive = true;
    setBusy(true); setErr(''); setRun(null);
    runPair(scenario(sc).input, settings.calibration.tolerance)
      .then((r) => { if (alive) setRun(r); }, (e) => { if (alive) setErr((e as Error).message); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [sc, settings.calibration.tolerance]);

  return (
    <div className="stack">
      <div className="kicker">THE 90-SECOND STORY</div>
      <h1>“You only worked 4 days.”</h1>
      <p className="lead">Everything below is a real run of the scanner on simulated phone photos (rotated, tilted, noisy, unevenly lit), not a mock-up.</p>
      <div className="panel stack">
        <div className="tabs" role="tablist" aria-label={t('Steps')}>
          {STEPS.map((s, i) => (
            <button key={s.key} role="tab" className="btn" aria-selected={!extra && step === i} onClick={() => { setExtra(null); setStep(i); }}>{t(s.label)}</button>
          ))}
        </div>
        {!extra && step === 0 && (
          <div className="dialogue">
            <p><b>Contractor:</b> “You only worked 4 days this month. Here’s ₹2,400.”</p>
            <p><b>Ramesh:</b> “No. I worked five.” He has no phone, no payslip, no witness. But he kept his half of the card.</p>
            <p className="small ui muted">Step 2 scans both halves. Step 3 shows what happens when someone adds one hole to a single half.</p>
          </div>
        )}
        {!extra && step === 1 && <p>Both halves go under the phone. The pairing code proves they were printed together, and the employer’s half shows the same five holes. Five days it is.</p>}
        {!extra && step === 2 && <p>Someone punched one more hole into the worker half only. It is shown on one side, marked as disputed, and never paid.</p>}
        {!extra && step === 3 && <p>Half-day circles: both circles of a date are a full day, one circle is half a day. Four full days and one half day make 4½ days.</p>}
        {!extra && step === 4 && <p>A card without a pairing code relies on its wavy cut. A foil cut on a different wave does not fit, and the pair is rejected.</p>}
        {extra && <p>{scenario(extra).text}</p>}
        <div className="row small ui">
          <span className="muted">{t('More forgeries')}:</span>
          {MORE.map((id) => <button key={id} className="btn small" aria-pressed={extra === id} onClick={() => setExtra(id)}>{scenario(id).title}</button>)}
        </div>
      </div>
      {busy && <p className="ui muted" role="status">{t('Rendering photos and scanning…')}</p>}
      {err && <div className="note bad">{err}</div>}
      {run && <SimView run={run} />}
    </div>
  );
}
