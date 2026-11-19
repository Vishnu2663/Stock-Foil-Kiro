// Optional AI (Phase 11). Only anonymised numbers are sent. Every failure falls back to offlineExplain.
import type { Settings } from '../store/index';
import { formatMoney } from '../core/card';
import { explainTemplates } from '../i18n/index';
import type { Verdict } from '../core/history';

export interface PayFacts {
  verdict: Verdict;
  currency: string;
  fullDays: number;
  halfDays: number;
  days: number;
  rateMinor: number;
  advCount: number;
  advMinor: number;
  carryMinor: number;
  netMinor: number;
  disputedMinor: number;
  stockOnlyDays: number[];
  foilOnlyDays: number[];
  rateChange?: { fromDay: number; rateMinor: number };
  /** pay split by wage range (when the wage changed in the month) */
  ranges?: { fromDay: number; toDay: number; rateMinor: number; days: number }[];
}

/** Only numbers and fixed codes. No names, no ids, no photos. */
export function anonymise(f: PayFacts): PayFacts {
  const out: PayFacts = {
    verdict: f.verdict, currency: /^[A-Z]{3}$/.test(f.currency) ? f.currency : 'XXX',
    fullDays: +f.fullDays, halfDays: +f.halfDays, days: +f.days, rateMinor: +f.rateMinor, advCount: +f.advCount,
    advMinor: +f.advMinor, carryMinor: +f.carryMinor, netMinor: +f.netMinor, disputedMinor: +f.disputedMinor,
    stockOnlyDays: f.stockOnlyDays.map(Number), foilOnlyDays: f.foilOnlyDays.map(Number),
  };
  if (f.rateChange) out.rateChange = { fromDay: +f.rateChange.fromDay, rateMinor: +f.rateChange.rateMinor };
  if (f.ranges) out.ranges = f.ranges.map((r) => ({ fromDay: +r.fromDay, toDay: +r.toDay, rateMinor: +r.rateMinor, days: +r.days }));
  return out;
}

const fmt = (s: string, args: (string | number)[]) => s.replace(/\{(\d+)\}/g, (m, i) => (args[+i] !== undefined ? String(args[+i]) : m));

export function sumLine(f: PayFacts): string {
  const m = (x: number) => formatMoney(x, f.currency);
  const days = f.days % 1 ? f.days.toFixed(1) : String(f.days);
  const gross = f.netMinor + f.advCount * f.advMinor - f.carryMinor;
  let s = `${days} × ${m(f.rateMinor)}`;
  if (f.rateChange) s = `${days} (${m(f.rateMinor)} → ${m(f.rateChange.rateMinor)})`;
  if (f.ranges && f.ranges.length > 1) s = f.ranges.map((r) => `${r.days % 1 ? r.days.toFixed(1) : r.days} × ${m(r.rateMinor)} (${r.fromDay}–${r.toDay})`).join(' + ');
  s += ` = ${m(gross)}`;
  if (f.advCount) s += ` − ${f.advCount} × ${m(f.advMinor)}`;
  if (f.carryMinor) s += ` ${f.carryMinor < 0 ? '−' : '+'} ${m(Math.abs(f.carryMinor))}`;
  s += ` = ${m(f.netMinor)}`;
  return s;
}

/** Deterministic explanation that always states the sum and the disputed days. */
export function offlineExplain(f: PayFacts, lang: string): string {
  const T = explainTemplates(lang);
  const lines: string[] = [];
  lines.push(fmt(T.sum, [sumLine(f)]));
  const disputed = [...new Set([...f.stockOnlyDays, ...f.foilOnlyDays])].sort((a, b) => a - b);
  if (disputed.length) {
    lines.push(fmt(T.disputed, [disputed.join(', ')]));
    if (f.stockOnlyDays.length) lines.push(fmt(T.stockOnly, [f.stockOnlyDays.join(', ')]));
    if (f.foilOnlyDays.length) lines.push(fmt(T.foilOnly, [f.foilOnlyDays.join(', ')]));
    lines.push(fmt(T.disputedAmount, [formatMoney(f.disputedMinor, f.currency)]));
  } else lines.push(T.noDispute);
  if (f.netMinor < 0) lines.push(fmt(T.owes, [formatMoney(-f.netMinor, f.currency)]));
  return lines.join('\n');
}

