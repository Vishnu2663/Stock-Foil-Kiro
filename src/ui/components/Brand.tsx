// The brand: logo, then "STOCK" above a dashed wavy line above "& FOIL" in red.
// index.html holds an exact clone of this markup for the splash.
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 96 96" aria-hidden="true">
      <rect width="96" height="96" rx="22" fill="#7a1f1f" /><rect x="14" y="24" width="68" height="50" rx="1.5" fill="#e3d1a4" /><path d="M14 24h68v14c-9 7-20 3-30-1s-27-6-38 3z" fill="#f6eedb" /><g fill="#7a1f1f"><circle cx="31" cy="24" r="5.2" /><circle cx="48" cy="24" r="5.2" /><circle cx="65" cy="24" r="5.2" /><circle cx="31" cy="57" r="4.6" /><circle cx="48" cy="57" r="4.6" /><circle cx="65" cy="57" r="4.6" /></g>
    </svg>
  );
}

export function Brand() {
  return (
    <a className="brand" href="#/home" aria-label="Stock & Foil, home" data-notranslate>
      <Logo />
      <span className="word" aria-hidden="true">
        <span className="s">STOCK</span>
        <svg viewBox="0 0 58 6" preserveAspectRatio="none"><path d="M0 3c4-3 7 3 11 0s7-3 11 0 7 3 11 0 7-3 11 0 7 3 14 0" fill="none" stroke="#a89a82" strokeWidth="1.1" strokeDasharray="2.4 1.6" /></svg>
        <span className="f">&amp; FOIL</span>
      </span>
    </a>
  );
}
