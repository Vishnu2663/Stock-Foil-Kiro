# Deploy

Stock & Foil is a static site. The camera needs HTTPS, which GitHub Pages provides.

## GitHub Pages (automatic)

1. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions** (one time).
2. Push to `main`. `.github/workflows/pages.yml` runs `npm ci`, typecheck, tests (`SF_RUNS=8`) and `npm run build`, then publishes `dist/`.
3. The site is served at `https://vishnu2663.github.io/Stock-Foil-Kiro/`. `vite.config.ts` uses `base: './'`, so it works under any sub-path.

## Check the live bundle is the new one

- Open the Actions run and note the build time.
- On the live site, open DevTools → Application → Service workers: the script URL is `sw.js?v=<build id>`. A new deploy changes the id, the new worker installs, deletes the old cache and takes over on the next load.
- Or compare `assets-manifest.json` on the live site with `dist/assets-manifest.json` from a local build of the same commit.

## Offline

`public/sw.js` pre-caches the app shell and every chunk listed in `assets-manifest.json` (written by a small plugin in `vite.config.ts`), so every page works offline after the first visit.

## Local preview

    npm run build
    node scripts/serve.mjs 4173     # http://127.0.0.1:4173/
    sh scripts/shots.sh             # screenshots of all 15 pages at 1280px and 375px (needs Google Chrome)
