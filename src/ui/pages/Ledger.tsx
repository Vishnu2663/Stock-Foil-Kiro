import { useRef, useState } from 'react';
import { Party } from '../components/Party';
import { useApp } from '../ctx';
import { Icon } from '../components/Icon';
import { loadLedger, saveLedger, loadCards, deleteCard, download, ledgerToCSV, ledgerFromCSV, clearAll } from '../../store/index';
import { appendReceipt, verifyChain, type Receipt } from '../../core/history';
import { formatMoney, formatCode, cardCode, MONTH_NAMES } from '../../core/card';
import { VERDICT_LABEL, verdictTone } from '../../vision/pair';
import { sheetSvg } from '../../render/sheet';
import { printHTML } from '../imageIO';

function demoChain(): Receipt[] {
  let c: Receipt[] = [];
  const base = { cardId: 'DEM0CARD', month: '2026-11', worker: 'Meena', employer: 'Ravi Contractor', stockOnlyDays: [], foilOnlyDays: [], disputedMinor: 0, currency: 'INR' };
  c = appendReceipt(c, { ...base, at: '2026-11-30T10:00:00Z', verdict: 'genuine-consistent', agreedDays: [3, 4, 5, 6, 7], agreedAdv: 1, netMinor: 240000 });
  c = appendReceipt(c, { ...base, at: '2026-11-30T10:05:00Z', verdict: 'paid', agreedDays: [3, 4, 5, 6, 7], agreedAdv: 1, netMinor: 240000 });
  c = appendReceipt(c, { ...base, cardId: 'K7M2Q9XA', worker: 'Ravi', at: '2026-11-30T11:00:00Z', verdict: 'genuine-consistent', agreedDays: [1, 2, 3], agreedAdv: 0, netMinor: 150000 });
  return c;
}

