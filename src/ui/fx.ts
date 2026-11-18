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
  scanReveal(document);
  new MutationObserver(() => scanReveal(document)).observe(document.body, { childList: true, subtree: true });

  // Pointer tilt for [data-tilt]: at most one style write per frame.
  let target: HTMLElement | null = null;
  let px = 0, py = 0, raf = 0;
  const write = () => {
    raf = 0;
    if (!target) return;
    const r = target.getBoundingClientRect();
    const x = (px - r.left) / r.width - 0.5, y = (py - r.top) / r.height - 0.5;
    const max = Number(target.dataset.tilt || 8);
    target.style.transform = `rotateY(${(x * max).toFixed(2)}deg) rotateX(${(-y * max).toFixed(2)}deg)`;
  };
  document.addEventListener('pointermove', (e) => {
    if (body.classList.contains('lite') || body.classList.contains('reduced')) return;
    const el = (e.target as Element).closest?.('[data-tilt]') as HTMLElement | null;
    if (target && el !== target) { const old = target; requestAnimationFrame(() => (old.style.transform = '')); }
    target = el;
    px = e.clientX; py = e.clientY;
    if (target && !raf) raf = requestAnimationFrame(write);
  }, { passive: true });

  // Pause background motion while scrolling.
  let st: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('scroll', () => {
    body.classList.add('scrolling');
    clearTimeout(st);
    st = setTimeout(() => body.classList.remove('scrolling'), 160);
  }, { passive: true });
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
