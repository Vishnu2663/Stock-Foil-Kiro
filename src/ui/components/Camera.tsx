import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scanImages } from '../scanAsync';
import { videoFrame } from '../imageIO';
import type { HalfScan } from '../../vision/detect';
import { captureBlocker, debugLine, readingSummary, drawablePose, POSE_MAX_AGE, type Blocker } from '../../vision/capture';
import { targetsFor, FIDUCIALS, FID_SIZE, FRAME_W, FRAME_H } from '../../core/layout';
import { applyH, type Pt } from '../../core/homography';
import { formatMoney, type Role } from '../../core/card';
import { payFor } from '../../core/wages';
import { useApp } from '../ctx';
import { prompt, langInfo, type PromptKey } from '../../i18n/index';
import { speak } from '../../ai/speech';
import { createScope, kaChunk, motionEnv, type Scope } from '../anim';
import { warpThumb, wavePaths, THUMB } from '../thumb';
import { Odometer } from './Motion';
import { Icon } from './Icon';

export type CameraMode = 'halves' | 'join';
interface Props {
  have: { S: boolean; F: boolean };
  onHalf: (h: HalfScan) => void;
  onClose: () => void;
  /** Called when both halves are in and the "tally join" has played (or was skipped). */
  onDone?: () => void;
  /** 'join': both halves side by side in ONE frame, so the cut edges can be checked together. */
  mode?: CameraMode;
}

/** Live-loop timing (the live app's numbers) and HUD timing. */
export const CAMERA = { tick: 450, framePx: 1600, streak: 2, cooldown: 1800, flash: 1600, retry: 7000, lockMs: 220, pingMs: 420, popMs: 180, lerp: 0.35 };

type Tone = 'good' | 'warn' | '';
interface Live { halves: HalfScan[]; scale: number; at: number }
interface Rect { l: number; t: number; w: number; h: number }
interface Shot { role: Role; url: string; id: string }

const KEY: Record<Blocker['code'], PromptKey> = { surface: 'grey', corners: 'whole', hidden: 'whole', far: 'closer', dark: 'light' };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (k: number) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;

/**
 * The camera captures by itself. Every 450 ms a frame (up to 1600 px) goes through the payday scanner in the
 * worker. When a half that is still needed reads cleanly on 2 ticks in a row it is captured. A HUD on the video
 * shows what the scanner understands; nothing of it is drawn into the frames that are analysed.
 */
