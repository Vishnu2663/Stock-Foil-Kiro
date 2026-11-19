import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { initFx } from './ui/fx';
import { startTranslator } from './i18n/dom';
import './ui/styles.css';
import './ui/tokens.css';
import './ui/look.css';
import './ui/pages.css';

initFx();
startTranslator(document.body);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`./sw.js?v=${__BUILD_ID__}`).catch(() => undefined);
  });
}
