import { useMemo, useState } from 'react';
import { Party } from '../components/Party';
import { useApp } from '../ctx';
import { MonthPicker, Switch } from '../components/Controls';
import { loadLedger, loadOwed, download, toCSV } from '../../store/index';
import { buildHistory, receiptDays, verifyChain, type HistoryFilter } from '../../core/history';
import { formatMoney, monthKey, MONTH_NAMES } from '../../core/card';
import { VERDICT_LABEL, verdictTone } from '../../vision/pair';

export default function History() {
  const { t } = useApp();
  const now = new Date();
  const [status, setStatus] = useState<HistoryFilter['status']>('all');
  const [oneMonth, setOneMonth] = useState(false);
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [q, setQ] = useState('');
  const months = useMemo(() => buildHistory(loadLedger(), { status, month: oneMonth ? monthKey(ym.year, ym.month) : undefined, query: q, owed: loadOwed() }), [status, oneMonth, ym, q]);
  const label = (m: string) => { const [y, mm] = m.split('-').map(Number); return `${MONTH_NAMES[mm - 1]} ${y}`; };
  const chainOk = useMemo(() => verifyChain(loadLedger()) < 0, []);
  const csv = () => download('stock-and-foil-history.csv', toCSV([
    ['Month', 'Worker', 'Employer', 'Card', 'Scanned', 'Verdict', 'Days', 'Net (minor)', 'Currency', 'Status', 'Paid on'],
    ...months.flatMap((m) => m.rows.map((r) => [r.month, r.worker, r.employer, r.cardId, r.scan.at, r.scan.verdict, receiptDays(r.scan), r.scan.netMinor, r.currency, r.status, r.paid?.at ?? ''])),
  ]), 'text/csv');
  return (
    <div className="stack">
      <div className="spread page-head" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>🕘 History</h1>
          <p className="lead" style={{ marginBottom: 0, maxWidth: 380 }}>Every payday scan you saved, and whether it was paid or is still yet to pay.</p>
        </div>
        <a href="#/ledger" className={'chain-pill ' + (chainOk ? 'good' : 'bad')}>🔗 {chainOk ? t('Chain intact') : t('Chain broken')}</a>
      </div>
      <div className="row hist-filters" role="group" aria-label={t('Filter')}>
        {(['all', 'unpaid', 'paid', 'unmarked'] as const).map((s) => (
          <button key={s} className="fchip" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === 'all' ? t('All') : s === 'paid' ? '💰 ' + t('Paid') : s === 'unpaid' ? '⏳ ' + t('Yet to pay') : t('Not marked')}
          </button>
        ))}
        <input className="input hist-search" style={{ flex: 1, minWidth: 200 }} placeholder={t('Search name, month or card')} aria-label={t('Search name, month or card')} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn small" onClick={csv} disabled={!months.length}>⬇ CSV</button>
      </div>
      <div className="row">
        <Switch checked={oneMonth} onChange={setOneMonth} label={t('Only one month')} />
        {oneMonth && <div style={{ minWidth: 220 }}><MonthPicker year={ym.year} month={ym.month} onChange={(year, month) => setYm({ year, month })} /></div>}
      </div>
      {months.length === 0 && (
        <div className="panel">
          <h2>Nothing here yet</h2>
          <p className="ui">After a payday scan, press <b>💰 Paid</b> or <b>⏳ Yet to pay</b>. The scan lands here.</p>
          <a className="btn primary" href="#/scan">📷 Payday scan</a>
        </div>
      )}
      {months.map((m) => (
        <section key={m.month} className="panel" data-reveal>
          <div className="spread">
            <h2 style={{ margin: 0 }} data-notranslate>{label(m.month)}</h2>
            <div className="row">
              {Object.entries(m.totals).map(([cur, tt]) => (
                <span key={cur} className="chip" data-notranslate>{cur}: {formatMoney(tt.all, cur)} · {t('Paid')} {formatMoney(tt.paid, cur)} · {t('Yet to pay')} {formatMoney(tt.unpaid, cur)}</span>
              ))}
            </div>
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table stackable">
              <thead><tr><th>Worker</th><th>Employer</th><th>Card</th><th>Scanned</th><th>Verdict</th><th className="num">Days</th><th className="num">Net</th><th>Status</th></tr></thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.cardId}>
                    <td data-label={t('Worker')}><Party role="worker" name={r.worker} size={28} compact /></td>
                    <td data-label={t('Employer')}><Party role="employer" name={r.employer} size={28} compact /></td>
                    <td data-label={t('Card')} data-notranslate className="nowrap">{r.cardId}</td>
                    <td data-label={t('Scanned')} className="date">{new Date(r.scan.at).toLocaleDateString()}</td>
                    <td data-label={t('Verdict')}><span className={'chip ' + verdictTone(r.scan.verdict)}>{t(VERDICT_LABEL[r.scan.verdict])}</span></td>
                    <td data-label={t('Days')} className="num">{receiptDays(r.scan)}</td>
                    <td data-label={t('Net')} className="num" data-notranslate>{formatMoney(r.scan.netMinor, r.currency)}</td>
                    <td data-label={t('Status')}>
                      {r.status === 'paid'
                        ? <span className="chip good">{t('Paid')} <span className="date">{new Date(r.paid!.at).toLocaleDateString()}</span></span>
                        : r.status === 'unpaid'
                          ? <span className="chip warn">⏳ {t('Yet to pay')}</span>
                          : <span className="chip grey">{t('Not marked')}</span>}
                      {r.amountChanged && <span className="chip bad">{t('Amount changed')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
