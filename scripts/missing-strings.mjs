#!/usr/bin/env node
// Writes i18n-todo/<lang>.json: the English strings each pack is missing (for the translator agent),
// and drops stale keys that are no longer used. Usage: node scripts/missing-strings.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { allStrings, LANGS } from './check-ui-pack.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const keys = allStrings();
mkdirSync(join(ROOT, 'i18n-todo'), { recursive: true });
for (const lang of LANGS) {
  const p = join(ROOT, `src/i18n/ui/${lang}.json`);
  const pack = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  const kept = Object.fromEntries(Object.entries(pack).filter(([k]) => k.startsWith('_') || keys.includes(k)));
  writeFileSync(p, JSON.stringify(kept, null, 2) + '\n');
  const missing = keys.filter((k) => typeof kept[k] !== 'string');
  writeFileSync(join(ROOT, `i18n-todo/${lang}.json`), JSON.stringify(missing, null, 1) + '\n');
  console.log(`${lang}: ${missing.length} missing, ${Object.keys(pack).length - Object.keys(kept).length} stale removed`);
}
