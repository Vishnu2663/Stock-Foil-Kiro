import { useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { Field, OptionCard, Switch } from '../components/Controls';
import { UI_LANGS, langInfo } from '../../i18n/index';
import { PRESETS, builtinAvailable, translateStrings, explain } from '../../ai/index';
import { clearAll, type AiProvider } from '../../store/index';
import { speak, speechSupported } from '../../ai/speech';
import { forgetPack } from '../../i18n/uiPack';
import source from '../../i18n/ui/source.json';

export default function Settings() {
  const { t, toast, settings, setSettings, lang } = useApp();
  const [extraLang, setExtraLang] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(t('Checking…'));
  const [aiTest, setAiTest] = useState('');

  useEffect(() => {
    if (settings.aiProvider === 'off') setStatus(t('Off. The offline explanation is used.'));
    else if (settings.aiProvider === 'builtin') setStatus(builtinAvailable() ? t('Available on this device.') : t('Not available in this browser. The offline explanation is used.'));
    else setStatus(settings.customKey ? t('Custom endpoint set.') : t('Add your own free key to use it.'));
  }, [settings.aiProvider, settings.customKey, t]);

  const testAI = async () => {
    setAiTest(t('Thinking…'));
    const r = await explain(settings, {
      verdict: 'genuine-disputed', currency: 'INR', fullDays: 5, halfDays: 0, days: 5, rateMinor: 50000, advCount: 1, advMinor: 10000,
      carryMinor: 0, netMinor: 240000, disputedMinor: 50000, stockOnlyDays: [12], foilOnlyDays: [],
    }, lang);
    setAiTest((r.note ? r.note + '\n\n' : '') + r.text);
  };

  return (
    <div className="stack">
      <h1>Settings</h1>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="panel stack">
          <h2>Language &amp; voice</h2>
          <Field label={t('Language')} hint={t('The one language for the whole app: scan results, the pay slip, the plain-words explanation and read-aloud. New cards are printed in it too (you can still change that per card).')}>
            <select value={settings.lang} onChange={(e) => setSettings({ lang: e.target.value })}>
              {UI_LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </Field>
          <OptionCard checked={settings.simple} onChange={(v) => setSettings({ simple: v })} title={t('Pictures and voice mode')} badge={t('for workers who cannot read')} text={t('Big pictures and buttons, a Listen button on every page, spoken instructions while scanning, and the result shown as suns for the days and notes to hand over, read aloud in your language.')} />
          <label className="field">
            <span data-notranslate>{t('Read-aloud speed')}: {settings.speakRate.toFixed(2)}</span>
            <input type="range" min={0.6} max={1.3} step={0.05} value={settings.speakRate} onChange={(e) => setSettings({ speakRate: Number(e.target.value) })} />
          </label>
          {speechSupported() && <div><button className="btn" onClick={() => speak(t('This is how the app sounds.'), { lang: langInfo(lang).speech, rate: settings.speakRate })}>🔊 {t('Test voice')}</button></div>}
          <h3>Add another language with AI</h3>
          <div className="row">
            <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder={t('e.g. mr (Marathi), te (Telugu)')} aria-label={t('Language code to add')} value={extraLang} onChange={(e) => setExtraLang(e.target.value.trim())} />
            <button className="btn" disabled={busy || settings.aiProvider === 'off' || !/^[a-z]{2,3}$/.test(extraLang)} onClick={async () => {
              setBusy(true);
              try {
                const pack = await translateStrings(settings, extraLang, Object.keys(source));
                localStorage.setItem('sf.pack.' + extraLang, JSON.stringify(pack));
                forgetPack(extraLang);
                toast(t('Translated {0} strings.', Object.keys(pack).length), 'good');
              } catch (e) { toast(t('AI translation failed: {0}', (e as Error).message), 'bad'); }
              finally { setBusy(false); }
            }}>{t('Translate')}</button>
          </div>
          <p className="small ui muted">{t('Uses the AI provider you choose. Sends only the app’s English UI strings, never your data.')}</p>
        </div>

        <div className="panel stack">
          <h2>Free AI</h2>
          <p className="small ui muted">{t('Optional. Used to explain pay and disputes in simple words. Without it, a built-in offline explanation is used.')}</p>
          <Field label={t('Provider')}>
            <select value={settings.aiProvider} onChange={(e) => setSettings({ aiProvider: e.target.value as AiProvider })}>
              <option value="builtin">{t('On-device (Chrome built-in AI) · private, offline')}</option>
              <option value="custom">{t('Custom (OpenAI-compatible, your own free key)')}</option>
              <option value="off">{t('Off')}</option>
            </select>
          </Field>
          <p className="small ui">{status}</p>
          {settings.aiProvider === 'custom' && (
            <>
              <div className="row">
                {PRESETS.map((p) => <button key={p.name} className="btn small" onClick={() => setSettings({ customUrl: p.url, customModel: p.model })}>{p.name} <span className="chip warn">{t('unverified')}</span></button>)}
              </div>
              <Field label={t('Endpoint URL')}><input value={settings.customUrl} onChange={(e) => setSettings({ customUrl: e.target.value })} spellCheck={false} /></Field>
              <Field label={t('Model')}><input value={settings.customModel} onChange={(e) => setSettings({ customModel: e.target.value })} spellCheck={false} /></Field>
              <Field label={t('API key')} hint={t('Stored only on this device.')}><input type="password" value={settings.customKey} onChange={(e) => setSettings({ customKey: e.target.value })} autoComplete="off" /></Field>
            </>
          )}
          <div className="privacy-box small ui"><b>{t('Privacy:')}</b> {t('cloud providers only ever receive anonymised numbers (days, rate, amounts). Names, card ids and photos are never sent. Photos are processed entirely on your device.')}</div>
          <OptionCard checked={settings.aiNote} onChange={(v) => setSettings({ aiNote: v })} title={t('Label AI text')} text={t('Show a note when an explanation came from AI.')} />
          <div><button className="btn" onClick={testAI}>🤖 {t('Test AI')}</button></div>
          {aiTest && <div className="note small" style={{ whiteSpace: 'pre-line' }} data-notranslate>{aiTest}</div>}
        </div>

        <div className="panel stack">
          <h2>Calibration</h2>
          <p className="small ui">{settings.calibration.punchRatio !== undefined || settings.calibration.alignTolMm !== undefined ? t('This device uses calibrated settings.') : t('This device uses the default settings.')}</p>
          <div className="row">
            <a className="btn" href="#/calibrate">{t('Calibrate')}</a>
            <button className="btn" onClick={() => { setSettings({ calibration: {} }); toast(t('Back to the default settings.'), 'good'); }}>{t('Reset calibration')}</button>
          </div>
          <Switch checked={settings.scannerDebug} onChange={(v) => setSettings({ scannerDebug: v })} label={t('Scanner debug')} hint={t('Shows corner squares found, px per mm, paper and background brightness and cell counts on the camera picture. No names or card data.')} />
        </div>
        <div className="panel stack">
          <h2>Data on this device</h2>
          <p className="small ui muted">{t('Cards, receipts, members and crew are stored only in this browser. Export the ledger first if you need a copy.')}</p>
          <div><button className="btn danger" onClick={() => { if (confirm(t('Delete all cards, receipts, members, crew and settings from this device? This cannot be undone.'))) { clearAll(); location.reload(); } }}>{t('Clear all data')}</button></div>
        </div>
      </div>
    </div>
  );
}
