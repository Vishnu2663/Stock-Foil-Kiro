import { useEffect, useMemo, useState } from 'react';
import { makeWave } from '../../core/wave';
import { qrMatrix } from '../../render/sheet';

export function QRImage({ text, size = 140, label }: { text: string; size?: number; label: string }) {
  const m = useMemo(() => qrMatrix(text), [text]);
  const n = m.size + 4;
  let d = '';
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.data[r * m.size + c]) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" style={{ background: '#fff', borderRadius: 8 }}>
      <path d={d} fill="#000" />
    </svg>
  );
}

const PUNCHED = new Set([1, 2, 3, 5, 6, 8, 9, 10, 12, 15, 16, 17]);

function HalfArt({ top, wavePts, qr }: { top: boolean; wavePts: string; qr?: string }) {
  const m = useMemo(() => (qr ? qrMatrix(qr) : null), [qr]);
  const y0 = top ? 0 : 66;
  const circles = [];
  for (let i = 0; i < 21; i++) {
    const col = i % 7, row = Math.floor(i / 7);
    const cx = 16 + col * 17, cy = (top ? 22 : 92) + row * 15;
    const on = PUNCHED.has(i);
    circles.push(<circle key={i} cx={cx} cy={cy} r={4.6} fill={on ? '#231f1a' : 'none'} stroke={on ? 'none' : '#b5a47e'} strokeWidth={0.8} />);
  }
  let qd = '';
  if (m) {
    const s = 34 / m.size;
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.data[r * m.size + c]) qd += `M${(150 + c * s).toFixed(2)} ${(16 + r * s).toFixed(2)}h${s.toFixed(2)}v${s.toFixed(2)}h${(-s).toFixed(2)}z`;
  }
  const path = top ? `M0 0 H200 ${wavePts} Z` : `${wavePts.replace(/^L/, 'M')} V140 H0 Z`;
  return (
    <svg className={'half ' + (top ? 'top' : 'bottom')} viewBox={`0 ${y0} 200 74`} aria-hidden="true">
      <path d={path} fill={top ? '#fffaf0' : '#efe2c2'} stroke="#cdbb8f" strokeWidth="0.8" />
      <rect x={4} y={top ? 4 : 128} width={6} height={6} fill="#231f1a" />
      <rect x={190} y={top ? 4 : 128} width={6} height={6} fill="#231f1a" />
      <text x={14} y={top ? 11 : 136} fontFamily="system-ui, sans-serif" fontSize={7} fontWeight={800} fill="#7a1f1f" letterSpacing={1}>{top ? 'STOCK · worker keeps' : 'FOIL · employer keeps'}</text>
      {circles}
      {qd && <path d={qd} fill="#231f1a" />}
    </svg>
  );
}

/** A 3D tally card whose halves part along a generated wave and tilt towards the pointer. */
export function TallyCard({ qr }: { qr: string }) {
  const [parted, setParted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setParted(true), 700); return () => clearTimeout(t); }, []);
  const wave = makeWave('K1R0WEEN');
  let rev = '';
  for (let x = 200; x >= 0; x -= 4) rev += `L${x} ${(70 + wave.at(x * 0.93) * 0.9).toFixed(2)} `;
  let fwd = '';
  for (let x = 0; x <= 200; x += 4) fwd += `L${x} ${(70 + wave.at(x * 0.93) * 0.9).toFixed(2)} `;
  return (
    <div className="tally-stage" data-tilt="10">
      <div className={'tally tilt-in' + (parted ? ' parted' : '')} role="img" aria-label="A tally card split along a wavy cut into the stock and the foil">
        <HalfArt top wavePts={'V' + (70 + wave.at(186) * 0.9).toFixed(2) + ' ' + rev} qr={qr} />
        <HalfArt top={false} wavePts={fwd} />
      </div>
    </div>
  );
}
