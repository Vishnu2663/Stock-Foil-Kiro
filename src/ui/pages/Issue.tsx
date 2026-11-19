import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Party';
import { useApp } from '../ctx';
import { Field, MonthPicker, OptionCard, SectionHead } from '../components/Controls';
import {
  makeCard, newCardId, parseMajor, clampAmount, clampCarry, CURRENCIES, MAX_AMOUNT, formatCode, cardCode, formatMoney,
  type CardSpec, type NewCardInput,
} from '../../core/card';
import { newPairing } from '../../core/pairing';
import { sheetSvg } from '../../render/sheet';
import { loadCards, upsertCard, readJSON, removeKey, KEYS, loadLedger, download } from '../../store/index';
import { carryForward } from '../../core/settlement';
import { printHTML, sheetsToPdf } from '../imageIO';
import { UI_LANGS } from '../../i18n/index';

const major = (minor: number) => (minor / 100).toFixed(2).replace(/\.00$/, '');

interface Form {
  worker: string; employer: string; year: number; month: number; rate: string; adv: string; currency: string; lang: string;
  pairing: boolean; halves: boolean; discs: boolean; carryOn: boolean; carry: string;
}

function initialForm(): { form: Form; editId?: string; memberId?: string } {
  const now = new Date();
  const pre = readJSON<(Partial<NewCardInput> & { editId?: string }) | null>(KEYS.prefill, null);
  removeKey(KEYS.prefill);
  const f: Form = {
    worker: '', employer: '', year: now.getFullYear(), month: now.getMonth() + 1, rate: '500', adv: '100', currency: 'INR', lang: 'en',
    pairing: true, halves: true, discs: true, carryOn: false, carry: '',
  };
  if (pre) {
    if (pre.worker !== undefined) f.worker = pre.worker;
    if (pre.employer !== undefined) f.employer = pre.employer;
    if (pre.year) f.year = pre.year;
    if (pre.month) f.month = pre.month;
    if (pre.rateMinor !== undefined) f.rate = major(pre.rateMinor);
    if (pre.advMinor !== undefined) f.adv = major(pre.advMinor);
    if (pre.currency) f.currency = pre.currency;
    if (pre.lang) f.lang = pre.lang;
    if (pre.pairing !== undefined) f.pairing = pre.pairing;
    f.halves = !!pre.halves;
    f.discs = !!pre.discs;
    if (pre.carryMinor) { f.carryOn = true; f.carry = major(pre.carryMinor); }
  }
  return { form: f, editId: pre?.editId, memberId: pre?.memberId };
}

