// Ambient effects: ripple, scroll reveal, pointer tilt (one style write per frame, no blur), lite and reduced modes.

let started = false;

export function initFx() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const body = document.body;
  const liteQ = matchMedia('(max-width: 1000px), (pointer: coarse)');
  const redQ = matchMedia('(prefers-reduced-motion: reduce)');
  const apply = () => {
    body.classList.toggle('lite', liteQ.matches);
    body.classList.toggle('reduced', redQ.matches);
  };
  apply();
  liteQ.addEventListener?.('change', apply);
  redQ.addEventListener?.('change', apply);

  // Ripple on press.
  document.addEventListener('pointerdown', (e) => {
    if (body.classList.contains('reduced')) return;
    const el = (e.target as Element).closest?.('.btn') as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    const r = el.getBoundingClientRect();
    const s = Math.max(r.width, r.height);
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = span.style.height = `${s}px`;
    span.style.left = `${e.clientX - r.left - s / 2}px`;
    span.style.top = `${e.clientY - r.top - s / 2}px`;
    el.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
    setTimeout(() => span.remove(), 900);
  }, { passive: true });

  // Scroll reveal, staggered.
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io?.unobserve(en.target); }
      }, { rootMargin: '0px 0px -8% 0px' })
    : null;
  const scanReveal = (root: ParentNode) => {
    const els = root.querySelectorAll<HTMLElement>('[data-reveal]:not(.in):not([data-seen])');
    els.forEach((el, i) => {
      el.dataset.seen = '1';
      if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', String(i % 8));
      if (!io || body.classList.contains('reduced')) el.classList.add('in');
      else io.observe(el);
    });
  };
  const panels = (root: ParentNode) => {
    // every panel on a page rises in once when it scrolls into view
    root.querySelectorAll<HTMLElement>('.page .panel:not([data-reveal]):not([data-seen])').forEach((el) => { el.dataset.reveal = ''; });
  };
  let queued = false;
  const pass = () => {
    queued = false;
    panels(document);
    scanReveal(document);
    labelTables(document);
    document.querySelectorAll<HTMLElement>('.seg').forEach(segPill);
  };
  pass();
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(pass); } })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-checked'] });
  window.addEventListener('resize', () => document.querySelectorAll<HTMLElement>('.seg').forEach(segPill), { passive: true });

  // Pointer tilt: hover is detected on the still [data-tilt] wrapper and only its inner .tilt-in moves.
  initTilt(document, body);
  // Pause background motion while scrolling.
  let st: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('scroll', () => {
    body.classList.add('scrolling');
    clearTimeout(st);
    st = setTimeout(() => body.classList.remove('scrolling'), 160);
  }, { passive: true });
}

/** Tables become cards on phones: each cell gets its column name as data-label (from the header row). */
export function labelTables(root: ParentNode) {
  root.querySelectorAll<HTMLTableElement>('table.table').forEach((tb) => {
    const heads = [...tb.querySelectorAll('thead th')].map((th) => (th.textContent ?? '').trim());
    if (!heads.length) return;
    tb.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => { if (heads[i] && (td as HTMLElement).dataset.label !== heads[i]) (td as HTMLElement).dataset.label = heads[i]; });
    });
    tb.classList.add('cards-sm');
  });
}

/** The sliding pill of a segmented control: one element moved under the selected button. */
export function segPill(seg: HTMLElement) {
  let pill = seg.querySelector<HTMLElement>(':scope > .seg-pill');
  if (!pill) { pill = document.createElement('span'); pill.className = 'seg-pill'; pill.setAttribute('aria-hidden', 'true'); seg.prepend(pill); }
  const on = seg.querySelector<HTMLElement>(':scope > .on, :scope > [aria-checked="true"]');
  if (!on) { pill.style.opacity = '0'; return; }
  const x = on.offsetLeft + 'px', y = on.offsetTop + 'px', w = on.offsetWidth + 'px', h = on.offsetHeight + 'px';
  if (pill.style.getPropertyValue('--x') === x && pill.style.width === w && pill.style.getPropertyValue('--y') === y) return;
  pill.style.opacity = '1';
  pill.style.setProperty('--x', x); pill.style.setProperty('--y', y);
  pill.style.width = w; pill.style.height = h;
}

// ---------------- pointer tilt ----------------

