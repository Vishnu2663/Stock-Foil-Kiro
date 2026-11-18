import { useCallback, useEffect, useRef, useState } from 'react';
import { scanImages } from '../scanAsync';
import { videoFrame } from '../imageIO';
import type { HalfScan } from '../../vision/detect';
import { captureBlocker, debugLine, readingSummary, type Blocker } from '../../vision/capture';
import { targetsFor, FIDUCIALS, FID_SIZE } from '../../core/layout';
import { applyH } from '../../core/homography';
import { useApp } from '../ctx';
import { prompt, langInfo, type PromptKey } from '../../i18n/index';
import { speak } from '../../ai/speech';
import { Icon } from './Icon';

interface Props { have: { S: boolean; F: boolean }; onHalf: (h: HalfScan) => void; onClose: () => void }

/** Live-loop timing, as in the live app. */
export const CAMERA = { tick: 450, framePx: 1600, streak: 2, cooldown: 1800, flash: 1600, retry: 7000, holdMs: 2200, fadeMs: 800 };

type Tone = 'good' | 'warn' | '';
interface Live { halves: HalfScan[]; scale: number; at: number }
interface Rect { l: number; t: number; w: number; h: number }

const KEY: Record<Blocker['code'], PromptKey> = { surface: 'grey', corners: 'whole', hidden: 'whole', far: 'closer', dark: 'light' };

/**
 * The camera captures by itself. Every 450 ms a frame (up to 1600 px) goes through the payday scanner in the
 * worker. When a half that is still needed reads cleanly on 2 ticks in a row it is captured: vibrate, flash,
 * then 1.8 s before looking for the other half. The reason it is not capturing is always shown on the video.
 */
