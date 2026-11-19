import { Fragment, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import type { IconName } from '../routes';
import { HeroCard } from '../components/HeroCard';
import { QRImage } from '../components/Tally';
import { useApp } from '../ctx';

const siteUrl = () => (typeof location !== 'undefined' ? location.href.split('#')[0].split('?')[0] : 'https://vishnu2663.github.io/Stock-Foil-Kiro/');

const KICKERS = ['PAPER THAT CANNOT LIE', 'THE 1834 TALLY, REBORN', 'CUT IT · PUNCH IT · PROVE IT'];

const TILES: { icon: IconName; title: string; text: string; href: string }[] = [
  { icon: 'lock', title: 'Pair authentication', text: 'Each QR carries a secret for its own half. Only the two halves printed together make the matching SHA-256 tag.', href: '#/about' },
  { icon: 'camera', title: 'Camera scanner', text: 'Point the phone at each half. It finds the corner squares, reads every circle and captures by itself.', href: '#/scan' },
  { icon: 'help', title: 'Never guesses', text: 'Anything the scanner is not sure of is marked unsure. It warns and asks instead of guessing.', href: '#/lab' },
  { icon: 'chain', title: 'Tamper-evident ledger', text: 'Every scan and payment is chained by SHA-256. Change or delete one receipt and the chain breaks.', href: '#/ledger' },
  { icon: 'receipt', title: 'Picture pay slip', text: 'Suns for days, coins for advances and the notes to hand over, read aloud in the worker’s language.', href: '#/scan' },
  { icon: 'certificate', title: 'Income proof', text: 'A one-page certificate of verified months for a loan or rent, checked against the ledger.', href: '#/income' },
  { icon: 'sparkle', title: 'Free optional AI', text: 'Plain-words explanations from on-device or free AI. It only ever sees anonymous numbers.', href: '#/settings' },
  { icon: 'flask', title: 'Test lab', text: 'Simulated phone photos, forgeries and a stress test, all through the real scanner.', href: '#/lab' },
];

function Tile({ tile }: { tile: (typeof TILES)[number] }) {
  const { t } = useApp();
  const [flip, setFlip] = useState(false);
  // Hover is tracked on the still button's own box, so the turning card under the pointer cannot flicker it.
  const [hover, setHover] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!hover) return;
    const move = (e: PointerEvent) => {
      const r = box.current?.getBoundingClientRect();
      if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setHover(false);
    };
    document.addEventListener('pointermove', move, { passive: true });
    return () => document.removeEventListener('pointermove', move);
  }, [hover]);
  return (
    <button ref={box} type="button" className={'flip-tile' + (flip ? ' flipped' : '') + (hover ? ' hover' : '')} onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(true); }} onClick={() => setFlip(!flip)} aria-pressed={flip} aria-label={tile.title}>
      <span className="flip-inner">
        <span className="flip-face front panel">
          <span className="tile-icon" aria-hidden="true"><Icon name={tile.icon} /></span>
          <b>{tile.title}</b>
          <small>{t('HOVER OR TAP')}</small>
        </span>
        <span className="flip-face back panel">
          <b>{tile.title}</b>
          <span className="tile-text">{tile.text}</span>
          <a href={tile.href} onClick={(e) => e.stopPropagation()}>{t('Open')} →</a>
        </span>
      </span>
    </button>
  );
}

export default function Home() {
  const url = siteUrl();
  const [k, setK] = useState(0);
  useEffect(() => {
    if (document.body.classList.contains('reduced')) return;
    const id = setInterval(() => setK((x) => (x + 1) % KICKERS.length), 3800);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <section className="hero">
        <div className="rise">
          <div className="kicker hero-kicker" aria-live="off"><span key={k} className="kick-swap">{KICKERS[k]}</span></div>
          <h1 className="hero-title" aria-label="The tally stick, back from the dead.">
            <span aria-hidden="true">
              {['The', 'tally', 'stick,', 'back', 'from', 'the', 'dead.'].map((w, i) => (
                <Fragment key={i}><span className={'hw' + (i >= 3 ? ' glow' : '')} style={{ ['--w' as string]: i }}>{w}</span>{i < 6 ? ' ' : ''}</Fragment>
              ))}
            </span>
          </h1>
          <p className="lead hero-lead">A tamper-proof work record that both sides hold. A paper card is cut in two along a one-of-a-kind wavy line. The worker keeps one half, the employer the other. Every day both are punched together.</p>
          <div className="row">
            <a className="btn primary" href="#/story">🎃 See the story</a>
            <a className="btn" href="#/demo">▶ 4-vs-5 days demo</a>
            <a className="btn" href="#/issue">+ Make a card</a>
            <a className="btn" href="#/scan">📷 Payday scan</a>
          </div>
          <div className="chips" aria-label="Features">
            <span className="chip">Free</span>
            <span className="chip">Works offline</span>
            <span className="chip">No account</span>
            <span className="chip">No server</span>
            <span className="chip">The worker needs no phone</span>
          </div>
        </div>
        <HeroCard qr={url} />
      </section>

      <div className="tally-rule" aria-hidden="true" />

      <section className="panel how" data-reveal aria-labelledby="how">
        <h2 id="how">How it works</h2>
        <ol className="how-steps">
          <li><span className="num-dot" aria-hidden="true">1</span><div><b>Print and cut</b><span>The app prints a calendar card with a unique wavy cut line. Cut along it with scissors.</span></div></li>
          <li><span className="num-dot" aria-hidden="true">2</span><div><b>Punch both, daily</b><span>At the end of each workday, stack the halves and punch one hole through both. No phone, no reading needed.</span></div></li>
          <li><span className="num-dot" aria-hidden="true">3</span><div><b>Scan on payday</b><span>Photograph both halves. The app proves they were issued together, compares every hole and flags any hole on only one half.</span></div></li>
          <li><span className="num-dot" aria-hidden="true">4</span><div><b>Get a picture slip</b><span>days × rate − advances = total, in your language, with pictures and read-aloud.</span></div></li>
        </ol>
      </section>

      <h2 className="box-title">What is in the box</h2>
      <div className="tiles">{TILES.map((tile) => <Tile key={tile.title} tile={tile} />)}</div>

      <section className="panel phone-qr" data-reveal>
        <QRImage text={url} size={128} label="QR code to open Stock & Foil on a phone" />
        <div>
          <h2>Open on your phone</h2>
          <p className="small ui">Scan this code with a phone camera to open this page there.</p>
        </div>
      </section>

      <section className="panel" data-reveal>
        <h2>Why paper beats an app here</h2>
        <p>Neither side has to trust a server, a phone or each other. Adding a hole to one half only is visible the moment the halves are compared; a half made up from the other fails its pairing secret. The record survives dead batteries, no network and illiteracy, and it protects honest employers just as much as workers.</p>
        <div className="row">
          <a className="btn" href="#/lab">🧪 Open the test lab</a>
          <a className="btn" href="#/about">📜 About &amp; security</a>
        </div>
      </section>
    </>
  );
}
