import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../ctx';
import { storyFor, storyLangs } from '../../i18n/story';
import { langInfo, verdictWord } from '../../i18n/index';
import { speak, stopSpeaking, speechSupported, voicesReady, rankVoices, isRobotic } from '../../ai/speech';
import { readJSON, writeJSON, KEYS } from '../../store/index';
import { scenario, runPair, type ScenarioRun, type ScenarioId } from '../sim';
import { Thumbs } from '../components/SimView';
import { HeroCard } from '../components/HeroCard';
import { Logo } from '../components/Brand';
import { verdictTone } from '../../vision/pair';
import { Select } from '../components/Select';

const LIVE: Record<number, ScenarioId> = { 3: 'claim', 4: 'extra', 5: 'sloppy', 6: 'forgedFit' };
const CAPTIONS = [
  'October 1834 · the furnaces under the House of Lords',
  'Notched hazel, split lengthwise · the stock and the foil',
  'A paper card, cut on a one-of-a-kind wave',
  'A real scan · the contractor said 4 days',
  'A real scan · one extra hole on one half only',
  'A real scan · the cut does not fit, the secret does',
  'A real scan · a perfect cut with the wrong secret',
  'A hash-chained ledger · paid once, only once',
  'The tally sticks that burned Parliament have come back from the dead.',
];

function Embers({ n = 60 }: { n?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || document.body.classList.contains('reduced')) return;
    const g = c.getContext('2d')!;
    const count = document.body.classList.contains('lite') ? Math.round(n / 2) : n;
    let w = 0, h = 0;
    const resize = () => { w = c.width = c.clientWidth; h = c.height = c.clientHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    const ps = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, v: 0.25 + Math.random() * 0.9, r: 0.8 + Math.random() * 2.4, s: Math.random() * 6.28 }));
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      g.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y -= p.v; p.s += 0.025; p.x += Math.sin(p.s) * 0.35;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        const a = Math.max(0, Math.min(1, p.y / h));
        g.fillStyle = `rgba(255,${130 + Math.round(70 * a)},50,${0.2 + 0.55 * a})`;
        g.shadowColor = 'rgba(255,140,40,.8)';
        g.shadowBlur = 6;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.28); g.fill();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [n]);
  return <canvas ref={ref} className="embers" aria-hidden="true" />;
}

function FireScene() {
  return (
    <svg className="fire-scene" viewBox="0 0 1000 520" role="img" aria-label="The Houses of Parliament burning in 1834, with tally sticks in the flames">
      <defs>
        <radialGradient id="glow" cx="50%" cy="85%" r="60%"><stop offset="0" stopColor="#ff8a2a" stopOpacity=".55" /><stop offset="1" stopColor="#ff8a2a" stopOpacity="0" /></radialGradient>
        <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#fff2b0" /><stop offset=".35" stopColor="#ffb238" /><stop offset=".75" stopColor="#ec5a1c" /><stop offset="1" stopColor="#a8260f" stopOpacity="0" /></linearGradient>
        <linearGradient id="stick" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e8d6a6" /><stop offset="1" stopColor="#b59d68" /></linearGradient>
      </defs>
      <rect width="1000" height="520" fill="url(#glow)" />
      <g fill="#14101a" opacity=".95">
        <path d="M180 260 L180 150 L205 90 L230 150 L230 260 Z" />
        <path d="M760 260 L760 110 L790 40 L820 110 L820 260 Z" />
        <path d="M480 260 L480 170 L500 120 L520 170 L520 260 Z" />
        <rect x="140" y="250" width="720" height="210" />
        <path d="M600 250 L600 180 L640 160 L680 180 L680 250 Z" />
      </g>
      <g className="windows">
        {Array.from({ length: 8 }, (_, i) => <rect key={i} x={225 + i * 81} y={290} width={18} height={34} rx={9} fill="#e8d3a2" opacity={i % 2 ? 0.55 : 0.9} />)}
      </g>
      <text x="580" y="262" fill="#cdbca0" fontSize="17" letterSpacing="3" fontFamily="system-ui, sans-serif" opacity=".8">PARLIAMENT · LIT WINDOWS</text>
      <g className="flames">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} className={`fl fl${i % 3}`} d={`M${300 + i * 85} 470 C ${280 + i * 85} 400, ${330 + i * 85} 360, ${310 + i * 85} ${250 - (i % 3) * 40} C ${360 + i * 85} 330, ${390 + i * 85} 400, ${370 + i * 85} 470 Z`} fill="url(#flame)" />
        ))}
      </g>
      <rect x="290" y="455" width="420" height="34" rx="16" fill="#c4521e" />
      {Array.from({ length: 14 }, (_, i) => <ellipse key={i} cx={320 + i * 28} cy={470 + (i % 2) * 6} rx={13} ry={4} fill="#ffd27a" opacity=".85" />)}
      <g>
        <rect x="58" y="330" width="290" height="22" rx="11" fill="#1d1712" opacity=".85" />
        <text x="72" y="346" fill="#efe1c3" fontSize="15" fontWeight="700" letterSpacing="2.5" fontFamily="system-ui, sans-serif">TALLY STICKS · EACH NOTCH = A DEBT</text>
        {[370, 405].map((y, k) => (
          <g key={y} transform={`translate(${k * -4} 0)`}>
            <rect x="60" y={y} width="300" height="26" rx="8" fill="url(#stick)" stroke="#7a6a46" />
            {Array.from({ length: 7 }, (_, j) => <path key={j} d={`M${84 + j * 38} ${y + 2} l7 12 l7 -12 z`} fill="#3a2a18" />)}
          </g>
        ))}
      </g>
    </svg>
  );
}

