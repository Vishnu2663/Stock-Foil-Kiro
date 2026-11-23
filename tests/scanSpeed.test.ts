// Live scan speed benchmark (scanner-speed R1). Skipped unless BENCH=1:   BENCH=1 npx vitest run tests/scanSpeed.test.ts
// Frames look like what the camera hands the scanner today: a 1920×1080 camera frame downscaled to 1600×900, with a
// half of the REAL printed sheet at ~5 px/mm held 25–35 cm away, a little tilt, 1.2–1.5 px blur and uneven light.
// It prints p50/p95 per stage for "card in view" and "no card" frames, plus an estimate of the time to auto-capture
// with today's loop (a fixed 300 ms tick on phones, one scan at a time, 3 identical reads in a row).
import { describe, expect, it } from 'vitest';
import { scanImage, scanLive, type StageTimes } from '../src/vision/detect';
import { streakNeeded } from '../src/vision/quality';
import { captureBlocker } from '../src/vision/capture';
import { sharpness } from '../src/vision/quality';
import { readKey, LIVE } from '../src/vision/quality';
import type { Role } from '../src/core/card';
import { liveFrame, emptyFrame } from './liveFrames';

const BENCH = typeof process !== 'undefined' && process.env.BENCH === '1';

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const STAGES: (keyof StageTimes)[] = ['gray', 'qr', 'squares', 'pose', 'cells', 'edge', 'receipt', 'total'];

function table(label: string, rows: { t: StageTimes; blur: number }[]) {
  const line = (name: string, xs: number[]) => `  ${name.padEnd(8)} p50 ${pct(xs, 0.5).toFixed(1).padStart(7)}  p95 ${pct(xs, 0.95).toFixed(1).padStart(7)}`;
  const out = [`${label} (${rows.length} frames, ms)`, line('blur*', rows.map((r) => r.blur))];
  for (const k of STAGES) out.push(line(k, rows.map((r) => r.t[k])));
  return out.join('\n');
}

