import { useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { speak, stopSpeaking, speechSupported } from '../../ai/speech';
import { langInfo } from '../../i18n/index';
import type { RouteId } from '../routes';
import { Icon } from './Icon';

/** Text of the page's main content, for reading aloud. */
export function pageText(): string {
  const main = document.querySelector('main .page');
  if (!main) return '';
  const parts: string[] = [];
  main.querySelectorAll('h1, h2, h3, p, li, .total-big, .stamp, [data-speak]').forEach((el) => {
    if ((el as HTMLElement).closest('[aria-hidden="true"], .no-speak')) return;
    const s = (el as HTMLElement).innerText?.trim();
    if (s) parts.push(s.endsWith('.') || s.endsWith('?') || s.endsWith('!') || s.endsWith('।') ? s : s + '.');
  });
  return parts.join('\n\n');
}

export function ListenFab({ route }: { route: RouteId }) {
  const { settings, lang, t } = useApp();
  const [on, setOn] = useState(false);
  useEffect(() => { stopSpeaking(); setOn(false); }, [route]);
  if (!settings.simple || !speechSupported() || route === 'story') return null;
  const toggle = () => {
    if (on) { stopSpeaking(); setOn(false); return; }
    setOn(true);
    speak(pageText(), { lang: langInfo(lang).speech, rate: settings.speakRate, onEnd: () => setOn(false) });
  };
  return (
    <button className="btn primary listen-fab" onClick={toggle} aria-pressed={on}>
      <Icon name="speaker" /> {on ? t('Stop') : t('Listen')}
    </button>
  );
}
