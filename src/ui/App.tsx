import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { flushSync } from 'react-dom';
import { AppProvider, useApp } from './ctx';
import { Header } from './components/Header';
import { iconUrl } from './components/Icon';
import { TabBar } from './components/TabBar';
import { ListenFab } from './components/Listen';
import { parseHash, routeDef, type RouteId } from './routes';
import { finishSplash } from './splash';
import Home from './pages/Home';

const pages: Record<RouteId, ComponentType> = {
  home: Home,
  issue: lazy(() => import('./pages/Issue')),
  scan: lazy(() => import('./pages/Scan')),
  members: lazy(() => import('./pages/Members')),
  crew: lazy(() => import('./pages/Crew')),
  story: lazy(() => import('./pages/Story')),
  history: lazy(() => import('./pages/History')),
  ledger: lazy(() => import('./pages/Ledger')),
  income: lazy(() => import('./pages/Income')),
  punch: lazy(() => import('./pages/Punch')),
  demo: lazy(() => import('./pages/Demo')),
  lab: lazy(() => import('./pages/Lab')),
  calibrate: lazy(() => import('./pages/Calibrate')),
  about: lazy(() => import('./pages/About')),
  settings: lazy(() => import('./pages/Settings')),
};

function useRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => {
      const r = parseHash(location.hash);
      const go = () => { flushSync(() => setRoute(r)); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); };
      // the route change cross-fades with the View Transitions API where it exists (not with reduced motion)
      const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      if (d.startViewTransition && !document.body.classList.contains('reduced')) d.startViewTransition(go);
      else go();
    };
    window.addEventListener('hashchange', on);
    if (!location.hash) history.replaceState(null, '', '#/home');
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function Shell() {
  const route = useRoute();
  const { t } = useApp();
  const Page = pages[route];
  useEffect(() => {
    document.title = `${t(routeDef(route).title)} · Stock & Foil`;
  }, [route, t]);
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(finishSplash));
    const fallback = setTimeout(finishSplash, 120); // rAF can be paused (background tabs, headless)
    return () => clearTimeout(fallback);
  }, []);
  return (
    <div id="app">
      <a href="#main" className="sr-only" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <div className="ambient" aria-hidden="true"><div className="glow a" /><div className="glow b" /><div className="holes" /></div>
      <Header route={route} />
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<p className="muted ui">Loading…</p>}>
          <div className="page" key={route} data-route={route} style={{ ['--sec-ico' as string]: iconUrl(routeDef(route).icon) }}>
            <Page />
          </div>
        </Suspense>
      </main>
      <TabBar route={route} />
      <ListenFab route={route} />
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
