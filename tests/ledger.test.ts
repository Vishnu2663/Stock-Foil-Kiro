// Phase 8 properties: hash chain, paid status, certificates, history totals, carry-forward.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { appendReceipt, verifyChain, buildHistory, type Receipt, type ReceiptData, type Verdict } from '../src/core/history';
import { paidInfo, carryForward } from '../src/core/settlement';
import { buildCertificate, verifyCertificate, type Certificate } from '../src/store/certificate';
import { ledgerToCSV, ledgerFromCSV, sanitizeSettings, DEFAULT_SETTINGS } from '../src/store/index';
import { base32, runs } from './helpers';

const verdicts: Verdict[] = ['genuine-consistent', 'genuine-disputed', 'review', 'inconclusive', 'pair-mismatch', 'paid'];

const dataArb: fc.Arbitrary<ReceiptData> = fc.record({
  at: fc.integer({ min: 1.7e12, max: 1.9e12 }).map((t) => new Date(t).toISOString()),
  cardId: fc.constantFrom('AAAA1111', 'BBBB2222', 'CCCC3333'),
  month: fc.constantFrom('2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'),
  worker: fc.constantFrom('Asha', 'Ravi'),
  employer: fc.constant('Kumar Builders'),
  verdict: fc.constantFrom(...verdicts),
  agreedDays: fc.uniqueArray(fc.integer({ min: 1, max: 31 }), { maxLength: 8 }).map((a) => a.sort((x, y) => x - y)),
  stockOnlyDays: fc.uniqueArray(fc.integer({ min: 1, max: 31 }), { maxLength: 2 }),
  foilOnlyDays: fc.uniqueArray(fc.integer({ min: 1, max: 31 }), { maxLength: 2 }),
  agreedAdv: fc.integer({ min: 0, max: 5 }),
  netMinor: fc.integer({ min: -100000, max: 2_000_000 }),
  disputedMinor: fc.integer({ min: 0, max: 100000 }),
  currency: fc.constant('INR'),
  rateChange: fc.option(fc.record({ fromDay: fc.integer({ min: 1, max: 31 }), rateMinor: fc.integer({ min: 0, max: 200000 }) }), { nil: undefined }),
  halfUnits: fc.option(fc.integer({ min: 0, max: 62 }), { nil: undefined }),
});

const chainArb = fc.array(dataArb, { minLength: 1, maxLength: 12 }).map((ds) => ds.reduce<Receipt[]>((c, d) => appendReceipt(c, d), []));

describe('ledger-and-money: chain', () => {
  it('an intact chain verifies, and survives CSV and JSON round-trips', () => {
    fc.assert(
      fc.property(chainArb, (chain) => {
        expect(verifyChain(chain)).toBe(-1);
        expect(verifyChain(JSON.parse(JSON.stringify(chain)))).toBe(-1);
        expect(verifyChain(ledgerFromCSV(ledgerToCSV(chain)))).toBe(-1);
      }),
      runs(),
    );
  });

  it('breaks at the right place on any edit, removal or reorder', () => {
    fc.assert(
      fc.property(chainArb, fc.nat(), fc.constantFrom('edit', 'remove', 'swap'), fc.constantFrom('netMinor', 'agreedDays', 'worker', 'verdict', 'month', 'at'), (chain, n, op, field) => {
        const i = n % chain.length;
        const c = chain.map((r) => ({ ...r }));
        if (op === 'edit') {
          const r = c[i] as unknown as Record<string, unknown>;
          if (field === 'netMinor') r.netMinor = (r.netMinor as number) + 1;
          else if (field === 'agreedDays') r.agreedDays = [...(r.agreedDays as number[]), 32];
          else if (field === 'worker') r.worker = (r.worker as string) + 'x';
          else if (field === 'verdict') r.verdict = r.verdict === 'paid' ? 'review' : 'paid';
          else if (field === 'month') r.month = r.month === '2026-12' ? '2026-11' : '2026-12';
          else r.at = 'x' + r.at;
          expect(verifyChain(c)).toBe(i);
        } else if (op === 'remove') {
          if (i === c.length - 1) { c.pop(); expect(verifyChain(c)).toBe(-1); return; } // removing the tail is caught by the head
          c.splice(i, 1);
          expect(verifyChain(c)).toBe(i);
        } else {
          if (c.length < 2) return;
          const j = (i + 1) % c.length;
          const a = Math.min(i, j), b = Math.max(i, j);
          [c[a], c[b]] = [c[b], c[a]];
          expect(verifyChain(c)).toBe(a);
        }
      }),
      runs(Math.max(60, 15 * 4)),
    );
  });

  it('the latest payment wins and a changed amount is flagged', () => {
    fc.assert(
      fc.property(chainArb, fc.integer({ min: 0, max: 1e6 }), fc.integer({ min: 0, max: 1e6 }), (chain, a, b) => {
        let c = appendReceipt(chain, { ...chain[0], verdict: 'paid', netMinor: a, cardId: 'ZZZZ9999' });
        c = appendReceipt(c, { ...chain[0], verdict: 'paid', netMinor: b, cardId: 'ZZZZ9999' });
        const info = paidInfo(c, 'ZZZZ9999', a)!;
        expect(info.paid.netMinor).toBe(b);
        expect(info.changed).toBe(a !== b);
        expect(paidInfo(c, 'NOPE0000')).toBeNull();
      }),
      runs(),
    );
  });
});

