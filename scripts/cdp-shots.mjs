#!/usr/bin/env node
// Screenshots through the Chrome DevTools protocol (no dependencies; Node 22+ has WebSocket).
// Real device viewports (375px works), waits for animations, and checks for sideways scroll.
// Usage: node scripts/cdp-shots.mjs [base-url] [out-dir] [pages...]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/';
const OUT = process.argv[3] ?? 'docs/screenshots';
const PAGES = process.argv.slice(4).length ? process.argv.slice(4) : ['home', 'issue', 'scan', 'members', 'crew', 'story', 'history', 'ledger', 'income', 'punch', 'demo', 'lab', 'calibrate', 'about', 'settings'];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const profile = join(ROOT, '.cache/cdp-profile');
mkdirSync(join(ROOT, OUT), { recursive: true });

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Page.enable');
await send('Runtime.enable');
const report = [];
for (const [w, h, mobile] of [[1280, 900, false], [375, 812, true]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
  for (const p of PAGES) {
    await send('Page.navigate', { url: `${BASE}?splash=0#/${p}` });
    await sleep(2600);
    const info = await evaluate(`(() => {
      const de = document.documentElement;
      const tab = document.querySelector('.tabbar');
      return { sideways: de.scrollWidth > de.clientWidth + 1, width: de.scrollWidth, height: Math.min(6000, de.scrollHeight), tabbar: tab ? getComputedStyle(tab).display : null };
    })()`);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: Math.max(h, info?.height ?? h), deviceScaleFactor: 1, mobile });
    await sleep(500);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(ROOT, OUT, `${p}-${w}.png`), Buffer.from(shot.result.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    report.push(`${p}-${w}: ${info?.sideways ? 'SIDEWAYS SCROLL ' + info.width + 'px' : 'ok'}${mobile ? ' tabbar=' + info?.tabbar : ''}`);
  }
}
console.log(report.join('\n'));
ws.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
