# Design: phone-polish-and-deploy (Phase 12)
## Architecture
    src/ui/styles.css        phone rules, nowrap, 44px targets, body.lite, body.scrolling, stackable tables
    src/ui/fx.ts             lite detection (matchMedia '(max-width: 1000px), (pointer: coarse)'), scroll pause
    src/ui/App.tsx           lazy() for 14 pages inside <Suspense fallback="Loading…">; Home is imported directly
    public/sw.js             hand-written service worker (cache 'sf-<version>')
    vite.config.ts           base './', plugin sf-asset-manifest (emits assets-manifest.json), __BUILD_ID__ define
    src/main.tsx             registers ./sw.js?v=<build id> in production only
    .github/workflows/pages.yml  checkout, setup-node, install, build, upload dist, deploy-pages (on push to main)
    scripts/shots.sh         headless Chrome screenshots, 15 pages × 2 widths
    scripts/serve.mjs        static server for dist/
    README.md, DEPLOY.md, FIELD_TEST.md
## Phone rules
- html, body: overflow-x: clip, max-width: 100%. .table-wrap scrolls inside itself.
- `.nowrap, time, .date`, `.table td.num` and `.btn`, `.chip` use white-space: nowrap.
- Targets: .btn and inputs min-height 44px, .btn.icon 44px wide, .switch min-height 44px, .sq-scan and .gear-btn
  44×44, body.simple sun and coin icons 44×44.
- @media (max-width: 700px): table.stackable turns each row into a card; each td shows its data-label before the value.
- @media (max-width: 1000px): tab bar layout, toast and Listen button offset by var(--tabbar) + safe-area-inset-bottom.
## Performance
- Lite mode: `body.lite [data-tilt]` has no transform, `.ambient .glow.b` is hidden. body.lite and body.scrolling pause
  `.ambient .glow` and `.ambient .holes` with animation-play-state: paused.
- fx.ts adds `scrolling` on every scroll event and removes it after a short idle timer. Tilt writes one style per frame in rAF.
- Pages load as separate chunks. The scanner runs in a Worker and the camera frames are downscaled.
## Service worker
- VERSION comes from the `v` query string, so each build has its own cache and activate removes older `sf-*` caches.
- install: addAll(SHELL), then fetch assets-manifest.json (no-store) and addAll(list). A failure is swallowed.
- fetch: GET and same origin only. Navigation: network first, copy to './index.html', offline fallback to the cached
  index. Other requests: cache first, then network, storing basic 200 responses.
- assetManifest plugin: in generateBundle, list bundle files starting with `assets/`, prefix './', emit the JSON.
## Deploy
Workflow on `push` to `main` (and manual dispatch): permissions contents read, pages write, id-token write; a build job
runs `npm ci` and `npm run build`, uploads dist/ as the Pages artifact; a deploy job runs `actions/deploy-pages`.
Live-bundle check: fetch the live index.html, read the script src (assets/index-<hash>.js) and confirm the same file
name exists in the local dist/index.html of the pushed commit.
## Screenshots
`sh scripts/shots.sh [base-url]` runs Chrome with a profile in .cache/chrome, windows 1280×1400 and 375×1700,
`--virtual-time-budget=6000`, URL `<base>?splash=0#/<page>`. It prints the number of files in docs/screenshots.
## Correctness properties
- P1 no page scrolls sideways at 375px, checked by reading the 375px screenshots (docs/screenshots/*-375.png). There is
  no automated test, because the browser MCP could not be configured.
- P2 every route is a lazy chunk or Home, and the build lists them in assets-manifest.json (check: npm run build, then
  open dist/assets-manifest.json).
- P3 the route table still has the 15 routes in the brief's order (tests/routes.test.ts).
- P4 the whole suite stays green (npm test) after the CSS and lazy-loading changes (tests/smoke.test.ts and all others).
## Error handling
- sw.js catches manifest failures and fetch failures, and never touches other origins.
- serve.mjs returns 403 for paths outside dist/ and 404 for missing files.
- shots.sh discards Chrome output and fails visibly only through a missing file count.
## Limits
Screenshots show layout only. Real phone behaviour (camera focus, glare, print scale) is covered by FIELD_TEST.md.
