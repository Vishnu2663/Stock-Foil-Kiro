// Income proof certificate (§6.7): build and verify against a ledger export. Pure, no DOM.
import { receiptDays, verifyChain, type Receipt, type Verdict } from '../core/history';
import { normName } from '../core/members';

export interface CertMonth { m: string; days: number; adv: number; net: number; h: string; paid?: boolean }

export interface Certificate {
  v: 1;
  worker: string;
  employer: string;
  currency: string;
  from: string;
  to: string;
  months: CertMonth[];
  totalDays: number;
  totalNet: number;
  head: string;
  at: string;
}

export const COUNTED: Verdict[] = ['genuine-consistent', 'genuine-disputed', 'review', 'inconclusive'];
export const MAX_MONTHS = 6;

export function buildCertificate(chain: Receipt[], worker: string, employer: string, at = new Date().toISOString()): Certificate | null {
  if (!chain.length) return null;
  const w = normName(worker), e = normName(employer);
  const latest = new Map<string, Receipt>();
  for (const r of chain) {
    if (!COUNTED.includes(r.verdict)) continue;
    if (normName(r.worker) !== w || normName(r.employer) !== e) continue;
    latest.set(r.month, r);
  }
  const months = [...latest.keys()].sort().slice(-MAX_MONTHS);
  if (!months.length) return null;
  const rows: CertMonth[] = months.map((m) => {
    const r = latest.get(m)!;
    const paid = chain.some((p) => p.verdict === 'paid' && p.cardId === r.cardId);
    const row: CertMonth = { m, days: receiptDays(r), adv: r.agreedAdv, net: r.netMinor, h: r.hash.slice(0, 8) };
    if (paid) row.paid = true;
    return row;
  });
  const first = latest.get(months[0])!;
  return {
    v: 1, worker: first.worker, employer: first.employer, currency: first.currency,
    from: months[0], to: months[months.length - 1], months: rows,
    totalDays: rows.reduce((s, r) => s + r.days, 0),
    totalNet: rows.reduce((s, r) => s + r.net, 0),
    head: chain[chain.length - 1].hash.slice(0, 16), at,
  };
}

export interface CertCheck { ok: boolean; problems: string[] }

export function verifyCertificate(cert: Certificate, chain: Receipt[]): CertCheck {
  const problems: string[] = [];
  if (!cert || cert.v !== 1 || !Array.isArray(cert.months)) return { ok: false, problems: ['Not a certificate'] };
  const broken = verifyChain(chain);
  if (broken >= 0) problems.push(`The ledger is broken at receipt ${broken + 1}`);
  const headIdx = chain.findIndex((r) => r.hash.slice(0, 16) === cert.head);
  if (headIdx < 0) problems.push('The ledger head does not match this certificate');
  const upto = headIdx >= 0 ? chain.slice(0, headIdx + 1) : chain;
  for (const row of cert.months) {
    const r = upto.find((x) => x.hash.slice(0, 8) === row.h);
    if (!r) { problems.push(`Month ${row.m}: no matching receipt`); continue; }
    if (!COUNTED.includes(r.verdict)) problems.push(`Month ${row.m}: the receipt is not a counted scan`);
    if (r.month !== row.m) problems.push(`Month ${row.m}: the receipt is for ${r.month}`);
    if (normName(r.worker) !== normName(cert.worker) || normName(r.employer) !== normName(cert.employer)) problems.push(`Month ${row.m}: different worker or employer`);
    if (receiptDays(r) !== row.days) problems.push(`Month ${row.m}: days differ`);
    if (r.agreedAdv !== row.adv) problems.push(`Month ${row.m}: advances differ`);
    if (r.netMinor !== row.net) problems.push(`Month ${row.m}: pay differs`);
    if (r.currency !== cert.currency) problems.push(`Month ${row.m}: currency differs`);
    const paid = upto.some((p) => p.verdict === 'paid' && p.cardId === r.cardId);
    if (!!row.paid !== paid) problems.push(`Month ${row.m}: paid status differs`);
  }
  if (new Set(cert.months.map((r) => r.m)).size !== cert.months.length) problems.push('A month appears twice');
  if (cert.months.length > MAX_MONTHS) problems.push('Too many months');
  if (cert.totalDays !== cert.months.reduce((s, r) => s + r.days, 0)) problems.push('Total days do not add up');
  if (cert.totalNet !== cert.months.reduce((s, r) => s + r.net, 0)) problems.push('Total pay does not add up');
  return { ok: problems.length === 0, problems };
}

export const certToText = (c: Certificate): string => JSON.stringify(c);

export function certFromText(text: string): Certificate | null {
  try {
    const c = JSON.parse(text.trim());
    return c && c.v === 1 && Array.isArray(c.months) ? (c as Certificate) : null;
  } catch {
    return null;
  }
}
