import { useMemo, useState } from 'react';
import { appendWage, wagesOf } from '../../core/members';
import type { WageEntry } from '../../core/wages';
import { Party } from '../components/Party';
import { useApp } from '../ctx';
import { Field, MonthPicker, Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { loadMembers, saveMembers, loadCards, upsertCards, loadLedger, download } from '../../store/index';
import { bulkCreate, cardCounts, membersWithoutCard, type Member } from '../../core/members';
import { carryForward } from '../../core/settlement';
import { cleanName, clampAmount, parseMajor, CURRENCIES, formatMoney, MONTH_NAMES } from '../../core/card';
import { sheetSvg } from '../../render/sheet';
import { sheetsToPdf } from '../imageIO';
import { UI_LANGS } from '../../i18n/index';
import { Select } from '../components/Select';
import { Empty } from '../components/Empty';

const blank = { name: '', employer: '', rate: '500', adv: '100', currency: 'INR', lang: 'en', halves: false, discs: false };

/** The wage history as a row of chips: ₹700 → ₹750 from 16 Nov. */
function WageHistory({ m }: { m: Member }) {
  const h = wagesOf(m);
  if (h.length < 2) return null;
  const fmt = (e: WageEntry) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(e.fromYear, e.fromMonth - 1, e.fromDay)));
  return (
    <span className="wage-hist" data-notranslate>
      {h.map((e, i) => (
        <span key={i} className="wh-chip">{i > 0 && <span className="wh-arrow">→</span>}{formatMoney(e.rateMinor, m.currency)}<small>{fmt(e)}</small></span>
      ))}
    </span>
  );
}

