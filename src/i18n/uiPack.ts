// UI translation packs: flat {"English text": "translation"} with {0} templates.
const loaders = import.meta.glob<{ default: Record<string, string> }>('./ui/*.json');

export type Pack = Record<string, string>;

interface Compiled { exact: Map<string, string>; templates: { re: RegExp; to: string; n: number }[]; values: Set<string> }

const cache = new Map<string, Compiled>();
let current: Compiled = compile({});
let currentLang = 'en';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compile(pack: Pack): Compiled {
  const exact = new Map<string, string>();
  const templates: Compiled['templates'] = [];
  const values = new Set<string>();
  for (const [k, v] of Object.entries(pack)) {
    if (!v || k.startsWith('_')) continue;
    values.add(v);
    if (/\{\d+\}/.test(k)) {
      const parts = k.split(/(\{\d+\})/);
      let n = 0;
      const order: number[] = [];
      const src = parts.map((p) => {
        const m = /^\{(\d+)\}$/.exec(p);
        if (m) { order.push(+m[1]); n++; return '(.+?)'; }
        return escapeRe(p);
      }).join('');
      const to = v.replace(/\{(\d+)\}/g, (_, i) => `\u0000${order.indexOf(+i)}\u0000`);
      templates.push({ re: new RegExp('^' + src + '$', 's'), to, n });
    } else exact.set(k, v);
  }
  templates.sort((a, b) => b.re.source.length - a.re.source.length);
  return { exact, templates, values };
}

export function translateWith(c: Compiled, s: string): string | null {
  const hit = c.exact.get(s);
  if (hit !== undefined) return hit;
  for (const t of c.templates) {
    const m = t.re.exec(s);
    if (m) return t.to.replace(/\u0000(\d+)\u0000/g, (_, i) => m[+i + 1] ?? '');
  }
  return null;
}

export async function loadPack(lang: string): Promise<Compiled> {
  if (lang === 'en') return compile({});
  const hit = cache.get(lang);
  if (hit) return hit;
  let pack: Pack = {};
  const loader = loaders[`./ui/${lang}.json`];
  if (loader) {
    try { pack = (await loader()).default; } catch { pack = {}; }
  }
  try {
    const extra = localStorage.getItem('sf.pack.' + lang);
    if (extra) pack = { ...pack, ...JSON.parse(extra) };
  } catch { /* ignore */ }
  const c = compile(pack);
  cache.set(lang, c);
  return c;
}

export function setCurrent(lang: string, c: Compiled) {
  currentLang = lang;
  current = c;
}

export const currentPack = () => current;
export const currentLangCode = () => currentLang;

/** Translate a whole English string (with {0} templates already filled) using the current pack. */
export function tr(s: string): string {
  if (currentLang === 'en') return s;
  return translateWith(current, s) ?? s;
}

export function format(s: string, ...args: (string | number)[]): string {
  return s.replace(/\{(\d+)\}/g, (m, i) => (args[+i] !== undefined ? String(args[+i]) : m));
}

/** t(): translate the template, then fill the placeholders. */
export function t(s: string, ...args: (string | number)[]): string {
  if (currentLang === 'en') return format(s, ...args);
  const hit = current.exact.get(s);
  if (hit !== undefined) return format(hit, ...args);
  return tr(format(s, ...args));
}

export function forgetPack(lang: string) {
  cache.delete(lang);
}