export function Camera({ have, onHalf, onClose }: Props) {
  const app = useApp();
  const { t, settings } = app;
  const appRef = useRef(app);
  appRef.current = app;
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<{ text: string; tone: Tone }>({ text: t('Starting the camera…'), tone: '' });
  const [debug, setDebug] = useState('');
  const [torch, setTorch] = useState<boolean | null>(null);
  const [auto, setAuto] = useState(true);
  const [flash, setFlash] = useState('');
  const [shutter, setShutter] = useState(0);
  const [vr, setVr] = useState<Rect | null>(null);
  const autoRef = useRef(true);
  autoRef.current = auto;
  const live = useRef<Live | null>(null);
  const born = useRef(new Map<string, number>());
  const toneRef = useRef<Tone>('');
  toneRef.current = status.tone;
  const streak = useRef<{ key: string; n: number }>({ key: '', n: 0 });
  const lastCapture = useRef(0);
  // What this session already handed to the page. Kept apart from `have` so a half is never captured twice
  // while the page re-renders; if the page has not marked it done 7 s later, it may be captured again.
  const got = useRef({ S: have.S, F: have.F });
  const haveRef = useRef(have);
  useEffect(() => { haveRef.current = have; got.current = { S: have.S || got.current.S, F: have.F || got.current.F }; }, [have.S, have.F]);
  const lastSpoken = useRef<{ k: string; at: number }>({ k: '', at: 0 });
  const onHalfRef = useRef(onHalf);
  onHalfRef.current = onHalf;

  /** Spoken prompts in pictures-and-voice mode: the same prompt at most every 7 s, never over other speech. */
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
      case 'corners': return t('Only {0}/4 corner squares seen: show the whole half, flat to the camera.', b.found);
      case 'hidden': return t('Some punch spots are cut off: show the whole half.');
      case 'far': return t('Move the half closer to the camera.');
      case 'dark': return t('Too dark: add light.');
    }
  };

  const capture = useCallback((h: HalfScan) => {
    const role = h.decoded.role;
    const t = appRef.current.t;
    got.current = { ...got.current, [role]: true };
    lastCapture.current = Date.now();
    streak.current = { key: '', n: 0 };
    navigator.vibrate?.(60);
    setShutter((n) => n + 1);
    const msg = role === 'S' ? t('✓ worker half captured') : t('✓ employer half captured');
    setFlash(msg);
    setTimeout(() => setFlash((f) => (f === msg ? '' : f)), CAMERA.flash);
    setStatus({ text: msg, tone: 'good' });
    onHalfRef.current(h);
    setTimeout(() => { if (!haveRef.current[role]) got.current = { ...got.current, [role]: false }; }, CAMERA.retry);
    const other = role === 'S' ? 'F' : 'S';
    say(got.current[other] ? 'done' : other === 'F' ? 'foil' : 'stock', true);
  }, [say]);

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

  // Where the video is drawn inside the box (object-fit: contain), so the frame and the bar match it.
  useEffect(() => {
    const measure = () => {
      const v = video.current, w = wrap.current;
      if (!v || !w || !v.videoWidth) return;
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

  /** One tick: scan the frame, explain why it is (not) capturing, capture on 2 clean reads in a row. */
  const tick = useCallback(async (manual = false) => {
    const v = video.current;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
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
    if (!res) return;
    const now = performance.now();
    const need = (r: 'S' | 'F') => !got.current[r];
    const idle = got.current.S ? t('Show the EMPLOYER half (foil) to the camera…') : got.current.F ? t('Show the WORKER half (stock) to the camera…') : t('Show a half to the camera. Hold it flat in good light, whole half in view.');
    if (!res.halves.length) {
      live.current = null; // nothing in view: clear the overlay at once
      born.current.clear();
      streak.current = { key: '', n: 0 };
      setDebug(st.scannerDebug ? `no QR · ${res.squaresSeen ?? 0} square blobs · ${res.ms} ms` : '');
      if (res.foreign.length) setStatus({ text: t('That QR code is not a Stock & Foil card.'), tone: 'warn' });
      else if ((res.squaresSeen ?? 0) >= 3) setStatus({ text: t('A card is in view but its QR code cannot be read yet: move it closer and hold still.'), tone: 'warn' });
      else { setStatus({ text: idle, tone: '' }); say(got.current.S ? 'foil' : 'stock'); }
      return;
    }
    live.current = { halves: res.halves, scale: f.scale, at: now };
    const h = res.halves.find((x) => need(x.decoded.role)) ?? res.halves[0];
    const role = h.decoded.role;
    const label = role === 'S' ? t('worker') : t('employer');
    setDebug(st.scannerDebug ? `${debugLine(h)} · ${res.ms} ms` : '');
    if (!need(role)) {
      streak.current = { key: '', n: 0 };
      setStatus({ text: role === 'S' ? t('The worker half is already captured. Show the EMPLOYER half.') : t('The employer half is already captured. Show the WORKER half.'), tone: 'warn' });
      return;
    }
    if (manual) { capture(h); return; }
    const why = captureBlocker(h);
    if (why) {
      streak.current = { key: '', n: 0 };
      setStatus({ text: blockText(why), tone: 'warn' });
      say(KEY[why.code]);
      return;
    }
    const key = role + h.decoded.spec.id;
    streak.current = { key, n: streak.current.key === key ? streak.current.n + 1 : 1 };
    const s = readingSummary(h);
    const seen = t('days {0} · advances {1}', s.days.length ? s.days.join(',') : t('none'), s.adv.length ? s.adv.join(',') : t('none'));
    if (autoRef.current && streak.current.n >= CAMERA.streak) { capture(h); return; }
    const tip = h.warnings.includes('edge-hidden') ? ' ' + t('Tip: keep fingers off the wavy edge so it can be checked.') : '';
    setStatus({ text: (autoRef.current ? t('✓ {0} half detected ({1}). Hold still…', label, seen) : t('✓ {0} half detected ({1}). Tap Capture now.', label, seen)) + tip, tone: 'good' });
    if (autoRef.current) say('still');
  }, [capture, say]);

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

  // Overlay: frame outline, the 4 corner markers (green found, orange missed) and every target
  // (green punched, grey blank, amber unsure). Holds 2.2 s after the last scan, then fades out by 3 s.
  useEffect(() => {
    let raf = 0;
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
      const L = live.current;
      if (!L || !v.videoWidth) return;
      const now = performance.now();
      const age = now - L.at;
      const fade = age < CAMERA.holdMs ? 1 : age < CAMERA.holdMs + CAMERA.fadeMs ? 1 - (age - CAMERA.holdMs) / CAMERA.fadeMs : 0;
      if (fade <= 0) { live.current = null; return; }
      const s = Math.min(cw / v.videoWidth, ch / v.videoHeight);
      const ox = (cw - v.videoWidth * s) / 2, oy = (ch - v.videoHeight * s) / 2;
      g.globalAlpha = fade;
      for (const half of L.halves) {
        const toScreen = (p: [number, number]) => [ox + (p[0] / L.scale) * s, oy + (p[1] / L.scale) * s] as const;
        const map = (x: number, y: number) => toScreen(applyH(half.pose.H, x, y));
        const done = got.current[half.decoded.role];
        const col = done ? '#8fb4ff' : toneRef.current === 'good' ? '#2fbf71' : '#f6a609';
        g.lineJoin = 'round';
        g.lineWidth = 2;
        g.strokeStyle = col;
        g.beginPath();
        half.outline.forEach((p, i) => { const [x, y] = toScreen(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.closePath();
        g.stroke();
        FIDUCIALS.forEach(([fx, fy], i) => {
          g.lineWidth = 2.5;
          g.strokeStyle = half.pose.fiducials[i] ? '#2fbf71' : '#f6a609';
          g.beginPath();
          const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => map(fx + (a * FID_SIZE) / 2, fy + (b * FID_SIZE) / 2));
          corners.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.closePath();
          g.stroke();
        });
        const cells = new Map(half.cells.map((x) => [x.key, x]));
        for (const tg of targetsFor(half.decoded.spec)) {
          const cell = cells.get(tg.key);
          if (!cell) continue;
          const [x, y] = map(tg.cx, tg.cy);
          const [x2] = map(tg.cx + 3, tg.cy);
          const R = Math.max(2, Math.abs(x2 - x));
          const key = half.decoded.role + tg.key;
          if (cell.unsure) {
            g.setLineDash([4, 3]); g.lineWidth = 2; g.strokeStyle = '#f6a609';
            g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
            born.current.delete(key);
          } else if (cell.punched) {
            if (!born.current.has(key)) born.current.set(key, now);
            const k = Math.min(1, (now - born.current.get(key)!) / 280);
            const r = R * (0.4 + 0.6 * (1 - (1 - k) ** 3));
            g.fillStyle = 'rgba(47,191,113,.22)'; g.strokeStyle = '#2fbf71'; g.lineWidth = 2.4;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
          } else {
            born.current.delete(key);
            g.strokeStyle = 'rgba(200,200,200,.55)'; g.lineWidth = 1;
            g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
          }
        }
      }
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tone = status.tone;
  const box = vr ? { left: vr.l, top: vr.t, width: vr.w, height: vr.h } : { left: 0, top: 0, right: 0, bottom: 0 };
  return (
    <div className="stack">
      <div className="cam-wrap" ref={wrap}>
        <video ref={video} playsInline muted aria-label={t('Camera view')} />
        <canvas ref={canvas} aria-hidden="true" />
        <div className="cam-video-box" style={box}>
          <div className={'viewfinder ' + tone} aria-hidden="true"><span className="beam" /></div>
          {shutter > 0 && <div key={shutter} className="shutter" aria-hidden="true" />}
          {flash && <div className="cam-flash" role="status">{flash}</div>}
          <div className={'cam-status ' + tone} role="status" aria-live="polite">
            <span className="cam-hint">{error || status.text}</span>
            {settings.scannerDebug && debug && <span className="cam-debug" data-notranslate>{debug}</span>}
          </div>
        </div>
        <div className="cam-tools">
          {torch !== null && <button className="btn small" onClick={toggleTorch} aria-pressed={torch}>🔦 {t('Light')}</button>}
          <button className="btn small" onClick={onClose}><Icon name="close" /> {t('Close')}</button>
        </div>
      </div>
      <div className="row cam-bar">
        <span className={'chip ' + (have.S ? 'good' : 'grey')}>{have.S ? '✓' : '○'} {t('Worker half')}</span>
        <span className={'chip ' + (have.F ? 'good' : 'grey')}>{have.F ? '✓' : '○'} {t('Employer half')}</span>
        <label className="row small ui" style={{ gap: 6, margin: 0 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {t('Auto-capture')}
        </label>
        <button className="btn small" onClick={() => void tick(true)} disabled={!!error}><Icon name="camera" /> {t('Capture now')}</button>
      </div>
    </div>
  );
}
