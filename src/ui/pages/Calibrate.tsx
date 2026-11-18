import { useRef, useState } from 'react';
import { useApp } from '../ctx';
import { Icon } from '../components/Icon';
import { fileToImage } from '../imageIO';
import { scanImages } from '../scanAsync';
import { calibrationReport, type CalibrationReport } from '../../vision/calibrate';
import { download } from '../../store/index';
import { T } from '../../vision/detect';

const f = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');

export default function Calibrate() {
  const { t, toast, settings, setSettings } = useApp();
  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const cur = settings.calibration;

  const read = async (files: FileList) => {
    setBusy(true);
    try {
      const imgs = await Promise.all([...files].map((x) => fileToImage(x, 1800)));
      const res = await scanImages(imgs);
      const halves = res.flatMap((r) => r.halves);
      if (!halves.length) { toast(t('No card was found in these photos.'), 'warn'); return; }
      setReport(calibrationReport(halves));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h1>Tune to your paper and punch</h1>
      <p className="lead">The thresholds come from the simulator. Upload photos of really punched cards (both halves if you can) and Stock &amp; Foil measures your paper, your punch and your stacking, then suggests settings. Nothing changes until you press Apply.</p>
      <div className="panel stack">
        <div className="row">
          <input ref={input} type="file" accept="image/*" multiple className="sr-only" aria-label={t('Choose photos of punched cards')} onChange={(e) => { if (e.target.files?.length) read(e.target.files); e.target.value = ''; }} />
          <button className="btn primary" onClick={() => input.current?.click()} disabled={busy}><Icon name="image" /> {busy ? t('Reading…') : t('Choose photos')}</button>
          <button className="btn ghost" onClick={() => { setSettings({ calibration: {} }); toast(t('Back to the default settings.'), 'good'); }}>Reset to defaults</button>
        </div>
        <p className="small muted" data-notranslate>
          {t('Now')}: threshold {f(cur.threshold ?? T.punch, 2)} · tolerance {f(cur.tolerance ?? 1.2, 2)} mm{cur.threshold === undefined && cur.tolerance === undefined ? ' (defaults)' : ''}
        </p>
      </div>
      {report && (
        <div className="panel stack">
          <h2>Measurements</h2>
          <table className="table">
            <tbody>
              <tr><td>{t('Halves read')}</td><td className="num">{report.halves}</td></tr>
              <tr><td>{t('Punched circles (median brightness)')}</td><td className="num">{f(report.punchedMedian)} <span className="muted">({report.punchedRatios.length})</span></td></tr>
              <tr><td>{t('Blank circles (median brightness)')}</td><td className="num">{f(report.blankMedian)} <span className="muted">({report.blankRatios.length})</span></td></tr>
              <tr><td>{t('Hole radius (mm)')}</td><td className="num">{f(report.holeRadius, 2)}</td></tr>
              <tr><td>{t('Half-to-half alignment (largest, mm)')}</td><td className="num">{report.residuals.length ? f(Math.max(...report.residuals), 2) : '—'}</td></tr>
            </tbody>
          </table>
          {report.notes.map((n) => <div key={n} className="note">{t(n)}</div>)}
          {report.suggestion ? (
            <div className="note good">
              {t('Suggested')}: <span data-notranslate>threshold {f(report.suggestion.threshold ?? NaN, 3)}{report.suggestion.tolerance !== undefined ? ` · tolerance ${f(report.suggestion.tolerance, 2)} mm` : ''}</span>
            </div>
          ) : <div className="note">{t('No suggestion: not enough data.')}</div>}
          <div className="row">
            <button className="btn primary" disabled={!report.suggestion} onClick={() => { setSettings({ calibration: { ...cur, ...report.suggestion } }); toast(t('Applied to this device.'), 'good'); }}>Apply to this device</button>
            <button className="btn" onClick={() => download('stock-and-foil-calibration.json', JSON.stringify({ ...report, at: new Date().toISOString() }, null, 1), 'application/json')}><Icon name="download" /> Download the report</button>
          </div>
        </div>
      )}
    </div>
  );
}
