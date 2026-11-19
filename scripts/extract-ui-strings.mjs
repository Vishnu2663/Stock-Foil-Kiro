#!/usr/bin/env node
// Builds src/i18n/ui/source.json from a TypeScript AST walk of src/ui (and the label tables in src/vision).
// Collected: JSX text, translatable JSX attributes, t('...') calls, and title/hint/label/text object properties.
// Anything inside an element with data-notranslate is skipped.
import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'src/i18n/ui/source.json');
const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'hint']);
const PROPS = new Set(['title', 'hint', 'label', 'text']);
const TABLES = new Set(['VERDICT_LABEL', 'WARNING_TEXT']);
const EXTRA_FILES = ['src/vision/pair.ts', 'src/vision/detect.ts', 'src/vision/calibrate.ts', 'src/core/received.ts'];

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, '\u00a0');
const norm = (s) => decode(s).replace(/\s+/g, ' ').trim();
const hasWords = (s) => /\p{L}{2,}/u.test(s);

function walkDir(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkDir(p, out);
    else if (/\.(tsx?|mts)$/.test(name)) out.push(p);
  }
  return out;
}

function notranslate(node) {
  for (let n = node; n; n = n.parent) {
    const open = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null;
    if (open && open.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText() === 'data-notranslate')) return true;
  }
  return false;
}

function strValue(e) {
  if (!e) return null;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isJsxExpression(e)) return strValue(e.expression);
  if (ts.isParenthesizedExpression(e)) return strValue(e.expression);
  return null;
}

const found = new Map(); // string -> first location

function add(s, file, node) {
  const v = norm(s);
  if (!v || !hasWords(v)) return;
  if (!found.has(v)) {
    const { line } = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());
    found.set(v, `${relative(ROOT, file)}:${line + 1}`);
  }
}

function scan(file, uiMode) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (uiMode) {
      if (ts.isJsxText(node) && !notranslate(node)) add(node.text, file, node);
      if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText()) && !notranslate(node)) {
        const v = strValue(node.initializer);
        if (v) add(v, file, node);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
        const v = strValue(node.arguments[0]);
        if (v) add(v, file, node);
      }
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText().replace(/['"]/g, '');
      const v = strValue(node.initializer);
      let inTable = false;
      for (let p = node.parent; p; p = p.parent) if (ts.isVariableDeclaration(p) && TABLES.has(p.name.getText())) inTable = true;
      if (v && (PROPS.has(name) || inTable)) add(v, file, node);
    }
    if (!uiMode && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'push' && node.expression.expression.getText() === 'notes') {
      const v = strValue(node.arguments[0]);
      if (v) add(v, file, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

for (const f of walkDir(join(ROOT, 'src/ui'))) scan(f, true);
for (const f of EXTRA_FILES) if (existsSync(join(ROOT, f))) scan(join(ROOT, f), false);

const sorted = Object.fromEntries([...found.keys()].sort((a, b) => a.localeCompare(b)).map((k) => [k, k]));
const prev = existsSync(OUT) ? Object.keys(JSON.parse(readFileSync(OUT, 'utf8'))) : [];
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
const added = Object.keys(sorted).filter((k) => !prev.includes(k));
const removed = prev.filter((k) => !(k in sorted));
console.log(`extract-ui-strings: ${Object.keys(sorted).length} strings (${added.length} new, ${removed.length} removed) → ${relative(ROOT, OUT)}`);
for (const k of added.slice(0, 50)) console.log('  + ' + k + '  (' + found.get(k) + ')');
for (const k of removed.slice(0, 50)) console.log('  - ' + k);