export default function Issue() {
  const { t, toast } = useApp();
  const [{ form: f0, editId: e0, memberId: m0 }] = useState(initialForm);
  const [memberId, setMemberId] = useState<string | undefined>(m0);
  const [form, setForm] = useState<Form>(f0);
  const [editId, setEditId] = useState<string | undefined>(e0);
  const [id, setId] = useState(() => newCardId());
  const [pairing, setPairing] = useState(() => newPairing());
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const on = () => {
      const { form: f, editId: e, memberId: mid } = initialForm();
      setMemberId(mid);
      setForm(f); setEditId(e); setId(newCardId()); setPairing(newPairing()); setSaved(null);
    };
    window.addEventListener('sf-prefill', on);
    return () => window.removeEventListener('sf-prefill', on);
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((x) => ({ ...x, [k]: v })); setSaved(null); };

  const snap = (k: 'rate' | 'adv') => {
    const v = parseMajor(form[k]);
    if (!Number.isFinite(v) || v < 0) { set(k, k === 'rate' ? '500' : '100'); toast(t('Please type an amount like 500.'), 'warn'); return; }
    if (v > MAX_AMOUNT) { set(k, '2000'); toast(t('Values above 2,000 snap back to 2,000.'), 'warn'); }
  };

  const spec: CardSpec = useMemo(() => {
    const s = makeCard({
      worker: form.worker, employer: form.employer, year: form.year, month: form.month,
      rateMinor: clampAmount(parseMajor(form.rate)), advMinor: clampAmount(parseMajor(form.adv)), currency: form.currency, lang: form.lang,
      carryMinor: form.carry.trim() ? clampCarry(parseMajor(form.carry)) : 0, pairing: form.pairing, halves: form.halves, discs: form.discs,
      revisedFrom: editId, memberId,
    }, id);
    if (s.pairing) s.pairing = pairing;
    return s;
  }, [form, id, pairing, editId, memberId]);

  const svg = useMemo(() => sheetSvg(spec), [spec]);
  const suggested = useMemo(() => carryForward(loadLedger(), form.worker, form.employer, form.year, form.month), [form.worker, form.employer, form.year, form.month]);

  const save = () => {
    if (!spec.worker || !spec.employer) { toast(t('Please type the worker and employer names.'), 'warn'); return false; }
    upsertCard(spec);
    setSaved(spec.id);
    toast(editId ? t('Saved as a revised card. The old card was replaced.') : t('Card saved.'), 'good');
    return true;
  };

  const startNew = () => { setId(newCardId()); setPairing(newPairing()); setEditId(undefined); setSaved(null); };

  const edit = editId ? loadCards().find((c) => c.id === editId) : undefined;

  return (
    <div className="stack">
      <h1>New tally card</h1>
      {editId && <div className="note">{t('Editing card {0}. Saving creates a revised card with a new id, cut and pairing code, which replaces the old one.', editId)}{edit ? '' : ''}</div>}
      <div className="grid cols-2 issue-grid" style={{ alignItems: 'start' }}>
        <form className="panel stack issue-form" onSubmit={(e) => { e.preventDefault(); if (save()) printHTML(svg, 'sheet'); }}>
          <SectionHead n={1} title={t('Who is this card for?')} />
          <div className="grid cols-2 role-fields">
          <Field label={<span className="role-lbl worker"><Avatar role="worker" name={form.worker} size={22} /> {t('Worker (gets paid, keeps STOCK)')}</span>}><input value={form.worker} onChange={(e) => set('worker', e.target.value)} maxLength={18} autoComplete="off" placeholder="e.g. Ramesh" /></Field>
          <Field label={<span className="role-lbl employer"><Avatar role="employer" name={form.employer} size={22} /> {t('Employer (pays, keeps FOIL)')}</span>}><input value={form.employer} onChange={(e) => set('employer', e.target.value)} maxLength={18} autoComplete="off" placeholder="e.g. Sharma Builders" /></Field>
          </div>
          <SectionHead n={2} title={t('Month & pay')} />
          <div className="grid cols-2">
            <MonthPicker year={form.year} month={form.month} onChange={(y, m) => { setForm((x) => ({ ...x, year: y, month: m })); setSaved(null); }} />
            <Field label={t('Currency')}>
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </Field>
            <Field label={t('Daily wage')} hint={t('Up to 2,000')}><input inputMode="decimal" value={form.rate} onChange={(e) => set('rate', e.target.value)} onBlur={() => snap('rate')} /></Field>
            <Field label={t('One advance token is worth')} hint={t('Up to 2,000')}><input inputMode="decimal" value={form.adv} onChange={(e) => set('adv', e.target.value)} onBlur={() => snap('adv')} /></Field>
          </div>
          <Field label={t('Balance brought forward (optional)')} hint={t('Negative = the worker still owes this from last month and it is deducted. Positive = the employer still owes it. It is printed on the card and locked into its code, so it cannot be changed later.')}>
            <input inputMode="decimal" value={form.carry} onChange={(e) => { set('carry', e.target.value); set('carryOn', true); }} placeholder="0" />
          </Field>
          {suggested < 0 && !form.carry.trim() && (
            <div className="note">
              {t('Last month ended at {0}.', formatMoney(suggested, form.currency))}{' '}
              <button type="button" className="btn small" onClick={() => setForm((x) => ({ ...x, carryOn: true, carry: major(suggested) }))}>{t('Carry it onto this card')}</button>
            </div>
          )}
          <SectionHead n={3} title={t('Options')} />
          <OptionCard checked={form.pairing} onChange={(v) => set('pairing', v)} title={t('Pairing code')} badge={t('recommended')} text={t('The QR carries a secret that must match the other half, so a sloppy cut never fails a genuine pair and the other half cannot be faked.')} />
          <OptionCard checked={form.halves} onChange={(v) => set('halves', v)} title={t('Half-day circles')} badge={t('two per date')} text={t('Every date gets two punch circles: left for the first half, right for the second. One circle is half a day’s wage, both is a full day, so a half day can be recorded and scanned without doubt.')} />
          <OptionCard checked={form.discs} onChange={(v) => set('discs', v)} title={t('Printed grey discs')} badge={t('any table')} text={t('A grey disc is printed in every circle, and punching removes it. The card can then be photographed on any plain surface, not only a dark cloth.')} />
          <Field label={t('Language on the card and slip')}>
            <select value={form.lang} onChange={(e) => set('lang', e.target.value)}>{UI_LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
          </Field>
          <div className="note">💡 {t('Advances: a worker takes cash early → punch one of the 10 token spots on both halves. Each is worth the token amount above.')}</div>
          <button className="btn primary big" type="submit">🖨️ {t('Print & save')}</button>
          <div className="row">
            <button className="btn" type="button" onClick={() => save()}>💾 {t('Save only')}</button>
            <button className="btn" type="button" onClick={() => download(`stock-and-foil-${spec.id}.svg`, svg, 'image/svg+xml')}>⬇ SVG</button>
            <button className="btn" type="button" onClick={async () => { if (!save()) return; download(`stock-and-foil-${spec.id}.pdf`, await sheetsToPdf([svg])); }}>⬇ {t('PDF (A4)')}</button>
            <button className="btn" type="button" onClick={startNew}>🔀 {t('New wave')}</button>
            {saved && <span className="chip good" role="status">✓ {t('Saved')}</span>}
          </div>
          <details className="tips-details">
            <summary>{t('Printing & punching tips')}</summary>
            <ul className="small">
              <li>{t('Print at 100% (actual size) on A4. Card code {0}.', formatCode(cardCode(spec)))}</li>
              <li>{t('Cut along the wavy line with scissors. A sloppy cut is fine when the pairing code is on.')}</li>
              <li>{t('Each day, stack both halves and punch the day’s circle once through both with a 6 mm punch.')}</li>
              <li>{t('The worker keeps the stock. The employer keeps the foil.')}</li>
            </ul>
          </details>
        </form>
        <div className="stack sheet-col">
          <div className="sheet-preview" aria-label={t('Live preview of the printable sheet')} role="img" data-notranslate dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="small ui muted">{t('Card {0} · its wavy cut is derived from this id, so no two cards fit together.', spec.id)}</p>
        </div>
      </div>
    </div>
  );
}