export function buildPrompt(facts: PayFacts, lang: string): string {
  const f = anonymise(facts);
  return [
    `Explain this daily-wage pay result to a worker in plain, short sentences in the language with code "${lang}".`,
    'Use only these numbers. Do not invent anything. Mention the sum and any disputed days.',
    'Money is in minor units (divide by 100).',
    JSON.stringify(f),
  ].join('\n');
}

export interface ExplainResult { text: string; source: 'ai' | 'offline'; note?: string }

type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

interface PromptSession { prompt: (s: string) => Promise<string>; destroy?: () => void }
interface LMFactory { create: (o?: unknown) => Promise<PromptSession>; availability?: () => Promise<string> }

function builtinFactory(): LMFactory | null {
  const g = globalThis as unknown as { LanguageModel?: LMFactory; ai?: { languageModel?: LMFactory } };
  return g.LanguageModel ?? g.ai?.languageModel ?? null;
}

export const builtinAvailable = (): boolean => !!builtinFactory();

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export async function askAI(settings: Pick<Settings, 'aiProvider' | 'customUrl' | 'customModel' | 'customKey'>, prompt: string, fetchImpl?: FetchLike): Promise<string> {
  if (settings.aiProvider === 'off') throw new Error('AI is off');
  if (settings.aiProvider === 'builtin') {
    const f = builtinFactory();
    if (!f) throw new Error('Built-in AI is not available in this browser');
    const s = await withTimeout(f.create(), 20000);
    try { return await withTimeout(s.prompt(prompt), 30000); } finally { s.destroy?.(); }
  }
  if (!/^https:\/\//.test(settings.customUrl)) throw new Error('The endpoint must use https');
  const fx = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const res = await withTimeout(fx(settings.customUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(settings.customKey ? { Authorization: `Bearer ${settings.customKey}` } : {}) },
    body: JSON.stringify({ model: settings.customModel, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }),
  }), 25000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty answer');
  return text;
}

export async function explain(settings: Settings, facts: PayFacts, lang: string, fetchImpl?: FetchLike): Promise<ExplainResult> {
  const offline = offlineExplain(facts, lang);
  if (settings.aiProvider === 'off') return { text: offline, source: 'offline' };
  try {
    const ai = await askAI(settings, buildPrompt(facts, lang), fetchImpl);
    // The sum and disputed days are always shown from the deterministic text, so the numbers are never wrong.
    return { text: ai + '\n\n' + offline, source: 'ai', note: settings.aiNote ? 'AI text. The sum below is calculated on this device.' : undefined };
  } catch (e) {
    return { text: offline, source: 'offline', note: `AI not available (${(e as Error).message}). Showing the offline explanation.` };
  }
}

/** Translate UI strings into an extra language (strings only, no personal data). */
export async function translateStrings(settings: Settings, lang: string, strings: string[], fetchImpl?: FetchLike): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < strings.length; i += 40) {
    const chunk = strings.slice(i, i + 40);
    const prompt = `Translate these app interface strings from English into the language with code "${lang}". Keep {0} and {1} placeholders, numbers and symbols exactly. Reply with only a JSON object mapping each English string to its translation.\n${JSON.stringify(chunk)}`;
    const text = await askAI(settings, prompt, fetchImpl);
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) continue;
    try {
      const j = JSON.parse(m[0]) as Record<string, unknown>;
      for (const k of chunk) {
        const v = j[k];
        if (typeof v !== 'string') continue;
        const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
        if (ph(v) === ph(k)) out[k] = v;
      }
    } catch { /* skip chunk */ }
  }
  return out;
}

export const PRESETS = [
  { name: 'OpenRouter (free models)', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
  { name: 'Gemini (OpenAI-compatible)', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash' },
];
