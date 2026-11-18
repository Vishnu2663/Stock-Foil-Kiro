#!/usr/bin/env node
// Capture a page as a sequence of frames to study motion (entrance, hover, click).
// Usage: node scripts/frames.mjs <url> <out-prefix> <width> <steps>
//   steps: comma list of  t:<ms>  | hover:<x>:<y> | click:<x>:<y> | scroll:<y>   (each "t" takes a frame)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [url, prefix, width = '1280', steps = 't:200,t:600,t:1200,t:2500'] = process.argv.slice(2);
const ROOT = new URL('..', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
const profile = join(ROOT, '.cache/frames-profile');
mkdirSync(dirname(join(ROOT, prefix)), { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* */ }
  if (!wsUrl) await sleep(200);
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const w = Number(width);
const mobile = w < 600;
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: w, height: mobile ? 812 : 900, deviceScaleFactor: 1, mobile });
const t0 = Date.now();
await send('Page.navigate', { url });
let n = 0;
for (const step of steps.split(',')) {
  const [kind, a, b] = step.split(':');
  if (kind === 't') {
    const wait = Number(a) - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    let shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
    for (let k = 0; k < 10 && !shot.result?.data; k++) { await sleep(100); shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); }
    if (!shot.result?.data) continue;
    writeFileSync(join(ROOT, `${prefix}-${String(++n).padStart(2, '0')}-${a}ms.jpg`), Buffer.from(shot.result.data, 'base64'));
  } else if (kind === 'hover') {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Number(a), y: Number(b) });
  } else if (kind === 'click') {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Number(a), y: Number(b) });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Number(a), y: Number(b), button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Number(a), y: Number(b), button: 'left', clickCount: 1 });
  } else if (kind === 'scroll') {
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${Number(a)})` });
  }
}
ws.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
console.log(`${n} frames`);
