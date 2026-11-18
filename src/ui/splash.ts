// The splash shows the brand at its real large size (no CSS scaling, so it stays sharp),
// fills the loading bar, then flies the brand onto the exact rectangle of the header brand.
// The header brand stays hidden until the flight lands.

declare global {
  interface Window { __sfSplash?: { start: number; min: number; done?: boolean; started?: boolean } }
}

const fontsReady = (): Promise<unknown> => {
  const f = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  return f ? Promise.race([f.ready, new Promise((r) => setTimeout(r, 400))]) : Promise.resolve();
};

export function finishSplash() {
  const info = window.__sfSplash;
  const el = document.getElementById('sf-splash');
  const end = () => {
    document.body.classList.remove('splashing');
    el?.remove();
    if (info) info.done = true;
  };
  if (!info || !el || info.done) { end(); return; }
  if (info.started) return; // rAF and the timer fallback both call this; run once
  info.started = true;
  const wait = Math.max(0, info.min - (performance.now() - info.start));
  setTimeout(() => { void fontsReady().then(fly); }, wait);

  function fly() {
    const clone = el!.querySelector<HTMLElement>('.brand');
    const target = document.querySelector<HTMLElement>('.header .brand');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!clone || !target || reduced) {
      el!.style.transition = 'opacity .25s';
      el!.style.opacity = '0';
      setTimeout(end, 260);
      return;
    }
    // Measure both at rest. The clone has no transform, so its rect is its true size.
    clone.style.transform = 'none';
    const a = clone.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    if (!a.width || !b.width) { end(); return; }
    const s = b.height / a.height;
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    // Tagline and bar only fade (no layout change), so the clone does not move before the flight.
    clone.style.transformOrigin = '0 0';
    void clone.offsetWidth;
    clone.style.transition = 'transform .85s cubic-bezier(.65,0,.25,1)';
    el!.classList.add('flying');
    clone.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${s})`;
    let done = false;
    const land = () => { if (done) return; done = true; end(); };
    clone.addEventListener('transitionend', (e) => { if (e.propertyName === 'transform') land(); });
    setTimeout(land, 1100);
  }
}