export function Camera({ have, onHalf, onClose, onDone, mode = 'halves' }: Props) {
  const app = useApp();
  const { t, settings } = app;
  const appRef = useRef(app);
  appRef.current = app;
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const scope = useRef<Scope>(createScope());
  const [error, setError] = useState('');
  const [status, setStatus] = useState<{ text: string; tone: Tone }>({ text: t('Starting the camera…'), tone: '' });
  const [debug, setDebug] = useState('');
  const [torch, setTorch] = useState<boolean | null>(null);
  const [auto, setAuto] = useState(true);
  const [flash, setFlash] = useState('');
  const [shutter, setShutter] = useState(0);
  const [vr, setVr] = useState<Rect | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [tally, setTally] = useState<{ days: number; adv: number; net: string } | null>(null);
  const [lock, setLock] = useState(0); // 0, 0.5, 1
  const [shots, setShots] = useState<Partial<Record<Role, Shot>>>({});
  const [pill, setPill] = useState('');
  const [joining, setJoining] = useState<{ ok: boolean; id: string } | null>(null);
  const autoRef = useRef(true);
  autoRef.current = auto;
  const live = useRef<Live | null>(null);
  const toneRef = useRef<Tone>('');
  toneRef.current = status.tone;
  const streak = useRef<{ key: string; n: number }>({ key: '', n: 0 });
  const lastCapture = useRef(0);
  const got = useRef({ S: have.S, F: have.F });
  const haveRef = useRef(have);
  useEffect(() => { haveRef.current = have; got.current = { S: have.S || got.current.S, F: have.F || got.current.F }; }, [have.S, have.F]);
  const lastSpoken = useRef<{ k: string; at: number }>({ k: '', at: 0 });
  const onHalfRef = useRef(onHalf); onHalfRef.current = onHalf;
  const onDoneRef = useRef(onDone); onDoneRef.current = onDone;
  const shotsRef = useRef(shots); shotsRef.current = shots;
  const slots = useRef<Record<string, HTMLElement | null>>({});
  const doneOnce = useRef(false);

  // Everything scheduled by this camera dies with it (timers, rAFs, animations, sounds).
  useEffect(() => { const s = createScope(); scope.current = s; return () => s.dispose(); }, []);

  const say = useCallback((k: PromptKey, force = false) => {
    const { settings: st, lang } = appRef.current;
    if (!st.simple) return;
    const now = Date.now();
    if (!force && lastSpoken.current.k === k && now - lastSpoken.current.at < 7000) return;
    if (!force && typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) return;
    lastSpoken.current = { k, at: now };
    speak(prompt(lang, k), { lang: langInfo(lang).speech, rate: st.speakRate });
  }, []);

  const blockText = (b: Blocker): string => {
    const t = appRef.current.t;
    switch (b.code) {
      case 'surface': return t('The table is the same shade as the grey discs: put the card on a darker or lighter surface.');
      case 'corners': return t('Show all 4 corner squares ({0}/4 seen), flat to the camera.', b.found);
      case 'hidden': return t('Some punch spots are cut off: show the whole half.');
      case 'far': return t('Move the half closer to the camera.');
      case 'dark': return t('Too dark: add light.');
    }
  };

  /** Finish: both halves are in. Plays the tally join (about 1.4 s, tap to skip), then hands over. */
  const finish = useCallback(() => {
    if (doneOnce.current) return;
    doneOnce.current = true;
    const s = shotsRef.current;
    const env = motionEnv();
    if (env.reduced || !s.S || !s.F || mode === 'join') { onDoneRef.current?.(); return; }
    setJoining({ ok: s.S.id === s.F.id, id: s.S.id });
    scope.current.timeout(() => onDoneRef.current?.(), 1400);
  }, [mode]);
  const skipJoin = () => { if (joining) onDoneRef.current?.(); };

  /** The captured quad flies from where the card was into its tray slot (FLIP, 450 ms). */
  const flyToSlot = useCallback((h: HalfScan, url: string, scale: number) => {
    const env = motionEnv();
    const v = video.current, w = wrap.current, slot = slots.current[h.decoded.role];
    if (env.reduced || !v || !w || !slot || !v.videoWidth) return;
    const wr = w.getBoundingClientRect();
    const s = Math.min(wr.width / v.videoWidth, wr.height / v.videoHeight);
    const ox = wr.left + (wr.width - v.videoWidth * s) / 2, oy = wr.top + (wr.height - v.videoHeight * s) / 2;
    const pts = h.outline.map(([x, y]) => [ox + (x / scale) * s, oy + (y / scale) * s]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const from = { l: Math.min(...xs), t: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const to = slot.getBoundingClientRect();
    const img = document.createElement('img');
    img.src = url;
    img.className = 'cam-fly';
    Object.assign(img.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
    document.body.appendChild(img);
    scope.current.add(() => img.remove());
    const dx = from.l - to.left, dy = from.t - to.top, sx = from.w / to.width, sy = from.h / to.height;
    const a = scope.current.animate(img, [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 30}px) scale(${(sx + 1) / 2}) rotate(-7deg)`, opacity: 1, offset: 0.55 },
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: 450, easing: 'cubic-bezier(.3,.7,.2,1)' });
    if (a) a.finished.then(() => img.remove(), () => img.remove()); else img.remove();
  }, []);

  const capture = useCallback((h: HalfScan, frame?: { img: { width: number; height: number; data: Uint8ClampedArray }; scale: number }) => {
    const role = h.decoded.role;
    const { t, settings: st } = appRef.current;
    const sc = scope.current;
    got.current = { ...got.current, [role]: true };
    lastCapture.current = Date.now();
    streak.current = { key: '', n: 0 };
    setLock(1);
    sc.timeout(() => setLock(0), 700);
    // shutter flash, a tiny shake, vibrate, a quiet ka-chunk
    setShutter((n) => n + 1);
    if (!motionEnv().reduced) sc.animate(wrap.current, [{ transform: 'translate(0,0)' }, { transform: 'translate(-2px,1px)' }, { transform: 'translate(2px,-1px)' }, { transform: 'translate(0,0)' }], { duration: 120 });
    navigator.vibrate?.(60);
    kaChunk(sc, st.sounds);
    const msg = role === 'S' ? t('✓ worker half captured') : t('✓ employer half captured');
    setFlash(msg);
    sc.timeout(() => setFlash((f) => (f === msg ? '' : f)), CAMERA.flash);
    setStatus({ text: msg, tone: 'good' });
    if (frame) {
      try {
        const url = warpThumb(frame.img, h.pose.H, role);
        setShots((s) => ({ ...s, [role]: { role, url, id: h.decoded.spec.id } }));
        sc.raf(() => flyToSlot(h, url, frame.scale));
      } catch { /* snapshot is decoration only */ }
    }
    onHalfRef.current(h);
    const other: Role = role === 'S' ? 'F' : 'S';
    if (got.current[other]) { setPill(''); sc.timeout(finish, 500); }
    else setPill(role === 'S' ? t('✓ Worker half captured: now the employer half (foil)') : t('✓ Employer half captured: now the worker half (stock)'));
    sc.timeout(() => { if (!haveRef.current[role]) got.current = { ...got.current, [role]: false }; }, CAMERA.retry);
    say(got.current[other] ? 'done' : other === 'F' ? 'foil' : 'stock', true);
  }, [say, finish, flyToSlot]);

  // If both halves are already there when the camera opens (e.g. join mode done), nothing to wait for.
  // Open the camera once; stop it on unmount. Fallbacks: rear 1920×1080 → rear → any camera.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = appRef.current.t;
      const tries: MediaStreamConstraints[] = [
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        { video: { facingMode: 'environment' }, audio: false },
        { video: true, audio: false },
      ];
      let s: MediaStream | null = null;
      let last: unknown;
      for (const c of tries) {
        try { s = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) { last = e; if ((e as DOMException)?.name === 'NotAllowedError') break; }
      }
      if (!s) {
        const name = (last as DOMException)?.name;
        setError(name === 'NotAllowedError' ? t('Camera permission was denied. Allow the camera for this site, or choose photos instead.')
          : name === 'NotFoundError' ? t('No camera was found on this device. You can choose photos instead.')
          : name === 'NotReadableError' ? t('Another app is using the camera. Close it and try again.')
          : t('No camera is available. You can choose photos instead.'));
        return;
      }
      if (cancelled) { s.getTracks().forEach((x) => x.stop()); return; }
      stream.current = s;
      const v = video.current!;
      v.srcObject = s;
      await v.play().catch(() => undefined);
      const track = s.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean };
      if (caps.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
      if (caps.torch) setTorch(false);
    })();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((x) => x.stop());
      stream.current = null;
    };
  }, []);

  // The box takes the video's own shape (no letterbox bands); the HUD sits exactly on the picture.
  useEffect(() => {
    const measure = () => {
      const v = video.current, w = wrap.current;
      if (!v || !w || !v.videoWidth) return;
      const a = v.videoWidth / v.videoHeight;
      setAspect((o) => (o && Math.abs(o - a) < 0.01 ? o : a));
      const cw = w.clientWidth, ch = w.clientHeight;
      const s = Math.min(cw / v.videoWidth, ch / v.videoHeight);
      const r = { w: v.videoWidth * s, h: v.videoHeight * s, l: 0, t: 0 };
      r.l = (cw - r.w) / 2; r.t = (ch - r.h) / 2;
      setVr((o) => (o && Math.abs(o.w - r.w) < 0.5 && Math.abs(o.h - r.h) < 0.5 && Math.abs(o.l - r.l) < 0.5 ? o : r));
    };
    const v = video.current;
    v?.addEventListener('loadedmetadata', measure);
    v?.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (wrap.current) ro?.observe(wrap.current);
    window.addEventListener('resize', measure);
    const id = setInterval(measure, 1000);
    return () => { v?.removeEventListener('loadedmetadata', measure); v?.removeEventListener('resize', measure); ro?.disconnect(); window.removeEventListener('resize', measure); clearInterval(id); };
  }, []);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { setTorch(false); }
  };

  const tallyOf = (h: HalfScan) => {
    const spec = h.decoded.spec;
    const view = payFor(h.cells.filter((c) => c.punched).map((c) => c.key), { rateMinor: spec.rateMinor, advMinor: spec.advMinor, carryMinor: spec.carryMinor, halves: spec.halves });
    return { days: view.days, adv: view.advCount, net: formatMoney(Math.max(0, Math.trunc(view.net / 100) * 100), spec.currency) };
  };

  /** One tick: scan the frame, explain why it is (not) capturing, capture on 2 clean reads in a row. */
  const tick = useCallback(async (manual = false) => {
    const v = video.current;
    if (!v || v.readyState < 2 || !v.videoWidth || doneOnce.current) return;
    const f = videoFrame(v, CAMERA.framePx);
    if (!f) return;
    const { t, settings: st } = appRef.current;
    let res;
    try {
      [res] = await scanImages([f.img], { calibration: st.calibration });
    } catch {
      setStatus({ text: t('Could not read that frame, trying again…'), tone: 'warn' });
      return;
    }
    if (!res || scope.current.disposed) return;
    const now = performance.now();
    const need = (r: Role) => !got.current[r];
    const idle = got.current.S ? t('Now show the EMPLOYER half (foil)') : got.current.F ? t('Now show the WORKER half (stock)') : t('Show a half to the camera. Hold it flat in good light, whole half in view.');
    if (!res.halves.length) {
      live.current = null; // nothing in view: the overlay is cleared at once
      streak.current = { key: '', n: 0 };
      setLock(0);
      setTally(null);
      setDebug(st.scannerDebug ? `no QR · ${res.squaresSeen ?? 0} square blobs · ${res.ms} ms` : '');
      if (res.foreign.length) setStatus({ text: t('That QR code is not a Stock & Foil card.'), tone: 'warn' });
      else if ((res.squaresSeen ?? 0) >= 3) setStatus({ text: t('A card is in view but its QR code cannot be read yet: move it closer and hold still.'), tone: 'warn' });
      else { setStatus({ text: mode === 'join' ? t('Lay both halves side by side, wavy edges touching, on a dark table.') : idle, tone: '' }); say(got.current.S ? 'foil' : 'stock'); }
      return;
    }
    live.current = { halves: res.halves, scale: f.scale, at: now };
    if (mode === 'join') {
      const s = res.halves.find((x) => x.decoded.role === 'S'), fo = res.halves.find((x) => x.decoded.role === 'F');
      setDebug(st.scannerDebug ? res.halves.map(debugLine).join(' ‖ ') : '');
      if (!s || !fo) { streak.current = { key: '', n: 0 }; setLock(0); setStatus({ text: t('Both halves must be in the picture together.'), tone: 'warn' }); return; }
      const why = captureBlocker(s) ?? captureBlocker(fo);
      if (why) { streak.current = { key: '', n: 0 }; setLock(0); setStatus({ text: blockText(why), tone: 'warn' }); return; }
      streak.current = { key: 'join', n: streak.current.key === 'join' ? streak.current.n + 1 : 1 };
      setLock(Math.min(1, streak.current.n / CAMERA.streak));
      if (manual || streak.current.n >= CAMERA.streak) { capture(s, f); capture(fo, f); return; }
      setStatus({ text: t('Hold still…'), tone: 'good' });
      return;
    }
    const h = res.halves.find((x) => need(x.decoded.role)) ?? res.halves[0];
    const role = h.decoded.role;
    const label = role === 'S' ? t('worker') : t('employer');
    setDebug(st.scannerDebug ? `${debugLine(h)} · ${res.ms} ms` : '');
    setTally(tallyOf(h));
    if (!need(role)) {
      streak.current = { key: '', n: 0 };
      setLock(0);
      setStatus({ text: role === 'S' ? t('The worker half is already captured. Show the EMPLOYER half.') : t('The employer half is already captured. Show the WORKER half.'), tone: 'warn' });
      return;
    }
    if (manual) { capture(h, f); return; }
    const why = captureBlocker(h);
    if (why) {
      streak.current = { key: '', n: 0 };
      setLock(0);
      setStatus({ text: blockText(why), tone: 'warn' });
      say(KEY[why.code]);
      return;
    }
    const key = role + h.decoded.spec.id;
    streak.current = { key, n: streak.current.key === key ? streak.current.n + 1 : 1 };
    setLock(Math.min(1, streak.current.n / CAMERA.streak) * 0.999);
    if (autoRef.current && streak.current.n >= CAMERA.streak) { capture(h, f); return; }
    const s = readingSummary(h);
    const seen = t('days {0} · advances {1}', s.days.length ? s.days.join(',') : t('none'), s.adv.length ? s.adv.join(',') : t('none'));
    const tip = h.warnings.includes('edge-hidden') ? ' ' + t('Tip: keep fingers off the wavy edge so it can be checked.') : '';
    setStatus({ text: (autoRef.current ? t('✓ {0} half detected ({1}). Hold still…', label, seen) : t('✓ {0} half detected ({1}). Tap Capture now.', label, seen)) + tip, tone: 'good' });
    if (autoRef.current) say('still');
  }, [capture, say, mode]);

  // The loop: one scan at a time, paused while hidden and for 1.8 s after a capture.
  useEffect(() => {
    let stop = false, busy = false;
    const id = setInterval(async () => {
      if (stop || busy || document.hidden || Date.now() - lastCapture.current < CAMERA.cooldown) return;
      busy = true;
      try { await tick(); } finally { busy = false; }
    }, CAMERA.tick);
    const vis = () => { const v = video.current; if (!v) return; if (document.hidden) v.pause(); else v.play().catch(() => undefined); };
    document.addEventListener('visibilitychange', vis);
    return () => { stop = true; clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [tick]);

  // ---------------- the HUD (one canvas, redrawn every frame from a smoothed pose) ----------------
  useEffect(() => {
    let raf = 0;
    // smoothed screen points per half: frame corners, fiducial centres
    const shown = new Map<string, { quad: Pt[]; fid: Pt[] }>();
    const lockAt: number[] = [0, 0, 0, 0];
    const wasFound = [false, false, false, false];
    let allAt = 0, wasAll = false;
    const cellState = new Map<string, { s: string; at: number }>();
    const t0 = performance.now();
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current, v = video.current;
      if (!c || !v) return;
      const cw = c.clientWidth, ch = c.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cw, ch);
      if (!v.videoWidth) return;
      const now = performance.now();
      const s = Math.min(cw / v.videoWidth, ch / v.videoHeight);
      const ox = (cw - v.videoWidth * s) / 2, oy = (ch - v.videoHeight * s) / 2;
      const vw = v.videoWidth * s, vh = v.videoHeight * s;
      const red = '#e2584a', green = '#2fbf71', amber = '#f6a609';
      const L = drawablePose<HalfScan, Live>(live.current, now);
      const sweep = 0.5 - 0.5 * Math.cos(((now - t0) / 1800) * Math.PI * 2);
      if (!L) {
        shown.clear();
        // no card (or a stale pose): the laser sweeps the whole view, brackets sit at the edges
        const y = oy + vh * (0.06 + 0.88 * sweep);
        const gr = g.createLinearGradient(ox, 0, ox + vw, 0);
        gr.addColorStop(0, 'rgba(226,88,74,0)'); gr.addColorStop(0.5, 'rgba(226,88,74,.85)'); gr.addColorStop(1, 'rgba(226,88,74,0)');
        g.strokeStyle = gr; g.lineWidth = 2; g.shadowColor = red; g.shadowBlur = 10;
        g.beginPath(); g.moveTo(ox + vw * 0.04, y); g.lineTo(ox + vw * 0.96, y); g.stroke();
        g.shadowBlur = 0;
        wasFound.fill(false); wasAll = false;
        return;
      }
      for (const half of L.halves) {
        const id = half.decoded.role;
        const toScreen = (p: Pt): Pt => [ox + (p[0] / L.scale) * s, oy + (p[1] / L.scale) * s];
        const mm = (x: number, y: number) => toScreen(applyH(half.pose.H, x, y));
        const quadT = ([[0, 0], [FRAME_W, 0], [FRAME_W, FRAME_H], [0, FRAME_H]] as Pt[]).map(([x, y]) => mm(x, y));
        const fidT = FIDUCIALS.map(([x, y]) => mm(x, y));
        let sh = shown.get(id);
        if (!sh) { sh = { quad: quadT.map((p) => [...p] as Pt), fid: fidT.map((p) => [...p] as Pt) }; shown.set(id, sh); }
        sh.quad.forEach((p, i) => { p[0] = lerp(p[0], quadT[i][0], CAMERA.lerp); p[1] = lerp(p[1], quadT[i][1], CAMERA.lerp); });
        sh.fid.forEach((p, i) => { p[0] = lerp(p[0], fidT[i][0], CAMERA.lerp); p[1] = lerp(p[1], fidT[i][1], CAMERA.lerp); });
        // smoothed mapping: bilinear in the smoothed quad (exact enough for drawing)
        const q = sh.quad;
        const at = (x: number, y: number): Pt => {
          const u = x / FRAME_W, w = y / FRAME_H;
          const top: Pt = [lerp(q[0][0], q[1][0], u), lerp(q[0][1], q[1][1], u)];
          const bot: Pt = [lerp(q[3][0], q[2][0], u), lerp(q[3][1], q[2][1], u)];
          return [lerp(top[0], bot[0], w), lerp(top[1], bot[1], w)];
        };
        const done = got.current[half.decoded.role];
        const found = half.pose.fiducials.map(Boolean);
        const nFound = found.filter(Boolean).length;
        if (nFound === 4 && !wasAll) allAt = now;
        wasAll = nFound === 4;
        // outline, with a 300 ms glow when all four corners lock
        const glow = now - allAt < 300 ? 1 - (now - allAt) / 300 : 0;
        const col = done ? '#8fb4ff' : nFound === 4 ? green : amber;
        g.lineJoin = 'round';
        g.strokeStyle = col; g.lineWidth = 2 + glow * 3; g.shadowColor = col; g.shadowBlur = 6 + glow * 22;
        g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke();
        g.shadowBlur = 0;
        // perspective laser: a line of the card itself (y in mm), so it follows the paper's tilt
        const yb = FRAME_H * (0.04 + 0.92 * sweep);
        const a = at(0, yb), b = at(FRAME_W, yb);
        g.strokeStyle = nFound === 4 ? 'rgba(47,191,113,.9)' : 'rgba(226,88,74,.9)'; g.lineWidth = 2; g.shadowColor = g.strokeStyle; g.shadowBlur = 12;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.shadowBlur = 0;
        // corner brackets: fly from the view's corners to the squares (220 ms), snap, ping once
        const edges: Pt[] = [[ox + 14, oy + 14], [ox + vw - 14, oy + 14], [ox + 14, oy + vh - 14], [ox + vw - 14, oy + vh - 14]];
        for (let i = 0; i < 4; i++) {
          if (found[i] && !wasFound[i]) lockAt[i] = now;
          wasFound[i] = found[i];
          const k = found[i] ? easeOut((now - lockAt[i]) / CAMERA.lockMs) : 1;
          const target = sh.fid[i];
          const p: Pt = found[i] ? [lerp(edges[i][0], target[0], k), lerp(edges[i][1], target[1], k)] : target;
          const size = Math.max(9, Math.hypot(at(FID_SIZE, 0)[0] - at(0, 0)[0], at(FID_SIZE, 0)[1] - at(0, 0)[1]) * 0.9);
          const pulse = found[i] ? 1 : 0.55 + 0.45 * Math.sin(now / 160);
          g.globalAlpha = pulse;
          g.strokeStyle = found[i] ? green : amber; g.lineWidth = 3; g.lineCap = 'round';
          const sx = i % 2 === 0 ? -1 : 1, sy = i < 2 ? -1 : 1;
          g.beginPath();
          g.moveTo(p[0] + sx * size, p[1] + sy * size * 0.35); g.lineTo(p[0] + sx * size, p[1] + sy * size); g.lineTo(p[0] + sx * size * 0.35, p[1] + sy * size);
          g.stroke();
          g.globalAlpha = 1;
          const pingK = (now - lockAt[i]) / CAMERA.pingMs;
          if (found[i] && pingK >= 0 && pingK < 1) {
            g.globalAlpha = 1 - pingK; g.lineWidth = 2;
            g.beginPath(); g.arc(target[0], target[1], size * (1 + 1.2 * pingK), 0, Math.PI * 2); g.stroke();
            g.globalAlpha = 1;
          }
        }
        // punch rings: pop (0.6 → 1.15 → 1, 180 ms) each time a cell changes state
        const cells = new Map(half.cells.map((x) => [x.key, x]));
        for (const tg of targetsFor(half.decoded.spec)) {
          const cell = cells.get(tg.key);
          if (!cell) continue;
          const state = cell.unsure ? 'u' : cell.punched ? 'p' : 'b';
          const ck = id + tg.key;
          const prev = cellState.get(ck);
          if (!prev || prev.s !== state) cellState.set(ck, { s: state, at: now });
          const pk = Math.min(1, (now - (cellState.get(ck)!.at)) / CAMERA.popMs);
          const pop = pk < 0.6 ? 0.6 + (1.15 - 0.6) * (pk / 0.6) : 1.15 - 0.15 * ((pk - 0.6) / 0.4);
          const [x, y] = at(tg.cx, tg.cy);
          const [x2, y2] = at(tg.cx + 3, tg.cy);
          const R = Math.max(2, Math.hypot(x2 - x, y2 - y)) * pop;
          if (state === 'u') {
            g.setLineDash([4, 3]); g.lineDashOffset = -(now / 40); g.lineWidth = 2; g.strokeStyle = amber;
            g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
          } else if (state === 'p') {
            g.fillStyle = 'rgba(47,191,113,.85)';
            g.beginPath(); g.arc(x, y, R * 0.62, 0, Math.PI * 2); g.fill();
            g.strokeStyle = green; g.lineWidth = 2; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
          } else {
            g.strokeStyle = 'rgba(210,210,210,.5)'; g.lineWidth = 1;
            g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
          }
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tone = status.tone;
  const box = vr ? { left: vr.l, top: vr.t, width: vr.w, height: vr.h } : { left: 0, top: 0, right: 0, bottom: 0 };
  const join = useMemo(() => (joining ? wavePaths(joining.id) : null), [joining]);
  const ringLen = 2 * Math.PI * 15;
  const nextRole: Role | null = !have.S ? 'S' : !have.F ? 'F' : null;
  return (
    <div className={'stack cam-shell' + (mode === 'join' ? ' join-mode' : '')}>
      <div className={'cam-wrap' + (aspect ? ' sized' : '')} ref={wrap} style={aspect ? { aspectRatio: String(aspect) } : undefined} onClick={skipJoin}>
        <video ref={video} playsInline muted aria-label={t('Camera view')} />
        <canvas ref={canvas} aria-hidden="true" />
        <div className="cam-video-box" style={box}>
          <div className="cam-skin" aria-hidden="true"><i className="tick tl" /><i className="tick tr" /><i className="tick bl" /><i className="tick br" /></div>
          <div className={'viewfinder ' + tone} aria-hidden="true" />
          <span className="cam-rec" aria-hidden="true">{t('SCANNING')} ●</span>
          {tally && !joining && (
            <div className="cam-tally" aria-live="off">
              <span>{t('Days')} <Odometer text={String(tally.days)} duration={420} /></span>
              <span>{t('Advances')} <Odometer text={String(tally.adv)} duration={420} /></span>
              <span><Odometer text={tally.net} duration={520} /></span>
            </div>
          )}
          <svg className="cam-lock" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15" className="track" />
            <circle cx="18" cy="18" r="15" className="fill" style={{ strokeDasharray: ringLen, strokeDashoffset: ringLen * (1 - lock) }} />
            <path d="M12 14h3l1.5-2h3l1.5 2h3v9H12z M18 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" className="ico" />
          </svg>
          {shutter > 0 && <div key={shutter} className="shutter" aria-hidden="true" />}
          {flash && <div className="cam-flash" role="status">{flash}</div>}
          {joining && join && shots.S && shots.F && (
            <div className={'tally-join' + (joining.ok ? ' ok' : ' bad')} aria-hidden="true">
              <svg viewBox={`${THUMB.x0} ${THUMB.S.y0} ${THUMB.x1 - THUMB.x0} ${144 + THUMB.F.y1 - THUMB.S.y0}`}>
                <defs>
                  <clipPath id="tj-s"><path d={join.stock} /></clipPath>
                  <clipPath id="tj-f"><path d={join.foil} /></clipPath>
                </defs>
                <g className="tj-top"><image href={shots.S.url} x={THUMB.x0} y={THUMB.S.y0} width={THUMB.x1 - THUMB.x0} height={THUMB.S.y1 - THUMB.S.y0} preserveAspectRatio="none" clipPath="url(#tj-s)" /></g>
                <g className="tj-bot"><image href={shots.F.url} x={THUMB.x0} y={144 + THUMB.F.y0} width={THUMB.x1 - THUMB.x0} height={THUMB.F.y1 - THUMB.F.y0} preserveAspectRatio="none" clipPath="url(#tj-f)" /></g>
                <path className="tj-seam" d={join.seam} pathLength={1} />
              </svg>
              <span className="tj-label">{joining.ok ? t('The halves fit') : t('These halves are not from the same card')}</span>
            </div>
          )}
          <div className={'cam-status ' + tone} role="status" aria-live="polite">
            <span className="cam-hint">{error || status.text}</span>
            {settings.scannerDebug && debug && <span className="cam-debug" data-notranslate>{debug}</span>}
          </div>
        </div>
        <div className="cam-tools">
          {torch !== null && <button className="btn small" onClick={(e) => { e.stopPropagation(); void toggleTorch(); }} aria-pressed={torch}>🔦 {t('Light')}</button>}
          <button className="btn small" onClick={(e) => { e.stopPropagation(); onClose(); }}><Icon name="close" /> {t('Close')}</button>
        </div>
      </div>
      {pill && (
        <div key={pill} className="cam-pill" role="status">
          <span>{pill}</span>
          <span className="cam-pill-flip" aria-hidden="true"><Icon name="card" /></span>
        </div>
      )}
      {mode === 'halves' && (
        <ol className="cam-tray" aria-label={t('Progress')}>
          {(['S', 'F'] as const).map((r) => (
            <li key={r} className={(have[r] ? 'done' : nextRole === r ? 'on' : '')}>
              <span className="slot" ref={(el) => { slots.current[r] = el; }}>
                {shots[r] ? <img src={shots[r]!.url} alt="" /> : <Icon name="card" />}
              </span>
              <span className="dot">{have[r] ? '✓' : r === 'S' ? '1' : '2'}</span>
              <span>{r === 'S' ? t('Worker half') : t('Employer half')}</span>
            </li>
          ))}
          <li className={have.S && have.F ? 'on' : ''}><span className="slot"><Icon name="check" /></span><span className="dot">3</span><span>{t('Result')}</span></li>
        </ol>
      )}
      <div className="row cam-bar">
        <label className="row small ui" style={{ gap: 6, margin: 0 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {t('Auto-capture')}
        </label>
        <button className="btn small" onClick={() => void tick(true)} disabled={!!error}><Icon name="camera" /> {t('Capture now')}</button>
      </div>
    </div>
  );
}

export { POSE_MAX_AGE };
