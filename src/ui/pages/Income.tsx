import { useMemo, useRef, useState } from 'react';
import { useApp } from '../ctx';
import { Field } from '../components/Controls';
import { Icon } from '../components/Icon';
import { QRImage } from '../components/Tally';
import { loadLedger, ledgerFromCSV } from '../../store/index';
import { buildCertificate, verifyCertificate, certFromText, certToText, COUNTED, type CertCheck } from '../../store/certificate';
import { normName } from '../../core/members';
import { formatMoney, MONTH_NAMES } from '../../core/card';
import type { Receipt } from '../../core/history';
import { printHTML } from '../imageIO';

export default function Income() {
  const { t, toast } = useApp();
  const ledger = useMemo(() => loadLedger(), []);
  const people = useMemo(() => {
    const m = new Map<string, { worker: string; employer: string }>();
    for (const r of ledger) if (COUNTED.includes(r.verdict)) m.set(normName(r.worker) + '|' + normName(r.employer), { worker: r.worker, employer: r.employer });
    return [...m.entries()];
  }, [ledger]);
  const [who, setWho] = useState(people[0]?.[0] ?? '');
  const cert = useMemo(() => {
    const p = people.find(([k]) => k === who)?.[1];
    return p ? buildCertificate(ledger, p.worker, p.employer) : null;
  }, [who, people, ledger]);
  const certRef = useRef<HTMLDivElement>(null);
  const [paste, setPaste] = useState('');
  const [other, setOther] = useState<Receipt[] | null>(null);
  const [res, setRes] = useState<CertCheck | null>(null);
  const label = (m: string) => { const [y, mm] = m.split('-').map(Number); return `${MONTH_NAMES[mm - 1]} ${y}`; };

  const verify = () => {
    const c = certFromText(paste);
    if (!c) { setRes({ ok: false, problems: [t('That is not a certificate.')] }); return; }
    setRes(verifyCertificate(c, other ?? ledger));
  };

  const loadOther = async (f: File) => {
    const text = await f.text();
    try {
      const list = text.trim().startsWith('[') ? JSON.parse(text) : ledgerFromCSV(text);
      if (!Array.isArray(list)) throw new Error('bad');
      setOther(list);
      toast(t('Loaded a ledger with {0} receipts.', list.length), 'good');
    } catch {
      toast(t('That file is not a ledger export.'), 'bad');
    }
  };

  return (
    <div className="stack">
      <h1>Income proof</h1>
      <p className="lead">A one-page certificate of verified work and pay for a loan or rent, backed by the hash-chained ledger.</p>
      <div className="panel stack">
        {people.length === 0 ? <p className="muted">No verified scans yet. The certificate uses genuine scans from the ledger on this device.</p> : (
          <Field label={t('Worker')}>
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              {people.map(([k, p]) => <option key={k} value={k}>{p.worker} · {p.employer}</option>)}
            </select>
          </Field>
        )}
        {cert && (
          <>
            <div ref={certRef}>
              <div className="slip" style={{ background: '#fffdf6' }}>
                <div className="spread">
                  <div>
                    <div className="kicker" style={{ color: '#7a1f1f' }}>STOCK &amp; FOIL · INCOME CERTIFICATE</div>
                    <h2 style={{ margin: 0, color: '#231f1a' }} data-notranslate>{cert.worker}</h2>
                    <div data-notranslate>{cert.employer} · {label(cert.from)} – {label(cert.to)}</div>
                  </div>
                  <QRImage text={certToText(cert)} size={150} label={t('QR code of the certificate')} />
                </div>
                <table className="table" style={{ marginTop: 10, color: '#231f1a' }}>
                  <thead><tr><th>Month</th><th className="num">Days</th><th className="num">Advances</th><th className="num">Agreed pay</th><th>Paid</th><th>Receipt</th></tr></thead>
                  <tbody>
                    {cert.months.map((m) => (
                      <tr key={m.m}>
                        <td className="date" data-notranslate>{label(m.m)}</td>
                        <td className="num">{m.days}</td>
                        <td className="num">{m.adv}</td>
                        <td className="num" data-notranslate>{formatMoney(m.net, cert.currency)}</td>
                        <td>{m.paid ? t('Paid') : t('Yet to pay')}</td>
                        <td data-notranslate><code>{m.h}</code></td>
                      </tr>
                    ))}
                    <tr><td><b>Total</b></td><td className="num"><b>{cert.totalDays}</b></td><td /><td className="num" data-notranslate><b>{formatMoney(cert.totalNet, cert.currency)}</b></td><td /><td /></tr>
                  </tbody>
                </table>
                <p className="small" style={{ marginTop: 8 }}>{t('Ledger head')}: <code data-notranslate>{cert.head}</code> · <span className="date" data-notranslate>{new Date(cert.at).toLocaleDateString()}</span></p>
                <p className="small">{t('To check it: paste this certificate in Stock & Foil (Income proof → Verify) and load the ledger export from the same phone. Inflated figures, invented months and edited or deleted receipts all fail.')}</p>
              </div>
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => printHTML(certRef.current?.innerHTML ?? '', 'slip')}><Icon name="print" /> Print certificate</button>
              <button className="btn" onClick={() => { navigator.clipboard?.writeText(certToText(cert)).then(() => toast(t('Certificate copied.'), 'good'), () => toast(t('Could not copy.'), 'warn')); }}>Copy certificate text</button>
            </div>
          </>
        )}
      </div>
      <div className="panel stack">
        <h2>Verify a certificate</h2>
        <Field label={t('Paste the certificate text')}><textarea value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false} /></Field>
        <div className="row">
          <label className="btn"><Icon name="upload" /> {other ? t('Ledger loaded ({0})', other.length) : t('Load a ledger export')}
            <input type="file" className="sr-only" accept=".json,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadOther(f); e.target.value = ''; }} />
          </label>
          <button className="btn primary" onClick={verify} disabled={!paste.trim()}><Icon name="check" /> Verify</button>
        </div>
        <p className="small muted">{other ? '' : t('Without a loaded export, the ledger on this device is used.')}</p>
        {res && (
          <div className={'note ' + (res.ok ? 'good' : 'bad')}>
            {res.ok ? t('Verified: every month matches a receipt in an intact ledger.') : <>{t('Not verified')}<ul>{res.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></>}
          </div>
        )}
      </div>
    </div>
  );
}
