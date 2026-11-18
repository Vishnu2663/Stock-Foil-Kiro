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

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
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
        {toasts.map((x) => <div key={x.id} className={'toast ' + x.tone}>{x.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}