function SplitScene() {
  return (
    <svg className="split-scene" viewBox="0 0 600 260" role="img" aria-label="A notched hazel stick split lengthwise into the stock and the foil">
      <g className="stick-top">
        <path d="M30 60 H570 V108 Q500 120 420 106 T260 110 T30 104 Z" fill="#c69a5a" stroke="#5b3d1a" strokeWidth="2" />
        {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${70 + i * 52} 60 l9 16 l9 -16 z`} fill="#3b2410" />)}
        <text x="32" y="48" fill="#ffd9a8" fontSize="18" fontWeight="800" letterSpacing="2" fontFamily="system-ui">STOCK · creditor keeps</text>
      </g>
      <g className="stick-bottom">
        <path d="M30 128 Q120 136 260 128 T420 130 T570 124 V176 H30 Z" fill="#b8874a" stroke="#5b3d1a" strokeWidth="2" />
        {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${70 + i * 52} 176 l9 -14 l9 14 z`} fill="#3b2410" />)}
        <text x="32" y="206" fill="#ffd9a8" fontSize="18" fontWeight="800" letterSpacing="2" fontFamily="system-ui">FOIL · debtor keeps</text>
      </g>
    </svg>
  );
}

export default function Story() {
  const { lang: appLang, t } = useApp();
  const [lang, setLang] = useState(appLang);
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(false);
  const [narrate, setNarrate] = useState(false);
  const [pace, setPace] = useState<number>(() => readJSON(KEYS.storyPace, 0.85));
  const [voiceURI, setVoiceURI] = useState<string>(() => readJSON(KEYS.storyVoice, ''));
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [runs, setRuns] = useState<Record<number, ScenarioRun | 'running' | 'error'>>({});
  const chapters = storyFor(lang);
  const ch = chapters[idx];
  const info = langInfo(lang);
  const rtl = !!info.rtl;

  useEffect(() => { setLang(appLang); }, [appLang]);
  useEffect(() => { voicesReady().then(setVoices); }, []);
  useEffect(() => { writeJSON(KEYS.storyPace, pace); }, [pace]);
  useEffect(() => { writeJSON(KEYS.storyVoice, voiceURI); }, [voiceURI]);

  const ranked = useMemo(() => rankVoices(voices, lang), [voices, lang]);
  const onlyRobotic = ranked.length > 0 && ranked.every(isRobotic);
  const go = useCallback((i: number) => setIdx(Math.max(0, Math.min(chapters.length - 1, i))), [chapters.length]);

  // Chapters 4-7 run the real scanner on simulated photos.
  useEffect(() => {
    const id = LIVE[idx];
    if (!id || runs[idx]) return;
    setRuns((r) => ({ ...r, [idx]: 'running' }));
    runPair(scenario(id).input).then((run) => setRuns((r) => ({ ...r, [idx]: run })), () => setRuns((r) => ({ ...r, [idx]: 'error' })));
  }, [idx, runs]);

  // Narration, and autoplay that advances after the narration finishes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const advance = () => { if (!auto) return; timer = setTimeout(() => { if (idx < chapters.length - 1) go(idx + 1); else setAuto(false); }, 900); };
    if (narrate && speechSupported()) speak(`${ch.title}.\n\n${ch.text}`, { lang: info.speech, rate: pace, voiceURI: voiceURI || ranked[0]?.voiceURI, onEnd: advance });
    else if (auto) timer = setTimeout(advance, Math.max(5000, ch.text.length * 55));
    return () => { clearTimeout(timer); stopSpeaking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, narrate, idx, lang]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('select, input, textarea')) return;
      if (e.key === 'ArrowRight') go(rtl ? idx - 1 : idx + 1);
      else if (e.key === 'ArrowLeft') go(rtl ? idx + 1 : idx - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [go, idx, rtl]);

  const run = runs[idx];
  const scene = () => {
    if (idx === 0) return <FireScene />;
    if (idx === 1) return <SplitScene />;
    if (idx === 2) return <div style={{ width: '100%', maxWidth: 460 }}><HeroCard qr="https://vishnu2663.github.io/Stock-Foil-Kiro/" /></div>;
    if (LIVE[idx]) {
      if (!run || run === 'running') return <p className="ui scene-wait">{t('Running the real scanner on simulated photos…')}</p>;
      if (run === 'error') return <p className="ui scene-wait">{t('The scanner could not run here.')}</p>;
      const v = run.result;
      return (
        <div className="stack live-scene">
          <Thumbs run={run} burn={idx === 6} />
          <div className="row">
            <span className={`stamp ${verdictTone(v.verdict)}`}>{verdictWord(lang, v.verdict)}</span>
            {v.verdict !== 'pair-mismatch' && <span className="chip">{t('{0} days agreed', v.pay?.agreed.days ?? 0)}</span>}
            {v.comparison && v.comparison.stockOnly.size + v.comparison.foilOnly.size > 0 && <span className="chip warn">{t('Extra hole shown, never paid')}</span>}
            {v.pairing === 'failed' && <span className="chip bad">{t('Pairing code failed')}</span>}
          </div>
        </div>
      );
    }
    if (idx === 7) return <div className="paid-scene"><span className="stamp good">{verdictWord(lang, 'paid')}</span><div className="chain-mini ui">#1 → #2 → #3 · SHA-256</div></div>;
    return <div className="end-scene"><div style={{ width: 110 }}><Logo /></div><p className="ui">Stock &amp; Foil</p><a className="btn primary" href="#/issue">{t('Make a card')}</a></div>;
  };

  return (
    <div className="story-frame" dir={rtl ? 'rtl' : 'ltr'} lang={lang}>
      <div className="story-head">
        <div className="kicker story-kicker">🎃 {t('STORY · CHAPTER {0} OF {1}', idx + 1, chapters.length)}</div>
        <h1 data-notranslate>{ch.title}</h1>
        <div className="story-progress" aria-hidden="true"><span style={{ width: `${((idx + 1) / chapters.length) * 100}%` }} /></div>
      </div>
      <div className="panel story-stage">
        <div className="scene-box" key={idx}>
          <Embers />
          <div className="scene-inner">{scene()}</div>
          <div className="scene-caption">{t(CAPTIONS[idx])}</div>
        </div>
        <div className="story-text" data-notranslate>{ch.text.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div>
      </div>
      <div className="panel story-controls">
        <div className="story-nav">
          <button className="btn" onClick={() => go(idx - 1)} disabled={idx === 0}>◀ {t('Back')}</button>
          <button className="btn orange" onClick={() => setAuto(!auto)} aria-pressed={auto}>{auto ? '⏸ ' + t('Pause') : '▶ ' + t('Autoplay')}</button>
          <button className="btn" onClick={() => go(idx + 1)} disabled={idx === chapters.length - 1}>{t('Next')} ▶</button>
        </div>
        <div className="story-opts">
          {speechSupported() && (
            <label className="narrate">
              <input type="checkbox" role="switch" checked={narrate} onChange={(e) => setNarrate(e.target.checked)} />
              <span className="track" aria-hidden="true" /><span>🔊 {t('Narrate')}</span>
            </label>
          )}
          <Select className="lang-select" label={t('Story language')} value={lang} onChange={(v) => { setLang(v); stopSpeaking(); }} options={storyLangs().map((l) => ({ value: l, label: langInfo(l).name }))} />
        </div>
      </div>
      {narrate && speechSupported() && (
        <div className="row story-voice ui small">
          <Select label={t('Voice')} value={voiceURI} onChange={setVoiceURI} options={[{ value: '', label: t('Best voice') }, ...ranked.map((v) => ({ value: v.voiceURI, label: v.name + (isRobotic(v) ? ' (robotic)' : '') }))]} />
          <label className="row" style={{ gap: 8 }}>{t('Pace')}<input type="range" min={0.6} max={1.2} step={0.05} value={pace} onChange={(e) => setPace(Number(e.target.value))} aria-label={t('Narration pace')} style={{ width: 140 }} /><span data-notranslate>{pace.toFixed(2)}</span></label>
          {(onlyRobotic || (ranked.length === 0 && voices.length > 0)) && <span className="warn-text">{ranked.length === 0 ? t('No voice for this language on this device. The text is still shown.') : t('Only a robotic voice is available for this language on this device.')}</span>}
        </div>
      )}
      <div className="panel story-thumb">
        <h2>{t('The thumb impression')}</h2>
        <p className="ui">{t('Workers who could not sign pressed an inked thumb in the employer\'s pay register when they were paid, and the register stayed with the employer. On a Stock & Foil card the worker presses the thumb on both halves, so each side keeps its own proof. What you need on payday: the two halves and a thumb ink pad.')}</p>
      </div>
      <ol className="story-steps" aria-label={t('Chapters')} style={{ ['--sp' as string]: idx / Math.max(1, chapters.length - 1) }}>
        {chapters.map((c, i) => (
          <li key={i} className={i === idx ? 'on' : i < idx ? 'done' : ''}>
            <button onClick={() => go(i)} aria-current={i === idx ? 'step' : undefined}>
              <span className="dot">{i + 1}</span>
              <span className="lbl" data-notranslate>{c.short}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
