// Small motion helpers shared by the camera HUD and the result reveal.
// Everything that schedules work goes through a Scope, so closing the camera or leaving the page cancels
// every timer, animation frame, WAAPI animation and sound at once (no leaks).

export interface Env { reduced: boolean; lite: boolean; hidden: boolean }
export function motionEnv(): Env {
  if (typeof document === 'undefined') return { reduced: true, lite: false, hidden: true };
  const b = document.body;
  const rq = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { reduced: !!rq || b.classList.contains('reduced'), lite: b.classList.contains('lite'), hidden: document.hidden };
}

export interface Scope {
  timeout(fn: () => void, ms: number): void;
  raf(fn: (t: number) => void): void;
  animate(el: Element | null | undefined, k: Keyframe[], o: KeyframeAnimationOptions): Animation | null;
  add(dispose: () => void): void;
  dispose(): void;
  readonly disposed: boolean;
  /** live counts, for tests */
  readonly pending: { timeouts: number; rafs: number; other: number };
}

export function createScope(api: {
  setTimeout: (f: () => void, ms: number) => unknown; clearTimeout: (id: unknown) => void;
  requestAnimationFrame: (f: (t: number) => void) => unknown; cancelAnimationFrame: (id: unknown) => void;
} = globalThis as never): Scope {
  const timeouts = new Set<unknown>();
  const rafs = new Set<unknown>();
  const other = new Set<() => void>();
  let disposed = false;
  return {
    get disposed() { return disposed; },
    get pending() { return { timeouts: timeouts.size, rafs: rafs.size, other: other.size }; },
    timeout(fn, ms) {
      if (disposed) return;
      const id = api.setTimeout(() => { timeouts.delete(id); if (!disposed) fn(); }, ms);
      timeouts.add(id);
    },
    raf(fn) {
      if (disposed) return;
      const id = api.requestAnimationFrame((t) => { rafs.delete(id); if (!disposed) fn(t); });
      rafs.add(id);
    },
    animate(el, k, o) {
      if (disposed || !el || typeof (el as HTMLElement).animate !== 'function') return null;
      const a = (el as HTMLElement).animate(k, o);
      const stop = () => { try { a.cancel(); } catch { /* gone */ } };
      other.add(stop);
      a.finished.then(() => other.delete(stop), () => other.delete(stop));
      return a;
    },
    add(fn) { if (disposed) fn(); else other.add(fn); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of timeouts) api.clearTimeout(id);
      for (const id of rafs) api.cancelAnimationFrame(id);
      for (const fn of other) { try { fn(); } catch { /* ignore */ } }
      timeouts.clear(); rafs.clear(); other.clear();
    },
  };
}

// ---------------- one canvas of paper confetti ----------------

export const CONFETTI = ['#f4ead2', '#a8322a', '#2f9a64', '#d9a441', '#e9d9b0', '#7a1f1f'];

/**
 * Paper confetti from a point (viewport px). One canvas, removed when the last piece falls. Pauses while the
 * tab is hidden (rAF stops). Returns the number of pieces actually created (0 with reduced motion).
 */
export function confetti(scope: Scope, x: number, y: number, n: number, env = motionEnv()): number {
  if (env.reduced || n <= 0 || typeof document === 'undefined') return 0;
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  c.className = 'confetti-canvas';
  document.body.appendChild(c);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const parts = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const v = 6 + Math.random() * 8;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, c: CONFETTI[i % CONFETTI.length] };
  });
  const remove = () => c.remove();
  scope.add(remove);
  const t0 = performance.now();
  const step = (t: number) => {
    g.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of parts) {
      p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      if (p.y < innerHeight + 20) alive++;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 2)), p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 0.5);
      g.restore();
    }
    if (alive && t - t0 < 4000) scope.raf(step); else remove();
  };
  scope.raf(step);
  return n;
}

// ---------------- the punch-clock "ka-chunk", synthesized ----------------

let ctx: AudioContext | null = null;
/** A quiet mechanical punch: a noise click ("ka") then a low thump ("chunk"). Never plays when hidden. */
export function kaChunk(scope: Scope, on: boolean, env = motionEnv()) {
  if (!on || env.reduced || env.hidden || typeof window === 'undefined') return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx ??= new AC();
    const a = ctx;
    if (a.state === 'suspended') void a.resume();
    const now = a.currentTime;
    const out = a.createGain();
    out.gain.value = 0.18;
    out.connect(a.destination);
    const len = Math.floor(a.sampleRate * 0.03);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const click = a.createBufferSource();
    click.buffer = buf;
    const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    click.connect(hp).connect(out);
    click.start(now);
    const o = a.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(150, now + 0.07); o.frequency.exponentialRampToValueAtTime(55, now + 0.2);
    const og = a.createGain(); og.gain.setValueAtTime(0.0001, now + 0.07); og.gain.exponentialRampToValueAtTime(0.9, now + 0.08); og.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    o.connect(og).connect(out);
    o.start(now + 0.07); o.stop(now + 0.26);
    scope.add(() => { try { click.stop(); o.stop(); out.disconnect(); } catch { /* done */ } });
  } catch { /* audio not allowed */ }
}

/** The reveal timeline: instant (final state at once, no particles) with reduced motion. */
export function revealPlan(level: 'full' | 'match' | 'warn' | 'bad' | 'none', env: Env) {
  const instant = env.reduced;
  const n = instant ? 0 : level === 'full' ? 90 : level === 'match' ? 40 : 0;
  return {
    instant,
    particles: env.lite ? Math.round(n / 2) : n,
    splatter: !instant && !env.lite && level !== 'none',
    shake: !instant && level !== 'none',
    sheen: !instant && (level === 'full' || level === 'match'),
    stampAt: instant ? 0 : 200, amountAt: instant ? 0 : 650, formulaAt: instant ? 0 : 900, gridAt: instant ? 0 : 1100, burstAt: instant ? 0 : 600,
  };
}
