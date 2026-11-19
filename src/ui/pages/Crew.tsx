import { useMemo, useState } from 'react';
import { Party } from '../components/Party';
import { useApp } from '../ctx';
import { Icon } from '../components/Icon';
import { Banknote } from '../components/Banknote';
import { loadCrew, saveCrew, toCSV, download, type CrewRow } from '../../store/index';
import { cashBreakdown, combineCash } from '../../core/cash';
import { formatMoney } from '../../core/card';
import { printHTML } from '../imageIO';
import { Empty } from '../components/Empty';
import { loadLedger } from '../../store/index';
import { ThumbChip } from '../components/ThumbChip';
import { latestPaid } from '../../core/history';

export default function Crew() {
  const ledger = loadLedger();
  const paidOf = (cardId: string) => latestPaid(ledger, cardId) ?? null;
  const { t, toast } = useApp();
  const [rows, setRows] = useState<CrewRow[]>(loadCrew);
  const persist = (r: CrewRow[]) => { setRows(r); saveCrew(r); };
  const byCur = useMemo(() => {
    const m = new Map<string, CrewRow[]>();
    for (const r of rows) m.set(r.currency, [...(m.get(r.currency) ?? []), r]);
    return [...m.entries()];
  }, [rows]);

  const csv = () => {
    download('crew-payroll.csv', toCSV([
      ['Worker', 'Employer', 'Month', 'Agreed days', 'Net (minor)', 'Currency', 'Disputed (excluded, minor)', 'Notes'],
      ...rows.map((r) => [r.worker, r.employer, r.month, r.agreedDays, r.netMinor, r.currency, r.disputedMinor,
        cashBreakdown(r.netMinor, r.currency).notes.map((n) => `${n.value}x${n.count}`).join(' ')]),
    ]), 'text/csv');
  };

  return (
    <div className="stack">
      <h1>Crew payroll</h1>
      <p className="lead" style={{ maxWidth: 540 }}>Scan each worker’s pair on Payday scan, press “Add to crew payroll”, and get one sheet: who to pay, how much, and exactly which notes to bring.</p>
      <div className="row crew-actions">
        <a className="btn primary" href="#/scan">📷 {t('Scan next worker')}</a>
        <button className="btn" onClick={csv} disabled={!rows.length}>⬇ CSV</button>
        <button className="btn" onClick={() => printHTML(document.getElementById('crew-print')?.innerHTML ?? '', 'slip')} disabled={!rows.length}>🖨️ {t('Print sheet')}</button>
        <button className="btn ghost" onClick={() => { if (confirm(t('Clear the whole crew list?'))) { persist([]); toast(t('Crew cleared.')); } }} disabled={!rows.length}>{t('Clear')}</button>
      </div>
      {rows.length === 0 ? (
        <Empty action={<a className="btn primary" href="#/scan">📷 Payday scan</a>}>No workers yet. Scan a pair, then press <span aria-hidden="true">➕</span> <b>Add to crew payroll</b> on the result.</Empty>
      ) : (
        <div id="crew-print" className="stack">
          {byCur.map(([cur, list]) => {
            const total = combineCash(list.map((r) => cashBreakdown(r.netMinor, cur)), cur);
            return (
              <div key={cur} className="panel">
                <div className="table-wrap">
                  <table className="table stackable">
                    <thead><tr><th>Name</th><th className="num">Agreed days</th><th className="num">Net</th><th>Notes</th><th className="num">Disputed (excluded)</th><th><span className="sr-only">Remove</span></th></tr></thead>
                    <tbody>
                      {list.map((r) => {
                        const b = cashBreakdown(r.netMinor, cur);
                        return (
                          <tr key={r.id}>
                            <td data-label={t('Name')}><Party role="worker" name={r.worker} size={30} compact /> <ThumbChip rec={paidOf(r.cardId)} /><div className="small muted" style={{ marginTop: 4 }}><Party role="employer" name={r.employer} size={22} compact /> · <span className="date">{r.month}</span></div></td>
                            <td data-label={t('Agreed days')} className="num">{r.agreedDays}</td>
                            <td data-label={t('Net')} className="num" data-notranslate>{formatMoney(r.netMinor, cur)}</td>
                            <td data-label={t('Notes')} data-notranslate>{b.notes.map((n) => `${n.value}×${n.count}`).join('  ')}{b.remainderMinor > 0 ? ` + ${formatMoney(b.remainderMinor, cur)}` : ''}{r.netMinor < 0 ? '—' : ''}</td>
                            <td data-label={t('Disputed (excluded)')} className="num" data-notranslate>{r.disputedMinor ? formatMoney(r.disputedMinor, cur) : '—'}</td>
                            <td><button className="btn small" aria-label={t('Remove {0}', r.worker)} onClick={() => persist(rows.filter((x) => x.id !== r.id))}><Icon name="trash" /></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <hr />
                <div className="spread">
                  <h3 style={{ margin: 0 }}>Total cash to bring</h3>
                  <span className="total-big" data-notranslate style={{ fontSize: 34 }}>{formatMoney(list.reduce((s, r) => s + Math.max(0, r.netMinor), 0), cur)}</span>
                </div>
                <div className="notes" style={{ marginTop: 10 }} aria-label={t('Note mix')}>
                  {total.notes.map((n) => <span key={n.value} className="note-pic"><Banknote value={n.value} currency={cur} /><span data-notranslate>× {n.count}</span></span>)}
                  {total.remainderMinor > 0 && <span className="note-pic" data-notranslate>+ {formatMoney(total.remainderMinor, cur)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