export interface TiltVars { rx: number; ry: number; mx: number; my: number; sx: number; sy: number }
const REST: TiltVars = { rx: 0, ry: 0, mx: 50, my: 50, sx: 0, sy: 0 };

/** Tilt for a pointer at (x, y) over a box: rotation (deg, at most max), light spot (%) and a shadow shift (px) opposite the tilt. */
export function tiltVars(r: { left: number; top: number; width: number; height: number }, x: number, y: number, max = 8): TiltVars {
  const u = Math.max(-0.5, Math.min(0.5, (x - r.left) / Math.max(1, r.width) - 0.5));
  const v = Math.max(-0.5, Math.min(0.5, (y - r.top) / Math.max(1, r.height) - 0.5));
  const rx = -v * max, ry = u * max;
  return { rx, ry, mx: (u + 0.5) * 100, my: (v + 0.5) * 100, sx: -ry * 1.5, sy: -rx * 1.5 };
}

/** Write the tilt as CSS variables (one write per frame); null = rest, with a smooth return. */
export function applyTilt(el: HTMLElement, v: TiltVars | null) {
  const t = v ?? REST;
  el.classList.toggle('tilting', !!v);
  el.style.setProperty('--rx', t.rx.toFixed(2) + 'deg');
  el.style.setProperty('--ry', t.ry.toFixed(2) + 'deg');
  el.style.setProperty('--mx', t.mx.toFixed(1) + '%');
  el.style.setProperty('--my', t.my.toFixed(1) + '%');
  el.style.setProperty('--sx', t.sx.toFixed(1) + 'px');
  el.style.setProperty('--sy', t.sy.toFixed(1) + 'px');
}

/** Off on touch, lite and reduced. Returns a cleanup. */
export function initTilt(doc: Document, body: HTMLElement): () => void {
  let host: HTMLElement | null = null;
  let px = 0, py = 0, raf = 0;
  const off = () => body.classList.contains('lite') || body.classList.contains('reduced');
  const write = () => {
    raf = 0;
    if (!host) return;
    if (off()) { applyTilt(host, null); return; }
    applyTilt(host, tiltVars(host.getBoundingClientRect(), px, py, Number(host.dataset.tilt || 8)));
  };
  const leave = () => { if (host) applyTilt(host, null); host = null; if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  const move = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || off()) { leave(); return; }
    const el = (e.target as Element).closest?.('[data-tilt]') as HTMLElement | null;
    if (el !== host) { leave(); host = el; }
    if (!host) return;
    px = e.clientX; py = e.clientY;
    if (!raf) raf = requestAnimationFrame(write);
  };
  const out = (e: PointerEvent) => {
    if (!host) return;
    const to = e.relatedTarget as Node | null;
    if (!to || !host.contains(to)) leave();
  };
  doc.addEventListener('pointermove', move, { passive: true });
  doc.addEventListener('pointerout', out, { passive: true });
  doc.addEventListener('pointercancel', leave, { passive: true });
  return () => { leave(); doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerout', out); doc.removeEventListener('pointercancel', leave); };
}

/** Party pops over an element (confetti bits), skipped on reduced motion. */
export function partyPops(host: HTMLElement, n = 46) {
  if (document.body.classList.contains('reduced')) return;
  const layer = document.createElement('div');
  layer.className = 'pops';
  const colors = ['#e2584a', '#f0a43a', '#4cc38a', '#e0832f', '#7a1f1f', '#f4ead2'];
  const w = host.clientWidth, h = host.clientHeight;
  const count = document.body.classList.contains('lite') ? Math.round(n * 0.6) : n;
  for (let i = 0; i < count; i++) {
    const b = document.createElement('i');
    b.className = 'pop-bit';
    const ox = Math.random() * w, oy = h * (0.25 + Math.random() * 0.5);
    b.style.left = `${ox}px`;
    b.style.top = `${oy}px`;
    b.style.background = colors[i % colors.length];
    b.style.setProperty('--dx', `${(Math.random() - 0.5) * w * 0.9}px`);
    b.style.setProperty('--dy', `${-60 - Math.random() * h * 0.9}px`);
    b.style.setProperty('--r', `${(Math.random() - 0.5) * 900}deg`);
    b.style.animationDelay = `${Math.random() * 180}ms`;
    layer.appendChild(b);
  }
  host.appendChild(layer);
  setTimeout(() => layer.remove(), 2000);
}
