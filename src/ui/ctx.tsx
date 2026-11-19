import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadSettings, saveSettings, writeJSON, KEYS, type Settings } from '../store/index';
import { loadPack, setCurrent, t as translate } from '../i18n/uiPack';
import { translateAll, resetUntranslated } from '../i18n/dom';
import { pickUiLang } from '../i18n/index';
import type { NewCardInput } from '../core/card';

export type Tone = 'info' | 'good' | 'warn' | 'bad';
interface ToastItem { id: number; msg: string; tone: Tone }

export interface AppCtx {
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  lang: string;
  t: (s: string, ...args: (string | number)[]) => string;
  toast: (msg: string, tone?: Tone) => void;
  startCard: (prefill: Partial<NewCardInput> & { editId?: string }) => void;
  packVersion: number;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

/** A toast that follows a horizontal swipe and leaves past 80 px (or a quick flick). */
function Toast({ tone, msg, onGone }: { tone: string; msg: string; onGone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const d = useRef<{ x0: number; t0: number; dx: number } | null>(null);
  const set = (dx: number, anim: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = anim ? 'transform .2s ease, opacity .2s ease' : 'none';
    el.style.transform = dx ? `translateX(${dx}px)` : '';
    el.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 220));
  };
  return (
    <div
      ref={ref}
      className={'toast ' + tone}
      onPointerDown={(e) => { d.current = { x0: e.clientX, t0: performance.now(), dx: 0 }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { if (!d.current) return; d.current.dx = e.clientX - d.current.x0; set(d.current.dx, false); }}
      onPointerUp={() => {
        const g = d.current; d.current = null;
        if (!g) return;
        const v = Math.abs(g.dx) / Math.max(1, performance.now() - g.t0);
        if (Math.abs(g.dx) > 80 || v > 0.7) { set(Math.sign(g.dx || 1) * 320, true); setTimeout(onGone, 200); } else set(0, true);
      }}
      onPointerCancel={() => { d.current = null; set(0, true); }}
    >{msg}</div>
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setS] = useState<Settings>(() => loadSettings());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [packVersion, setPackVersion] = useState(0);
  const seq = useRef(0);
  const lang = pickUiLang(settings.lang);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    loadPack(lang).then((c) => {
      if (!alive) return;
      setCurrent(lang, c);
      resetUntranslated();
      document.documentElement.lang = lang;
      translateAll();
      setPackVersion((v) => v + 1);
    });
    return () => { alive = false; };
  }, [lang]);

  useEffect(() => {
    document.body.classList.toggle('simple', settings.simple);
  }, [settings.simple]);

  const toast = useCallback((msg: string, tone: Tone = 'info') => {
    const id = ++seq.current;
    setToasts((l) => [...l.slice(-2), { id, msg, tone }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 3200);
  }, []);

  const startCard = useCallback((prefill: Partial<NewCardInput> & { editId?: string }) => {
    writeJSON(KEYS.prefill, prefill);
    if (location.hash === '#/issue') window.dispatchEvent(new Event('sf-prefill'));
    location.hash = '#/issue';
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useCallback((s: string, ...args: (string | number)[]) => translate(s, ...args), [packVersion]);

  const value = useMemo<AppCtx>(() => ({ settings, setSettings, lang, t, toast, startCard, packVersion }), [settings, setSettings, lang, t, toast, startCard, packVersion]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-wrap" aria-live="polite" role="status">
        {toasts.map((x) => <Toast key={x.id} tone={x.tone} msg={x.msg} onGone={() => setToasts((l) => l.filter((y) => y.id !== x.id))} />)}
      </div>
    </Ctx.Provider>
  );
}
