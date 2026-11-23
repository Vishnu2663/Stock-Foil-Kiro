#!/usr/bin/env node
// npm run demo:cards — writes demo-cards/ (photos, expected.json, printable files) with the app's own code.
// Vite (already a dependency) runs the TypeScript; headless Chrome runs the app's own browser code for the parts that
// need a browser: the printable sheet rendered WITH its text (used as the printed ink of the simulated photos) and the
// New card → PDF writer. Deterministic: fixed card ids, pairing secrets and seeds.
// Chrome: set CHROME=/path/to/chrome, else the macOS default location is used.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'demo-cards');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) { console.error(`Chrome not found at ${CHROME}. Set CHROME=/path/to/chrome.`); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false, hmr: false } });
await server.listen();
const base = server.resolvedUrls.local[0];
const dc = await server.ssrLoadModule('/src/render/demoCards.ts');
const { sheetSvg } = await server.ssrLoadModule('/src/render/sheet.ts');
const { encodeJpeg } = await server.ssrLoadModule('/src/render/jpeg.ts');
const { inkFromBitmap } = await server.ssrLoadModule('/src/render/rasterSvg.ts');
const { STOCK_ORIGIN, FOIL_ORIGIN } = await server.ssrLoadModule('/src/core/layout.ts');

// ---- headless Chrome on the same Vite server ----
const PORT = 9371, profile = join(ROOT, '.cache/demo-cards-profile');
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ } if (!wsUrl) await sleep(200); }
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'browser error');
  return r.result?.result?.value;
}
await send('Page.enable');
await send('Page.navigate', { url: base + '?splash=0#/home' });
await sleep(2500);
await ev(`(async () => { window.__io = await import('/src/ui/imageIO.ts'); window.__b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); }; return true; })()`);
const bytesOf = (b64) => Buffer.from(b64, 'base64');

/** The sheet of a card as printed ink (0..1), rendered by the browser with its text, 10 px/mm. */
const sheets = new Map();
async function sheetInk(spec) {
  if (sheets.has(spec.id)) return sheets.get(spec.id);
  const b64 = await ev(`(async () => { const b = await window.__io.sheetBitmap(${JSON.stringify(sheetSvg(spec))}, 10); const u = new Uint8Array(b.data.length); for (let i = 0; i < u.length; i++) u[i] = Math.round(b.data[i] * 255); return JSON.stringify({ w: b.width, h: b.height, d: window.__b64(u) }); })()`);
  const o = JSON.parse(b64);
  const lum = bytesOf(o.d);
  const data = new Float32Array(lum.length);
  for (let i = 0; i < lum.length; i++) data[i] = lum[i] / 255;
  const bmp = { width: o.w, height: o.h, data, pxPerMm: 10 };
  sheets.set(spec.id, bmp);
  return bmp;
}
async function pdfOf(svgs) {
  return bytesOf(await ev(`(async () => { const blob = await window.__io.sheetsToPdf(${JSON.stringify(svgs)}); return window.__b64(new Uint8Array(await blob.arrayBuffer())); })()`));
}
async function pngOf(svg) {
  const url = await ev(`(async () => { const c = await window.__io.svgToCanvas(${JSON.stringify(svg)}, 7.874); return c.toDataURL('image/png'); })()`);
  return bytesOf(url.split(',')[1]);
}

// ---- the sets ----
rmSync(OUT, { recursive: true, force: true, filter: undefined });
mkdirSync(OUT, { recursive: true });
const expected = [];
for (const s of dc.DEMO_SETS) {
  for (const side of [s.stock, s.foil]) await sheetInk(side.spec);
  const inkOf = (spec, role) => { const o = role === 'S' ? STOCK_ORIGIN : FOIL_ORIGIN; return inkFromBitmap(sheets.get(spec.id), o.x, o.y); };
  const p = dc.photographSet(s, inkOf);
  const dir = join(OUT, s.folder);
  mkdirSync(dir, { recursive: true });
  for (const [scene, file] of [[p.stock, s.stock.file], [p.foil, s.foil.file]]) {
    const jpg = encodeJpeg({ width: scene.width, height: scene.height, data: scene.data }, 88);
    writeFileSync(join(dir, file), jpg);
    console.log(`${s.folder}/${file}  ${scene.width}×${scene.height}  ${(jpg.length / 1024).toFixed(0)} KB`);
  }
  expected.push(dc.expectedFor(s));
}

// ---- printable files ----
const print = join(OUT, 'print');
mkdirSync(print, { recursive: true });
const blank = sheetSvg(dc.CARD_PRINT);
writeFileSync(join(print, 'blank-card.pdf'), await pdfOf([blank]));
writeFileSync(join(print, 'blank-card.png'), await pngOf(blank));
const set1 = dc.DEMO_SETS[0];
writeFileSync(join(print, 'punched-genuine.pdf'), await pdfOf([dc.punchedPageSvg(set1.stock.spec, 'S', set1.stock.keys), dc.punchedPageSvg(set1.foil.spec, 'F', set1.foil.keys)]));
console.log('print/blank-card.pdf, print/blank-card.png, print/punched-genuine.pdf');

writeFileSync(join(OUT, 'expected.json'), JSON.stringify({
  note: 'Generated by npm run demo:cards with the app\'s own card generator and photo simulator. Checked by tests/demoCards.test.ts.',
  story: dc.STORY,
  sets: expected,
  punchedGenuine: { file: 'print/punched-genuine.pdf', pages: ['worker half (stock)', 'employer half (foil)'], readsAs: '1-genuine' },
}, null, 2) + '\n');
console.log('expected.json');

ws.close(); chrome.kill(); await server.close();
rmSync(profile, { recursive: true, force: true });
process.exit(0);