export default function Ledger() {
  const { t, toast, startCard } = useApp();
  const [ledger, setLedger] = useState<Receipt[]>(loadLedger);
  const [cards, setCards] = useState(loadCards);
  const [check, setCheck] = useState<{ ok: boolean; at: number } | null>(null);
  const [demo, setDemo] = useState<{ chain: Receipt[]; broken: number; edited: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const runCheck = () => {
    const i = verifyChain(ledger);
    setCheck({ ok: i < 0, at: i });
    toast(i < 0 ? t('The chain is intact: {0} receipts.', ledger.length) : t('The chain is broken at receipt {0}.', i + 1), i < 0 ? 'good' : 'bad');
  };

  const tamper = () => {
    const c = demoChain();
    const edited = c.map((r) => ({ ...r }));
    edited[0].netMinor += 50000; // someone adds a day's pay to an old receipt
    setDemo({ chain: edited, broken: verifyChain(edited), edited: 0 });
  };

  const exportJSON = () => download('stock-and-foil-ledger.json', JSON.stringify(ledger, null, 1), 'application/json');
  const exportCSV = () => download('stock-and-foil-ledger.csv', ledgerToCSV(ledger), 'text/csv');

  const importFile = async (f: File) => {
    const text = await f.text();
    let list: Receipt[] = [];
    try { list = text.trim().startsWith('[') ? JSON.parse(text) : ledgerFromCSV(text); } catch { list = []; }
    if (!Array.isArray(list) || !list.length) { toast(t('That file is not a ledger export.'), 'bad'); return; }
    const broken = verifyChain(list);
    if (broken >= 0 && !confirm(t('This ledger is broken at receipt {0}. Import it anyway?', broken + 1))) return;
    if (ledger.length && !confirm(t('Replace the {0} receipts on this device with {1} imported receipts?', ledger.length, list.length))) return;
    saveLedger(list);
    setLedger(list);
    toast(t('Imported {0} receipts.', list.length), 'good');
  };

  const removeCard = (id: string) => {
    if (!confirm(t('Delete card {0} from this device? Receipts stay in the ledger.', id))) return;
    setCards(deleteCard(id));
  };

  return (
    <div className="stack">
      <h1>Ledger</h1>
      <p className="lead">Stored only on this device. Receipts are chained by SHA-256: change or delete any past receipt and every later link breaks.</p>
      <div className="row">
        <span className={'chip ' + (verifyChain(ledger) < 0 ? 'good' : 'bad')}>✓ {verifyChain(ledger) < 0 ? t('Ledger: chain intact') : t('Ledger: chain broken')}</span>
        <button className="btn" onClick={runCheck}><Icon name="chain" /> Check chain</button>
        <button className="btn" onClick={tamper}>🧪 Tamper test</button>
        <button className="btn" onClick={exportCSV} disabled={!ledger.length}><Icon name="download" /> CSV</button>
        <button className="btn" onClick={exportJSON} disabled={!ledger.length}><Icon name="download" /> JSON</button>
        <input ref={file} type="file" accept=".json,.csv,application/json,text/csv" className="sr-only" aria-label={t('Import a ledger')} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
        <button className="btn" onClick={() => file.current?.click()}><Icon name="upload" /> Import</button>
      </div>
      {check && <div className={'note ' + (check.ok ? 'good' : 'bad')}>{check.ok ? t('The chain is intact: {0} receipts.', ledger.length) : t('The chain is broken at receipt {0}.', check.at + 1)}</div>}
      {demo && (
        <div className="panel">
          <h2>Tamper demo</h2>
          <p>{t('A copy of a small ledger where receipt 1 was edited to add pay. Your real ledger is not touched.')}</p>
          <ul className="checks">
            {demo.chain.map((r, i) => (
              <li key={i}><span className={i < demo.broken || demo.broken < 0 ? 'ok' : 'no'} aria-hidden="true">{i < demo.broken || demo.broken < 0 ? '✔' : '✖'}</span>
                <span data-notranslate>#{r.seq + 1} · {r.worker} · {r.verdict} · {formatMoney(r.netMinor, r.currency)}{i === demo.edited ? ' (edited)' : ''}<span className="detail">{r.hash.slice(0, 16)}…</span></span></li>
            ))}
          </ul>
          <div className="note bad">{t('The chain breaks at receipt {0}: the stored hash no longer matches.', demo.broken + 1)}</div>
        </div>
      )}
      <div className="panel">
        <h2>Payday receipts</h2>
        {ledger.length === 0 ? <p className="muted">No receipts yet.</p> : (
          <div className="table-wrap">
            <table className="table stackable">
              <thead><tr><th>#</th><th>Date</th><th>Card</th><th>Worker</th><th>Month</th><th>Verdict</th><th className="num">Net</th><th>Hash</th></tr></thead>
              <tbody>
                {[...ledger].reverse().map((r) => (
                  <tr key={r.seq}>
                    <td data-label="#">{r.seq + 1}</td>
                    <td data-label={t('Date')} className="date">{new Date(r.at).toLocaleString()}</td>
                    <td data-label={t('Card')} data-notranslate>{r.cardId}</td>
                    <td data-label={t('Worker')}><Party role="worker" name={r.worker} size={26} compact /><div style={{ marginTop: 3 }}><Party role="employer" name={r.employer} size={20} compact /></div></td>
                    <td data-label={t('Month')} className="date">{r.month}</td>
                    <td data-label={t('Verdict')}><span className={'chip ' + verdictTone(r.verdict)}>{t(VERDICT_LABEL[r.verdict])}</span></td>
                    <td data-label={t('Net')} className="num" data-notranslate>{formatMoney(r.netMinor, r.currency)}{r.wage && <div className="chip warn small">{t('wage adjusted')}: {r.wage.ranges.map((g) => `${g.fromDay}–${g.toDay} @ ${formatMoney(g.rateMinor, r.currency)}`).join(', ')}</div>}</td>
                    <td data-label={t('Hash')} data-notranslate><code>{r.hash.slice(0, 10)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="panel">
        <h2>Cards issued</h2>
        {cards.length === 0 ? <p className="muted">No saved cards yet.</p> : (
          <div className="table-wrap">
            <table className="table stackable">
              <thead><tr><th>Card</th><th>Worker</th><th>Employer</th><th>Month</th><th>Code</th><th>Actions</th></tr></thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.id}>
                    <td data-label={t('Card')} data-notranslate>{c.id}{c.revisedFrom ? <div className="small muted">{t('revised from {0}', c.revisedFrom)}</div> : null}</td>
                    <td data-label={t('Worker')} data-notranslate>{c.worker}</td>
                    <td data-label={t('Employer')} data-notranslate>{c.employer}</td>
                    <td data-label={t('Month')} className="date" data-notranslate>{MONTH_NAMES[c.month - 1].slice(0, 3)} {c.year}</td>
                    <td data-label={t('Code')} data-notranslate className="nowrap">{formatCode(cardCode(c))}</td>
                    <td data-label={t('Actions')}>
                      <div className="row">
                        <button className="btn small" onClick={() => printHTML(sheetSvg(c), 'sheet')}><Icon name="print" /> Reprint</button>
                        <button className="btn small" onClick={() => startCard({ editId: c.id, worker: c.worker, employer: c.employer, year: c.year, month: c.month, rateMinor: c.rateMinor, advMinor: c.advMinor, currency: c.currency, lang: c.lang, carryMinor: c.carryMinor, pairing: !!c.pairing, halves: c.halves, discs: c.discs })}><Icon name="edit" /> Edit</button>
                        <button className="btn small" onClick={() => removeCard(c.id)} aria-label={t('Delete card {0}', c.id)}><Icon name="trash" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <button className="link-btn ui small" onClick={() => { if (confirm(t('Delete all cards, receipts, members, crew and settings from this device? This cannot be undone.'))) { clearAll(); location.reload(); } }}>{t('Delete all local data')}</button>
      </div>
    </div>
  );
}
