# Design: foundation (Phase 1)

## Architecture

    index.html            inline splash (CSS + script), #root, module script
    src/main.tsx          mounts <App/>, registers sw.js in production
    src/ui/App.tsx        AppProvider + Header + <main> page outlet + TabBar + Toast + Ambient
    src/ui/ctx.tsx        AppContext: settings, setSettings, lang, t, toast, startCard
    src/ui/routes.ts      route table (pure): path, title, icon, group ('main' | 'records' | 'more')
    src/ui/useRoute.ts    hashchange hook; scrolls to top; sets document.title
    src/ui/fx.ts          ripple, reveal (IntersectionObserver), tilt (rAF), lite/reduced detection
    src/ui/splash.ts      finishSplash(): measures header brand rect, triggers the flight
    src/ui/components/    Brand, Icon, Header, NavMenu, TabBar, MoreSheet, Toast, Ambient
    src/ui/pages/         Placeholder.tsx (one generic placeholder for all 15 routes for now)
    src/ui/styles.css     tokens, themes, layout, nav, motion, print
    src/store/index.ts    settings load/save (pure logic + injected Storage)
    public/               icon.svg, manifest.webmanifest, sw.js

Pages are lazy-loaded later (Phase 12); now all routes use Placeholder.

## Data shapes

    type RouteId = 'home'|'issue'|'scan'|'members'|'crew'|'story'|'history'|'ledger'|'income'
                 |'punch'|'demo'|'lab'|'calibrate'|'about'|'settings';
    interface RouteDef { id: RouteId; title: string; hint?: string; icon: IconName; group: 'main'|'records'|'more'|'settings' }

    interface Settings {
      lang: string; aiProvider: 'off'|'builtin'|'custom'; aiNote: boolean;
      customUrl: string; customModel: string; customKey: string;
      speakRate: number; simple: boolean; calibration: Record<string, number>;
    }
    DEFAULT_SETTINGS = { lang:'en', aiProvider:'builtin', aiNote:true,
      customUrl:'https://openrouter.ai/api/v1/chat/completions',
      customModel:'meta-llama/llama-3.3-70b-instruct:free', customKey:'', speakRate:0.9, simple:false, calibration:{} }

Storage key: `sf.settings`. `loadSettings(storage)` parses JSON in try/catch and merges each field only when its type
matches the default (so a corrupt field cannot break the app). `saveSettings` swallows quota errors.

## Routing algorithm
`parseHash(hash)`: strip `#/`, take the first segment, lower-case it; if it is a known RouteId return it, else 'home'.
The hook listens to `hashchange`, sets state, calls `window.scrollTo(0,0)` and sets the title.

## Header
- Flex row: brand | divider | nav (flex:1, `justify-content: space-evenly`) | Settings.
- Payday scan is in position 4 of 8, so it sits near the middle.
- Sliding pill: one absolutely positioned element inside the nav. Its left/width follow the hovered item's
  offsetLeft/offsetWidth (transform + width, CSS transition), and return to the active item on pointerleave and on
  route change. A ResizeObserver re-measures it.
- Dropdowns: a `<button aria-haspopup="menu" aria-expanded>` plus `<div role="menu">` with `role="menuitem"` links.
  Keyboard: ArrowDown opens and focuses the first item; Up/Down/Home/End move; Escape closes and refocuses the
  trigger; Tab closes. A document pointerdown listener closes when the pointer is outside.
- Overflow: at 1001–1239px icons are hidden (except scan), gaps shrink, and label font steps down. The nav has
  `min-width:0`, and labels have `white-space:nowrap`. A Playwright check at 1001, 1100, 1239 and 1280px asserts
  scrollWidth ≤ clientWidth.

## Phone
Header (brand, square scan button, gear) + `TabBar` fixed bottom with `padding-bottom: env(safe-area-inset-bottom)`.
`main` gets bottom padding equal to the bar height. `MoreSheet` is a `role="dialog" aria-modal` panel sliding up from
the bottom with a backdrop button; focus moves into it and Escape closes it.

## Splash
- index.html holds `<div id="sf-splash">` with a copy of the Brand markup (same classes, same inline SVG logo) and
  inline CSS: fixed dark background, brand centred with `transform: scale(2.4)`. `<body class="splashing">`.
- The inline script records `start = performance.now()` and reads `?splash=<ms>` (integer, clamped to 0..10000;
  default 1500) into `window.__sfSplash = { start, min }`.
- `finishSplash()` (called from App after first paint, via rAF): waits until `now − start ≥ min`, measures
  `.brand` in the header and the clone, and sets a transform on the clone that maps its rect onto the header rect
  (translate + scale), transition 600ms. On `transitionend` (or a 900ms timer) it removes `body.splashing` and the
  splash node. CSS: `body.splashing header .brand { visibility:hidden }`.
- Reduced motion: no transform, just a 200ms fade. Safety timer: inline script removes the splash after 8s.

## Effects (fx.ts)
- `initFx()` runs once: computes lite = matchMedia('(max-width:1000px), (pointer:coarse)') and reduced =
  matchMedia('(prefers-reduced-motion: reduce)'), toggling body.lite and body.reduced on change.
- Ripple: delegated pointerdown on `button, .btn`; appends a span at the press point, removed on animationend. Off
  when reduced.
- Reveal: IntersectionObserver on `[data-reveal]`; adds `.in` with `--i` index for staggered delay. A
  MutationObserver picks up new nodes. When reduced, add `.in` immediately.
- Tilt: delegated pointermove; stores the latest target and pointer position; one rAF callback writes a single
  `style.transform` per frame. Off on lite and reduced. No filter or blur anywhere.
- Ambient: two CSS layers (radial warm gradients drifting via keyframes; an SVG hole pattern at low opacity). Under
  body.lite they are static; under reduced, no animation.
- Page turn: `main > .page` gets a keyed remount with a short rotateX/translate keyframe; disabled when reduced.

## Service worker (public/sw.js)
- `CACHE = 'sf-v<build>'`. The version comes from a query on registration (`sw.js?v=<hash>`) using
  `import.meta.env` build time, so each deploy gets a new cache.
- install: cache `./`, `./index.html`, `./icon.svg`, `./manifest.webmanifest`; skipWaiting.
- activate: delete caches not equal to CACHE; clients.claim.
- fetch (GET, same origin): navigations → network first, fall back to cached index.html; other → cache first, then
  network and store.

## Correctness properties (tested)
- P1 parseHash returns a known RouteId for every string, and the identity for every known route (fast-check).
- P2 loadSettings never throws, for any stored string, and always returns a value whose fields have the default types.
- P3 loadSettings(saveSettings(s)) round-trips every valid settings object.
- P4 t() replaces every {n} that has an argument and leaves others untouched.
- P5 the route table has exactly the 15 routes, in the Records and More orders of the brief.
- P6 splash duration parser: integer in 0..10000, default 1500 for missing or invalid input.

## Error handling
- Storage unavailable or throws → in-memory defaults, no crash.
- Service worker registration failure → ignored (console.warn in dev only).
- Splash never ends (app crash) → 8s safety timer removes it.