describe('ledger-and-money: certificates', () => {
  const counted = dataArb.map((d) => ({ ...d, verdict: 'genuine-consistent' as Verdict, worker: 'Asha' }));
  const certChain = fc.array(counted, { minLength: 1, maxLength: 10 }).map((ds) => ds.reduce<Receipt[]>((c, d) => appendReceipt(c, d), []));

  it('verify against their own ledger and fail on any tampering', () => {
    fc.assert(
      fc.property(certChain, fc.constantFrom('inflate-days', 'inflate-net', 'invent-month', 'edit-receipt', 'delete-receipt', 'total'), fc.nat(), (chain, how, n) => {
        const cert = buildCertificate(chain, 'Asha', 'Kumar Builders')!;
        expect(cert).not.toBeNull();
        expect(cert.months.length).toBeLessThanOrEqual(6);
        expect(verifyCertificate(cert, chain).ok).toBe(true);
        const bad: Certificate = JSON.parse(JSON.stringify(cert));
        let ledger = chain.map((r) => ({ ...r }));
        const k = n % bad.months.length;
        if (how === 'inflate-days') { bad.months[k].days += 1; bad.totalDays += 1; }
        if (how === 'inflate-net') { bad.months[k].net += 100; bad.totalNet += 100; }
        if (how === 'invent-month') bad.months.push({ m: '2027-01', days: 20, adv: 0, net: 1_000_000, h: 'deadbeef' });
        if (how === 'total') bad.totalNet += 1;
        if (how === 'edit-receipt') {
          const idx = ledger.findIndex((r) => r.hash.slice(0, 8) === cert.months[k].h);
          ledger[idx] = { ...ledger[idx], netMinor: ledger[idx].netMinor + 500 };
        }
        if (how === 'delete-receipt') {
          const idx = ledger.findIndex((r) => r.hash.slice(0, 8) === cert.months[k].h);
          ledger = ledger.filter((_, j) => j !== idx);
        }
        expect(verifyCertificate(bad, ledger).ok).toBe(false);
      }),
      runs(Math.max(60, 15 * 4)),
    );
  });
});

describe('ledger-and-money: history and carry', () => {
  it('history totals add up', () => {
    fc.assert(
      fc.property(chainArb, (chain) => {
        const months = buildHistory(chain);
        for (const m of months) {
          for (const [cur, t] of Object.entries(m.totals)) {
            expect(t.all).toBe(t.paid + t.unpaid);
            expect(t.all).toBe(m.rows.filter((r) => r.currency === cur).reduce((s, r) => s + r.scan.netMinor, 0));
          }
        }
        const rows = months.flatMap((m) => m.rows);
        expect(new Set(rows.map((r) => r.cardId)).size).toBe(rows.length);
        const paid = buildHistory(chain, { status: 'paid' }).flatMap((m) => m.rows).length;
        const unpaid = buildHistory(chain, { status: 'unpaid' }).flatMap((m) => m.rows).length;
        expect(paid + unpaid).toBe(rows.length);
      }),
      runs(),
    );
  });

  it('carry comes only from the previous month latest scan, never from payment records', () => {
    fc.assert(
      fc.property(base32(8), fc.integer({ min: -50000, max: 50000 }), fc.integer({ min: -50000, max: 50000 }), (id, n1, n2) => {
        const base: ReceiptData = { at: '2026-03-31T10:00:00Z', cardId: id, month: '2026-03', worker: 'Asha', employer: 'Kumar', verdict: 'genuine-consistent', agreedDays: [], stockOnlyDays: [], foilOnlyDays: [], agreedAdv: 0, netMinor: n1, disputedMinor: 0, currency: 'INR' };
        let c = appendReceipt([], base);
        c = appendReceipt(c, { ...base, netMinor: n2 });
        c = appendReceipt(c, { ...base, verdict: 'paid', netMinor: -99999 });
        expect(carryForward(c, 'ASHA', 'kumar', 2026, 4)).toBe(n2 < 0 ? n2 : 0);
        expect(carryForward(c, 'Asha', 'Kumar', 2026, 5)).toBe(0);
      }),
      runs(),
    );
  });
});

describe('foundation: settings', () => {
  it('sanitizeSettings never throws and always returns the default types', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const s = sanitizeSettings(raw);
        for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) expect(typeof s[k]).toBe(typeof DEFAULT_SETTINGS[k]);
      }),
      runs(300),
    );
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const custom = { ...DEFAULT_SETTINGS, lang: 'ta', simple: true, speakRate: 1.1, scannerDebug: true, sounds: false, calibration: { punchRatio: 0.6, alignTolMm: 1.4 } };
    expect(sanitizeSettings(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
    // calibration saved under the earlier names is still read
    expect(sanitizeSettings({ calibration: { threshold: 0.58, tolerance: 1.5 } }).calibration).toEqual({ punchRatio: 0.58, alignTolMm: 1.5 });
  });
});
