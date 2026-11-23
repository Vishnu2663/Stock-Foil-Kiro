#!/usr/bin/env node
// Uploads the demo cards into the app exactly as a judge would (Payday scan → choose photos), checks what the result
// screen shows, and saves demo-cards/screens/set1-result.jpg and set2-result.jpg. Same approach as cdp-shots.mjs.
// Usage: node scripts/demo-shots.mjs [base-url]   (default http://127.0.0.1:4173/, e.g. node scripts/serve.mjs 4173)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9373, profile = join(ROOT, '.cache/demo-shots-profile');
const OUT = join(ROOT, 'demo-cards/screens');
mkdirSync(OUT, { recursive: true });
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl; for (let i = 0; i < 60 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ } if (!wsUrl) await sleep(200); }
const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(); const errors = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 200)); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const until = async (expr, ms = 30000) => { for (let t = 0; t < ms; t += 150) { if (await ev(expr)) return true; await sleep(150); } return false; };
await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const results = [];
let n = 0;
for (const [set, files, shot] of [
  ['1-genuine', ['stock.jpg', 'foil.jpg'], 'set1-result.jpg'],
  ['2-extra-hole', ['stock.jpg', 'foil.jpg'], 'set2-result.jpg'],
  ['3-wrong-half', ['stock.jpg', 'foil-from-another-card.jpg'], null],
  ['4-two-shifts', ['stock.jpg', 'foil.jpg'], null],
]) {
  // a fresh page load for every set (the scan screen keeps its halves while the page is open)
  await send('Page.navigate', { url: BASE + `?splash=0&set=${++n}#/scan` }); await sleep(1800);
  const { root } = (await send('DOM.getDocument', { depth: -1 })).result;
  const { nodeId } = (await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][multiple]' })).result;
  if (!nodeId) throw new Error('no photo input on the scan page');
  await send('DOM.setFileInputFiles', { nodeId, files: files.map((f) => join(ROOT, 'demo-cards', set, f)) });
  await until(`!!document.querySelector('.rv-hero')`);
  await sleep(1200);
  const r = await ev(`JSON.stringify({ stamp: document.querySelector('.rv-stamp:not(.lift)')?.textContent, amount: document.querySelector('.rv-amount')?.textContent, formula: document.querySelector('.rv-formula')?.textContent, notes: [...document.querySelectorAll('.rv .note')].map((n) => n.textContent).join(' | ').slice(0, 220), checks: [...document.querySelectorAll('.check-line li')].map((l) => l.className + ':' + l.querySelector('b')?.textContent).join(', ') })`);
  results.push([set, JSON.parse(r)]);
  if (shot) {
    await ev("document.querySelector('.toast-wrap')?.style.setProperty('display', 'none')"); // a passing toast is not part of the result
    await ev('window.scrollTo(0, 0)'); await sleep(300);
    const c = await ev(`(() => { const a = document.querySelector('.rv').getBoundingClientRect(); return { x: 0, y: a.top + scrollY - 10, width: 1280, height: Math.min(1250, a.height + 20) }; })()`);
    const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip: { ...c, scale: 1 }, captureBeyondViewport: true });
    writeFileSync(join(OUT, shot), Buffer.from(s.result.data, 'base64'));
  }
}
console.log(JSON.stringify({ results, errors }, null, 1));
ws.close(); chrome.kill(); await sleep(500);
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch { /* Chrome still closing */ }
process.exit(0);
