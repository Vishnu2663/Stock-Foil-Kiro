import { useCallback, useEffect, useRef, useState } from 'react';
import { scanImages } from '../scanAsync';
import { videoFrame } from '../imageIO';
import type { HalfScan } from '../../vision/detect';
import { targetsFor, FIDUCIALS, FID_SIZE } from '../../core/layout';
import { applyH } from '../../core/homography';
import { useApp } from '../ctx';
import { prompt, langInfo, type PromptKey } from '../../i18n/index';
import { speak } from '../../ai/speech';
import { Icon } from './Icon';

interface Props { have: { S: boolean; F: boolean }; onHalf: (h: HalfScan) => void; onClose: () => void }

/** Scan every TICK ms, at up to FRAME_PX on the long side (small or tilted QR codes need the pixels). */
const TICK = 450;
const FRAME_PX = 1600;
/** A half is captured when it reads cleanly on this many scans in a row. */
const STREAK = 2;
/** After a capture, wait this long before looking for the other half. */
const COOLDOWN = 1800;

type Tone = 'good' | 'warn' | '';
interface Captured { role: 'S' | 'F'; id: string; days: number; adv: number; unsure: number; at: number }

/**
 * Why a reading of this half cannot be trusted, or null when it can. Only problems that make the PUNCH
 * reading unreliable block capture. A hidden cut edge or a busy background does not: the result screen
 * reports those, and unsure circles stay marked unsure for a person to check.
 */
function blocker(h: HalfScan): { key: PromptKey; text: string } | null {
  if (h.ambiguousSurface) return { key: 'grey', text: 'The table is the same shade as the grey discs. Use a clearly darker or lighter surface.' };
  if (h.pose.fiducialsFound < 4) return { key: 'whole', text: `Only ${h.pose.fiducialsFound} of 4 corner squares are visible. Show the whole half, flat to the camera.` };
  if (h.warnings.includes('partial') || h.cells.some((c) => !Number.isFinite(c.ratio))) return { key: 'whole', text: 'Part of the half is out of view. Show the whole half.' };
  if (h.pose.pxPerMm < 2.5) return { key: 'closer', text: 'Move the half closer to the camera.' };
  if (h.warnings.includes('dark-photo')) return { key: 'light', text: 'Too dark. Add light.' };
  return null;
}

const summary = (h: HalfScan) => {
  const days = new Set(h.cells.filter((c) => c.kind === 'day' && c.punched).map((c) => c.n)).size;
  const adv = h.cells.filter((c) => c.kind === 'adv' && c.punched).length;
  const unsure = h.cells.filter((c) => c.unsure).length;
  return { days, adv, unsure };
};

