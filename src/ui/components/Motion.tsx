import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../core/card';
import { motionEnv } from '../anim';

/**
 * A mechanical counter: each digit is a strip 0–9 that rolls (transform only) to its final digit, staggered
 * right to left. It rolls WHOLE units only; any paise appear with the final value after the roll.
 */
export function Odometer({ text, delay = 0, duration = 1100, className = '' }: { text: string; delay?: number; duration?: number; className?: string }) {
  const [go, setGo] = useState(false);
  const instant = useRef(motionEnv().reduced);
  useEffect(() => {
    if (instant.current) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    return () => cancelAnimationFrame(id);
  }, [text]);
  if (instant.current) return <span className={'odo ' + className} data-notranslate>{text}</span>;
  const dot = text.indexOf('.');
  const whole = dot >= 0 ? text.slice(0, dot) : text;
  const frac = dot >= 0 ? text.slice(dot) : '';
  const digits = [...whole].filter((c) => /\d/.test(c)).length;
  let k = 0;
  return (
    <span className={'odo ' + className} aria-label={text} data-notranslate>
      {[...whole].map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={i} className="odo-sym" aria-hidden="true">{ch}</span>;
        const d = Number(ch);
        const fromRight = digits - 1 - k++;
        return (
          <span key={i} className="odo-col" aria-hidden="true">
            <span className="odo-strip" style={{ transform: `translateY(${go ? -d * 10 : 0}%)`, transitionDuration: `${duration - fromRight * 60}ms`, transitionDelay: `${delay + fromRight * 60}ms` }}>
              {'0123456789'.split('').map((n) => <span key={n}>{n}</span>)}
            </span>
          </span>
        );
      })}
      {frac && <span className="odo-frac" aria-hidden="true" style={{ animationDelay: `${delay + duration}ms` }}>{frac}</span>}
    </span>
  );
}

export const moneyText = (minor: number, currency: string) => formatMoney(minor, currency);

/** A line that types itself in (about 25 ms per character). Full text at once with reduced motion. */
export function Typer({ text, delay = 0, every = 25, className = '' }: { text: string; delay?: number; every?: number; className?: string }) {
  const [n, setN] = useState(() => (motionEnv().reduced ? text.length : 0));
  useEffect(() => {
    if (motionEnv().reduced) { setN(text.length); return; }
    setN(0);
    let i = 0, id: ReturnType<typeof setTimeout>;
    const step = () => { i++; setN(i); if (i < text.length) id = setTimeout(step, every); };
    id = setTimeout(step, delay);
    return () => clearTimeout(id);
  }, [text, delay, every]);
  return (
    <span className={'typer ' + className} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      {n < text.length && <span className="typer-caret" aria-hidden="true">▍</span>}
    </span>
  );
}
