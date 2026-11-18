import { useEffect, useMemo, useRef, useState } from 'react';
import { makeWave } from '../../core/wave';
import { hash53, mulberry32, randomBase32 } from '../../core/prng';
import { useApp } from '../ctx';

const DAYS = [4, 5, 6, 7, 8, 9, 10];
const HOLES = new Set([5, 6, 7, 9]);
const JOINED_MS = 3400;
const CUT_MS = 3000;
const MANUAL_HOLD_MS = 9000;

function Row({ y }: { y: number }) {
  return (
    <g>
      {DAYS.map((d, i) => {
        const x = 26 + i * 41;
        return (
          <g key={d}>
            <rect x={x} y={y} width={33} height={33} rx={3} fill="#fbf6ea" stroke="#9a8d73" strokeWidth={1.1} />
            <text x={x + 3} y={y + 9} fontSize={8} fontWeight={700} fill="#3a3226" fontFamily="system-ui, sans-serif">{d}</text>
            {HOLES.has(d)
              ? <circle cx={x + 18} cy={y + 20} r={8.5} fill="#121010" />
              : <circle cx={x + 18} cy={y + 20} r={6} fill="none" stroke="#e2d9c4" strokeWidth={1} />}
          </g>
        );
      })}
    </g>
  );
}

/**
 * The floating tally card on Home. It cuts and joins by itself in a loop; a click toggles it by hand
 * (and pauses the loop for a while); "new wave" draws another card's unique cut.
 */
export function HeroCard(_props: { qr?: string }) {
  const { t } = useApp();
  const [id, setId] = useState('K1R0WEEN');
  const [cut, setCut] = useState(false);
  const manualUntil = useRef(0);
  // Bold 8x8 block mark seeded by the wave id (decorative; the scannable QR is lower on Home).
  const m = useMemo(() => {
    const n = 8, rnd = mulberry32(hash53(id)), data: boolean[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const corner = (r < 2 && c < 2) || (r < 2 && c >= n - 2) || (r >= n - 2 && c < 2);
      data.push(corner || rnd() < 0.5);
    }
    return { size: n, data };
  }, [id]);

  // Auto cut/join loop. Skipped for reduced motion and while the tab is hidden.
  const cutRef = useRef(cut);
  cutRef.current = cut;
  useEffect(() => {
    if (document.body.classList.contains('reduced')) return;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      let next = 1000;
      if (!document.hidden && Date.now() >= manualUntil.current) {
        const willCut = !cutRef.current;
        cutRef.current = willCut;
        setCut(willCut);
        next = willCut ? CUT_MS : JOINED_MS;
      }
      timer = setTimeout(step, next);
    };
    timer = setTimeout(step, JOINED_MS);
    return () => clearTimeout(timer);
  }, []);

  const W = 440, H = 290, cy = 150;
  const { line, topPath, botPath } = useMemo(() => {
    const wave = makeWave(id);
        const smooth: [number, number][] = [];
    const rough: [number, number][] = [];
    for (let x = 0; x <= W; x += 4) smooth.push([x, cy + wave.at((x / W) * 186) * 2.4]);
    // The cut edge: one smooth wave shared by both halves, so they meet exactly and stay sharp.
    for (let x = 0; x <= W; x += 2) {
      const base = cy + wave.at((Math.min(x, W) / W) * 186) * 2.4;
      rough.push([Math.min(x, W), base]);
    }
    const toD = (p: [number, number][]) => p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const last = rough[rough.length - 1];
    const rev = [...rough].reverse().map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return {
      line: toD(smooth),
      topPath: `M10 0 H${W - 10} Q${W} 0 ${W} 10 L${W} ${last[1].toFixed(1)} ${rev} L0 10 Q0 0 10 0 Z`,
      botPath: `${toD(rough)} L${W} ${H - 10} Q${W} ${H} ${W - 10} ${H} H10 Q0 ${H} 0 ${H - 10} Z`,
    };
  }, [id]);

  const s = 100 / m.size;
  let qd = '';
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.data[r * m.size + c]) qd += `M${(c * s).toFixed(2)} ${(r * s).toFixed(2)}h${s.toFixed(2)}v${s.toFixed(2)}h${(-s).toFixed(2)}z`;

  const toggle = () => { manualUntil.current = Date.now() + MANUAL_HOLD_MS; setCut((c) => !c); };

  return (
    <div className="hero-card-wrap">
      <button type="button" className={'hero-card' + (cut ? ' cut' : '')} onClick={toggle} aria-label={cut ? t('Join the halves') : t('Cut the card in two')} aria-pressed={cut}>
        <svg viewBox={`-30 -50 ${W + 60} ${H + 110}`} aria-hidden="true">
          <defs>
            <linearGradient id="paperg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbf5e6" /><stop offset="1" stopColor="#ecdfc1" /></linearGradient>
            <filter id="cardsh" x="-20%" y="-30%" width="140%" height="170%"><feGaussianBlur stdDeviation="10" /></filter>
          </defs>
          <g className="hc-float">
            <g className="hc-tilt">
              <g className="hc-top">
                <path className="hc-shadow" d={topPath} fill="#000" filter="url(#cardsh)" transform="translate(0 16)" />
                <path d={topPath} fill="url(#paperg)" />
                <text x={26} y={48} className="hc-label"><tspan fontSize={19} fontWeight={800} fill="#1d1813">STOCK</tspan><tspan dx={7} fontSize={13} fill="#5b5141">{t('worker keeps')}</tspan></text>
                <Row y={70} />
                <g transform="translate(316 22)">
                  <rect x={-6} y={-6} width={112} height={112} fill="#fff" rx={3} />
                  <path d={qd} fill="#161210" shapeRendering="crispEdges" />
                </g>
              </g>
              <g className="hc-bottom">
                <path className="hc-shadow" d={botPath} fill="#000" filter="url(#cardsh)" transform="translate(0 16)" />
                <path d={botPath} fill="url(#paperg)" />
                <text x={26} y={cy + 52} className="hc-label"><tspan fontSize={19} fontWeight={800} fill="#1d1813">FOIL</tspan><tspan dx={7} fontSize={13} fill="#5b5141">{t('employer keeps')}</tspan></text>
                <Row y={cy + 70} />
              </g>
              <path className="hc-cutline" d={line} fill="none" stroke="#6f6350" strokeWidth={1.2} />
            </g>
          </g>
        </svg>
      </button>
      <p className="hero-caption ui">
        ✂ {t("every card's cut is its own signature · click to cut and join ·")}{' '}
        <button type="button" className="mini-pill" onClick={() => { setId(randomBase32(8)); manualUntil.current = 0; }}>{t('new wave')}</button>
      </p>
    </div>
  );
}