export default function Members() {
  const { t, toast, startCard } = useApp();
  const now = new Date();
  const [members, setMembers] = useState<Member[]>(loadMembers);
  const [cardsVersion, setCardsVersion] = useState(0);
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = new Date();
  const [wageFrom, setWageFrom] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
  const cards = useMemo(() => loadCards(), [cardsVersion]);
  const counts = useMemo(() => cardCounts(members, cards, ym.year, ym.month), [members, cards, ym]);
  const missing = useMemo(() => membersWithoutCard(members, cards, ym.year, ym.month), [members, cards, ym]);

  const persist = (m: Member[]) => { setMembers(m); saveMembers(m); };

  const submit = () => {
    const name = cleanName(form.name), employer = cleanName(form.employer);
    if (!name || !employer) { toast(t('Please type the name and the employer.'), 'warn'); return; }
    const rate = parseMajor(form.rate), adv = parseMajor(form.adv);
    if ((Number.isFinite(rate) && rate > 200000) || (Number.isFinite(adv) && adv > 200000)) toast(t('Values above 2,000 snap back to 2,000.'), 'warn');
    const row = {
      name, employer, rateMinor: clampAmount(rate), advMinor: clampAmount(adv), currency: form.currency, lang: form.lang,
      halves: form.halves || undefined, discs: form.discs || undefined,
    };
    if (editing) {
      // a wage change is APPENDED to the history from the chosen date; history is never overwritten
      persist(members.map((m) => {
        if (m.id !== editing) return m;
        const { rateMinor, advMinor, ...rest } = row;
        let next: Member = { ...m, ...rest };
        if (rateMinor !== m.rateMinor || advMinor !== m.advMinor) {
          const [y, mo, d] = wageFrom.split('-').map(Number);
          next = appendWage(next, { fromYear: y, fromMonth: mo, fromDay: d, rateMinor, advMinor });
        }
        return next;
      }));
    }
    else persist([...members, { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString(), ...row }]);
    setForm(blank);
    setEditing(null);
    toast(editing ? t('Member updated. The new wage applies to future cards.') : t('Member added.'), 'good');
  };

  const edit = (m: Member) => {
    setEditing(m.id);
    setForm({ name: m.name, employer: m.employer, rate: String(m.rateMinor / 100), adv: String(m.advMinor / 100), currency: m.currency, lang: m.lang, halves: !!m.halves, discs: !!m.discs });
  };

  const remove = (m: Member) => {
    if (!confirm(t('Remove {0} from the roster? Their cards and receipts stay.', m.name))) return;
    persist(members.filter((x) => x.id !== m.id));
  };

  const bulk = async () => {
    const ledger = loadLedger();
    const created = bulkCreate(members, loadCards(), ym.year, ym.month, { carryFor: (m) => carryForward(ledger, m.name, m.employer, ym.year, ym.month) });
    if (!created.length) { toast(t('Every member already has a card this month.'), 'info'); return; }
    setBusy(true);
    try {
      upsertCards(created);
      setCardsVersion((v) => v + 1);
      const pdf = await sheetsToPdf(created.map((c) => sheetSvg(c)));
      download(`stock-and-foil-${ym.year}-${String(ym.month).padStart(2, '0')}.pdf`, pdf);
      toast(t('{0} cards created in one PDF.', created.length), 'good');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h1>Members</h1>
      <p className="lead">The people you create cards for. Add each worker once, then make their card each month in one click, or make everyone’s at once.</p>
      <div className="grid cols-3">
        <div className="panel stat"><div className="kicker">MEMBERS</div><div className="big">{members.length}</div></div>
        <div className="panel stat"><div className="kicker">CARDS CREATED (ALL TIME)</div><div className="big">{cards.length}</div></div>
        <div className="panel stat"><div className="kicker" data-notranslate>{MONTH_NAMES[ym.month - 1].toUpperCase()} {ym.year}</div><div className="big">{members.length - missing.length} <small>{t('/ {0} have a card', members.length)}</small></div></div>
      </div>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <form className="panel stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <h2>{editing ? t('Edit member') : t('Add a member')}</h2>
          <div className="grid cols-2">
            <Field label={t('Name')}><input value={form.name} maxLength={18} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t('Employer')}><input value={form.employer} maxLength={18} onChange={(e) => setForm({ ...form, employer: e.target.value })} /></Field>
            <Field label={t('Daily wage')}><input inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field>
            <Field label={t('Advance token value')}><input inputMode="decimal" value={form.adv} onChange={(e) => setForm({ ...form, adv: e.target.value })} /></Field>
            {editing && <Field label={t('From which date?')} hint={t('The new wage applies from this date. Earlier days keep the old wage.')}><input type="date" value={wageFrom} onChange={(e) => setWageFrom(e.target.value)} /></Field>}
            <Field label={t('Currency')}><Select label={t('Currency')} value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} options={CURRENCIES} /></Field>
            <Field label={t('Language')}><Select label={t('Language')} value={form.lang} onChange={(v) => setForm({ ...form, lang: v })} options={UI_LANGS.map((l) => ({ value: l.code, label: l.name }))} /></Field>
          </div>
          <Switch checked={form.halves} onChange={(v) => setForm({ ...form, halves: v })} label={t('Half-day circles')} />
          <Switch checked={form.discs} onChange={(v) => setForm({ ...form, discs: v })} label={t('Printed grey discs')} />
          <div className="row">
            <button className="btn primary" type="submit"><Icon name={editing ? 'check' : 'plus'} /> {editing ? t('Save member') : t('Add member')}</button>
            {editing && <button className="btn ghost" type="button" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}
          </div>
        </form>
        <div className="panel stack">
          <h2>Create cards for everyone</h2>
          <MonthPicker year={ym.year} month={ym.month} onChange={(year, month) => setYm({ year, month })} />
          <p>{t('{0} of {1} members have a card this month.', members.length - missing.length, members.length)}</p>
          <button className="btn primary" onClick={bulk} disabled={busy || missing.length === 0}><Icon name="pdf" /> {t('Create {0} cards + one PDF', missing.length)}</button>
          <p className="small muted">Each member without a card this month gets one unique card, with their carried balance, half-day circles and grey discs. Running it again never makes duplicates.</p>
        </div>
      </div>
      <div className="panel">
        <h2>All members</h2>
        {members.length === 0 ? <Empty>No members yet. Add the first one above.</Empty> : (
          <div className="table-wrap">
            <table className="table stackable">
              <thead><tr><th>Name</th><th>Employer</th><th className="num">Wage</th><th className="num">Advance</th><th>Language</th><th className="num">Cards</th><th className="num">This month</th><th>Actions</th></tr></thead>
              <tbody>
                {members.map((m) => {
                  const c = counts.get(m.id) ?? { all: 0, month: 0 };
                  return (
                    <tr key={m.id}>
                      <td data-label={t('Name')}><Party role="worker" name={m.name} size={30} compact /></td>
                      <td data-label={t('Employer')}><Party role="employer" name={m.employer} size={30} compact /></td>
                      <td data-label={t('Wage')} className="num" data-notranslate>{formatMoney(m.rateMinor, m.currency)}<WageHistory m={m} /></td>
                      <td data-label={t('Advance')} className="num" data-notranslate>{formatMoney(m.advMinor, m.currency)}</td>
                      <td data-label={t('Language')}>{UI_LANGS.find((l) => l.code === m.lang)?.name ?? m.lang}</td>
                      <td data-label={t('Cards')} className="num">{c.all}</td>
                      <td data-label={t('This month')} className="num">{c.month}</td>
                      <td data-label={t('Actions')}>
                        <div className="row">
                          <button className="btn small" onClick={() => startCard({ memberId: m.id, worker: m.name, employer: m.employer, rateMinor: m.rateMinor, advMinor: m.advMinor, currency: m.currency, lang: m.lang, year: ym.year, month: ym.month, halves: m.halves, discs: m.discs, carryMinor: carryForward(loadLedger(), m.name, m.employer, ym.year, ym.month) })}><Icon name="card" /> New card</button>
                          <button className="btn small" onClick={() => edit(m)} aria-label={t('Edit {0}', m.name)}><Icon name="edit" /></button>
                          <button className="btn small" onClick={() => remove(m)} aria-label={t('Remove {0}', m.name)}><Icon name="trash" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
