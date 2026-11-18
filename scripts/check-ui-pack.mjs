#!/usr/bin/env node
// Checks every UI pack against source.json + extra-strings.json: missing strings and broken {0} placeholders.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
export const LANGS = ['hi', 'bn', 'ta', 'es', 'sw'];

export function allStrings() {
  const src = JSON.parse(readFileSync(join(ROOT, 'src/i18n/ui/source.json'), 'utf8'));
  const extra = JSON.parse(readFileSync(join(ROOT, 'scripts/extra-strings.json'), 'utf8'));
  return [...new Set([...Object.keys(src), ...extra.strings])];
}

export const placeholders = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join(',');

export function checkPack(lang, keys = allStrings()) {
  const p = join(ROOT, `src/i18n/ui/${lang}.json`);
  const pack = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  const missing = keys.filter((k) => typeof pack[k] !== 'string' || !pack[k].trim());
  const broken = keys.filter((k) => typeof pack[k] === 'string' && placeholders(pack[k]) !== placeholders(k));
  const stale = Object.keys(pack).filter((k) => !k.startsWith('_') && !keys.includes(k));
  return { lang, total: keys.length, missing, broken, stale };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = allStrings();
  let bad = 0;
  for (const lang of LANGS) {
    const r = checkPack(lang, keys);
    const ok = r.missing.length === 0 && r.broken.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${lang}: ${r.total - r.missing.length}/${r.total} translated, ${r.broken.length} broken placeholders, ${r.stale.length} stale`);
    for (const k of r.missing.slice(0, 15)) console.log('     missing: ' + k);
    if (r.missing.length > 15) console.log(`     … ${r.missing.length - 15} more missing`);
    for (const k of r.broken) console.log('     placeholder: ' + k);
  }
  process.exit(bad ? 1 : 0);
}