describe.skipIf(!BENCH)('scanner speed benchmark (BENCH=1)', () => {
  it('live path today: per-stage p50/p95 and the estimated time to auto-capture', () => {
    const cases: { role: Role; rot: number; ppm: number; blur: number; seed: number; ox: number; oy: number }[] = [];
    for (const role of ['S', 'F'] as const) for (const [rot, ppm, blur] of [[-8, 4.6, 1.2], [0, 5, 1.3], [6, 5.4, 1.5], [12, 4.8, 1.4]] as const)
      cases.push({ role, rot, ppm, blur, seed: 11 + rot, ox: 160 + rot * 6, oy: 10 });
    const frames = cases.map((c) => ({ c, img: liveFrame(c.role, c) }));
    const empties = [1, 2, 3, 4].map(emptyFrame);
    // warm up the JIT once, then measure three rounds
    for (const f of frames) scanImage(f.img, { calibration: {} });
    scanImage(empties[0], { calibration: {} });
    const card: { t: StageTimes; blur: number }[] = [], none: { t: StageTimes; blur: number }[] = [];
    let read = 0;
    for (let round = 0; round < 3; round++) {
      for (const f of frames) {
        const b0 = performance.now(); sharpness(f.img); const blur = performance.now() - b0;
        const r = scanImage(f.img, { calibration: {} });
        if (r.halves.length) read++;
        card.push({ t: r.timing!, blur });
      }
      for (const e of empties) {
        const b0 = performance.now(); sharpness(e); const blur = performance.now() - b0;
        none.push({ t: scanImage(e, { calibration: {} }).timing!, blur });
      }
    }
    // time to auto-capture with today's phone loop: a tick every 300 ms that is skipped while a scan is running, and
    // 3 identical clean reads in a row. Per frame: wait for the next tick after the previous scan ends.
    const capture: number[] = [];
    for (const f of frames) {
      const ms = card.filter((_, i) => i % frames.length === frames.indexOf(f)).map((x) => x.t.total + x.blur);
      const scan = pct(ms, 0.5);
      const r = scanImage(f.img, { calibration: {} });
      const h = r.halves[0];
      const ok = !!h && !captureBlocker(h) && !h.warnings.includes('glare');
      const key = h ? readKey(h) : '';
      // every tick reads the same still frame here, so a clean card locks on its 3rd read
      const tick = LIVE.phone.tick, need = LIVE.phone.streak;
      const perRead = Math.ceil(scan / tick) * tick;
      capture.push(ok && key ? need * perRead : NaN);
    }
    // ---- after: the live path (scanner-speed) ----
    for (const f of frames) scanLive(f.img);
    scanLive(empties[0]);
    const lFind: { t: StageTimes; blur: number }[] = [], lTrack: { t: StageTimes; blur: number }[] = [], lNone: { t: StageTimes; blur: number }[] = [];
    let lRead = 0;
    for (let round = 0; round < 3; round++) {
      for (const f of frames) {
        const b0 = performance.now(); sharpness(f.img); const blur = performance.now() - b0;
        const first = scanLive(f.img);
        lFind.push({ t: first.timing!, blur });
        const tr = scanLive(f.img, { hint: { qr: first.halves.map((h) => h.qr.corners) } });
        if (tr.halves.length) lRead++;
        lTrack.push({ t: tr.timing!, blur });
      }
      for (const e of empties) { const b0 = performance.now(); sharpness(e); const blur = performance.now() - b0; lNone.push({ t: scanLive(e).timing!, blur }); }
    }
    // time to auto-capture with the new loop: the next scan starts on the next video frame (30 fps) after the last
    // one ends; the first read is a find, then tracked reads; 2 reads for a clean card, else 3
    const frameMs = 1000 / 30;
    const newCapture: number[] = [];
    frames.forEach((f, i) => {
      const find = lFind.filter((_, k) => k % frames.length === i).map((x) => x.t.total + x.blur);
      const trk = lTrack.filter((_, k) => k % frames.length === i).map((x) => x.t.total + x.blur);
      const h = scanLive(f.img).halves[0];
      if (!h || captureBlocker(h)) { newCapture.push(NaN); return; }
      const need = streakNeeded(h, LIVE.phone.streak);
      const per = (ms: number) => Math.ceil(ms / frameMs) * frameMs;
      newCapture.push(per(pct(find, 0.5)) + (need - 1) * per(pct(trk, 0.5)));
    });
    const report = [
      table('CARD IN VIEW', card),
      table('NO CARD', none),
      `  read ${read}/${card.length} card frames`,
      `TIME TO AUTO-CAPTURE (phone loop: ${LIVE.phone.tick} ms tick, ${LIVE.phone.streak} reads; this machine)`,
      `  p50 ${pct(capture.filter(Number.isFinite), 0.5).toFixed(0)} ms  p95 ${pct(capture.filter(Number.isFinite), 0.95).toFixed(0)} ms  (${capture.filter(Number.isFinite).length}/${capture.length} cards capture)`,
      '  * blur = the sharpness check the camera runs on the main thread before sending a frame',
      '',
      '==== AFTER (live path) ====',
      table('LIVE · FIRST FIND', lFind),
      table('LIVE · TRACKED', lTrack),
      table('LIVE · NO CARD', lNone),
      `  read ${lRead}/${lTrack.length} tracked frames`,
      `TIME TO AUTO-CAPTURE (new loop: next video frame at 30 fps, 2 reads when clear else 3; this machine)`,
      `  p50 ${pct(newCapture.filter(Number.isFinite), 0.5).toFixed(0)} ms  p95 ${pct(newCapture.filter(Number.isFinite), 0.95).toFixed(0)} ms  (${newCapture.filter(Number.isFinite).length}/${newCapture.length} cards capture)`,
    ].join('\n');
    console.log('\n' + report + '\n');
    expect(read).toBe(card.length);
    expect(lRead).toBe(lTrack.length);
  });
});
