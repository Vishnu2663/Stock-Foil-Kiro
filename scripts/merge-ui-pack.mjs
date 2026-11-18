#!/usr/bin/env node
// Merge a partial translation into a pack: node scripts/merge-ui-pack.mjs <lang> <partial.json>
// Entries whose {0} placeholders do not match the English are rejected.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const [lang, file] = process.argv.slice(2);
if (!lang || !file) { console.error('usage: node scripts/merge-ui-pack.mjs <lang> <partial.json>'); process.exit(2); }
const ph = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join(',');
const target = join(ROOT, `src/i18n/ui/${lang}.json`);
const pack = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : { _note: 'AI-drafted, native review recommended' };
const part = JSON.parse(readFileSync(file, 'utf8'));
let added = 0, rejected = 0;
for (const [k, v] of Object.entries(part)) {
  if (typeof v !== 'string' || !v.trim()) continue;
  if (ph(k) !== ph(v)) { rejected++; console.log('rejected (placeholders): ' + k); continue; }
  if (pack[k] !== v) { pack[k] = v; added++; }
}
const sorted = Object.fromEntries(Object.keys(pack).sort((a, b) => (a.startsWith('_') ? -1 : b.startsWith('_') ? 1 : a.localeCompare(b))).map((k) => [k, pack[k]]));
writeFileSync(target, JSON.stringify(sorted, null, 2) + '\n');
console.log(`merge-ui-pack: ${lang}: ${added} merged, ${rejected} rejected`);