export function Camera({ have, onHalf, onClose }: Props) {
  const { t, settings, lang } = useApp();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<{ text: string; tone: Tone }>({ text: t('Starting the camera…'), tone: '' });
  const [torch, setTorch] = useState<boolean | null>(null);
  const [auto, setAuto] = useState(true);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [shutter, setShutter] = useState(0);
  const autoRef = useRef(true);
  autoRef.current = auto;
  const live = useRef<{ half: HalfScan; scale: number; at: number }[]>([]);
  const streak = useRef<{ key: string; n: number }>({ key: '', n: 0 });
  const lastCapture = useRef(0);
  // What this camera session already handed to the page. Kept apart from `have` so a half is never
  // captured twice while the page is still re-rendering.
  const got = useRef({ S: have.S, F: have.F });
  useEffect(() => { got.current = { S: have.S, F: have.F }; }, [have.S, have.F]);
  const lastSpoken = useRef<{ k: string; at: number }>({ k: '', at: 0 });

  const say = useCallback((k: PromptKey, force = false) => {
    if (!settings.simple) return;
    const now = Date.now();
    if (!force && lastSpoken.current.k === k && now - lastSpoken.current.at < 7000) return;
    if (!force && now - lastSpoken.current.at < 2500) return;
    lastSpoken.current = { k, at: now };
    speak(prompt(lang, k), { lang: langInfo(lang).speech, rate: settings.speakRate });
  }, [settings.simple, settings.speakRate, lang]);
  const sayRef = useRef(say);
  sayRef.current = say;

  const capture = useCallback((h: HalfScan) => {
    const role = h.decoded.role;
    got.current = { ...got.current, [role]: true };
    lastCapture.current = Date.now();
    streak.current = { key: '', n: 0 };
    const s = summary(h);
    setCaptured({ role, id: h.decoded.spec.id, ...s, at: Date.now() });
    setShutter((n) => n + 1);
    navigator.vibrate?.(60);
    onHalf(h);
    const other = role === 'S' ? 'F' : 'S';
    if (got.current[other]) sayRef.current('done', true);
    else sayRef.current(other === 'F' ? 'foil' : 'stock', true);
  }, [onHalf]);

  // Start the rear camera, falling back step by step: some phones refuse the size or the facing mode.
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
        setError(name === 'NotAllowedError' ? t('Camera permission was denied. You can choose photos instead.')
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
      setStatus({ text: got.current.S ? t('Now show the employer half.') : t('Show the worker half.'), tone: '' });
      sayRef.current(got.current.S ? 'foil' : 'stock');
    })();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((x) => x.stop());
      stream.current = null;
    };
  }, [t]);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch { /* not supported */ }
  };

  // The reading loop. Each tick scans one frame in the worker; the half that is captured is exactly the
  // half that was checked, so what is verified is what is saved.
  useEffect(() => {
    let stop = false;
    let busy = false;
    const tick = async () => {
      const v = video.current;
      if (stop || busy || document.hidden || !v || v.readyState < 2 || !v.videoWidth) return;
      if (Date.now() - lastCapture.current < COOLDOWN) return;
      const f = videoFrame(v, FRAME_PX);
      if (!f) return;
      busy = true;
      try {
        const [res] = await scanImages([f.img], { maxQrLevel: 2 });
        if (stop || !res) return;
        const now = performance.now();
        live.current = res.halves.map((h) => ({ half: h, scale: f.scale, at: live.current.find((x) => x.half.decoded.raw === h.decoded.raw)?.at ?? now }));
        const need = (r: 'S' | 'F') => !got.current[r];
        const h = res.halves.find((x) => need(x.decoded.role)) ?? res.halves[0];
        const wantText = got.current.S ? t('Now show the employer half (foil).') : got.current.F ? t('Now show the worker half (stock).') : t('Show a half to the camera. Hold it flat in good light, whole half in view.');
        if (!h) {
          streak.current = { key: '', n: 0 };
          setStatus({ text: res.foreign.length ? t('That QR code is not a Stock & Foil card.') : wantText, tone: res.foreign.length ? 'warn' : '' });
          return;
        }
        const role = h.decoded.role;
        if (!need(role)) {
          streak.current = { key: '', n: 0 };
          setStatus({ text: role === 'S' ? t('The worker half is already captured. Show the employer half.') : t('The employer half is already captured. Show the worker half.'), tone: 'warn' });
          return;
        }
        const why = blocker(h);
        if (why) {
          streak.current = { key: '', n: 0 };
          setStatus({ text: t(why.text), tone: 'warn' });
          sayRef.current(why.key);
          return;
        }
        const key = role + h.decoded.spec.id;
        streak.current = { key, n: streak.current.key === key ? streak.current.n + 1 : 1 };
        const s = summary(h);
        const label = role === 'S' ? t('Worker half') : t('Employer half');
        const seen = t('{0} days, {1} advances', s.days, s.adv) + (s.unsure ? ' · ' + t('{0} unsure', s.unsure) : '');
        if (autoRef.current && streak.current.n >= STREAK) {
          capture(h);
          setStatus({ text: `✓ ${label} ${t('captured')}`, tone: 'good' });
        } else {
          setStatus({ text: `✓ ${label} ${t('detected')} · ${seen}. ${autoRef.current ? t('Hold still…') : t('Tap Capture.')}`, tone: 'good' });
          if (autoRef.current) sayRef.current('still');
        }
      } catch { /* keep going */ } finally { busy = false; }
    };
    const timer = setInterval(tick, TICK);
    const vis = () => { const v = video.current; if (!v) return; if (document.hidden) v.pause(); else v.play().catch(() => undefined); };
    document.addEventListener('visibilitychange', vis);
    return () => { stop = true; clearInterval(timer); document.removeEventListener('visibilitychange', vis); };
  }, [capture, t]);

  // Manual capture: read the current frame and take the half that is still needed, if one is readable.
  const captureNow = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const f = videoFrame(v, FRAME_PX);
    if (!f) return;
    setStatus({ text: t('Reading…'), tone: '' });
    try {
      const [res] = await scanImages([f.img]);
      const h = res?.halves.find((x) => !got.current[x.decoded.role]);
      if (!h) { setStatus({ text: t('No card half that is still needed was found in this frame.'), tone: 'warn' }); return; }
      capture(h);
    } catch { setStatus({ text: t('The scanner could not read this frame.'), tone: 'warn' }); }
  };

  // Live overlay mapped through object-fit: contain.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current, v = video.current;
      if (!c || !v || !v.videoWidth) return;
      const cw = c.clientWidth, ch = c.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cw, ch);
      const s = Math.min(cw / v.videoWidth, ch / v.videoHeight);
      const ox = (cw - v.videoWidth * s) / 2, oy = (ch - v.videoHeight * s) / 2;
      const now = performance.now();
      for (const { half, scale, at } of live.current) {
        const age = now - at;
        const k = Math.min(1, age / 260);
        const done = got.current[half.decoded.role];
        const col = done ? 'rgba(143,180,255,.95)' : 'rgba(76,195,138,.95)';
        const map = (x: number, y: number) => { const [u, w] = applyH(half.pose.H, x, y); return [ox + (u / scale) * s, oy + (w / scale) * s] as const; };
        const toScreen = (p: [number, number]) => [ox + (p[0] / scale) * s, oy + (p[1] / scale) * s] as const;
        g.lineWidth = 3;
        g.strokeStyle = col;
        g.beginPath();
        half.outline.forEach((p, i) => { const [x, y] = toScreen(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.closePath();
        g.stroke();
        FIDUCIALS.forEach(([fx, fy], i) => {
          g.strokeStyle = half.pose.fiducials[i] ? col : 'rgba(240,164,58,.95)';
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
          const r = Math.max(2, Math.abs(x2 - x)) * (0.6 + 0.4 * k);
          g.setLineDash(cell.unsure ? [4, 3] : []);
          g.lineWidth = cell.punched || cell.unsure ? 2.5 : 1;
          g.strokeStyle = cell.unsure ? 'rgba(240,164,58,.95)' : cell.punched ? 'rgba(76,195,138,.95)' : 'rgba(255,255,255,.35)';
          if (cell.punched && !cell.unsure) { g.fillStyle = 'rgba(76,195,138,.2)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.stroke();
        }
        g.setLineDash([]);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hide the "captured" card once the next half is in view for a while.
  useEffect(() => {
    if (!captured) return;
    const id = setTimeout(() => setCaptured((c) => (c && Date.now() - c.at >= 5500 ? null : c)), 6000);
    return () => clearTimeout(id);
  }, [captured]);

  const tone = status.tone;
  const next = captured ? (captured.role === 'S' ? (have.F ? null : 'F') : (have.S ? null : 'S')) : null;
  return (
    <div className="stack">
      <div className="cam-wrap">
        <video ref={video} playsInline muted aria-label={t('Camera view')} />
        <canvas ref={canvas} aria-hidden="true" />
        <div className={'viewfinder ' + tone} aria-hidden="true"><span className="beam" /></div>
        {shutter > 0 && <div key={shutter} className="shutter" aria-hidden="true" />}
        <div className="cam-tools">
          {torch !== null && <button className="btn small" onClick={toggleTorch} aria-pressed={torch}>🔦 {t('Torch')}</button>}
          <button className="btn small" onClick={onClose}><Icon name="close" /> {t('Close')}</button>
        </div>
        {captured && (
          <div key={captured.at} className="cam-captured" role="status" aria-live="assertive">
            <span className="cc-tick" aria-hidden="true"><Icon name="check" /></span>
            <div>
              <b>{captured.role === 'S' ? t('Worker half scanned') : t('Employer half scanned')}</b>
              <span>{t('Card {0}', captured.id)} · {t('{0} days, {1} advances', captured.days, captured.adv)}{captured.unsure ? ' · ' + t('{0} unsure', captured.unsure) : ''}</span>
              {next && <span className="cc-next">{next === 'F' ? t('Next: show the employer half (foil)') : t('Next: show the worker half (stock)')} →</span>}
            </div>
          </div>
        )}
        <div className="cam-status" role="status" aria-live="polite">
          <span>{error || status.text}</span>
        </div>
      </div>
      <div className="row cam-bar">
        <span className={'chip ' + (have.S ? 'good' : 'grey')}>{have.S ? '✔' : '1'} {t('Worker half')}</span>
        <span className={'chip ' + (have.F ? 'good' : 'grey')}>{have.F ? '✔' : '2'} {t('Employer half')}</span>
        <label className="row small ui" style={{ gap: 6, margin: 0 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {t('Auto-capture')}
        </label>
        {!auto && <button className="btn primary small" onClick={captureNow} disabled={!!error}><Icon name="camera" /> {t('Capture')}</button>}
      </div>
    </div>
  );
}
