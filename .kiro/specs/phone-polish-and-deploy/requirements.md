# Requirements: phone-polish-and-deploy (Phase 12)
Phone layout, performance, offline caching, GitHub Pages deploy, screenshots and documentation.
Reference: docs/BUILD_BRIEF.md §4 Phase 12, §6.10, §6.12.
## R1 Phone layout
**User story:** As a worker on a mid-range phone, I want every page to fit the screen and be easy to tap.
1. WHILE the viewport is 375px wide THE SYSTEM SHALL show all 15 pages with no sideways scroll (html and body use
   overflow-x: clip, and wide tables scroll inside .table-wrap).
2. THE SYSTEM SHALL give buttons, inputs, switches, the scan button, the gear and the Listen button a tap target of at
   least 44px.
3. THE SYSTEM SHALL never wrap dates, times and numeric table cells (white-space: nowrap).
4. WHILE the viewport is 700px or narrower THE SYSTEM SHALL stack .stackable tables into labelled cards.
5. WHILE the viewport is 1000px or narrower THE SYSTEM SHALL lift the toast and the Listen button above the tab bar and
   the device safe area.
## R2 Performance
1. WHILE the viewport is 1000px or narrower, or the pointer is coarse, THE SYSTEM SHALL add body.lite, which turns off
   tilt and hides the second glow.
2. WHILE the user scrolls THE SYSTEM SHALL add body.scrolling, which pauses background animation, and remove it after scrolling stops.
3. THE SYSTEM SHALL never use blur effects on hover, and SHALL apply tilt with one rAF style write per frame.
4. THE SYSTEM SHALL load every page except Home lazily, with a "Loading…" fallback.
5. WHEN the camera runs THE SYSTEM SHALL use the Web Worker and downscaled frames.
## R3 Offline
**User story:** As a worker with poor signal, I want the whole app to work after the first visit.
1. WHEN the app is built THE SYSTEM SHALL emit assets-manifest.json listing every file under assets/.
2. WHEN the service worker installs THE SYSTEM SHALL cache the shell (index, icon, manifest) and every file in the manifest.
3. IF the manifest cannot be read THE SYSTEM SHALL still install, and cache assets on first use.
4. WHEN a request is a navigation THE SYSTEM SHALL try the network first, store the page, and fall back to the cached
   index.html when offline.
5. THE SYSTEM SHALL ignore non-GET requests and other origins (AI endpoints).
6. WHEN a new version activates THE SYSTEM SHALL delete older sf-* caches. The cache name carries the build id.
## R4 Deploy
**User story:** As the author, I want every push to main published over HTTPS, which the camera needs.
1. WHEN code is pushed to main THE SYSTEM SHALL build dist/ and publish it to GitHub Pages with a GitHub Actions
   workflow (.github/workflows/pages.yml).
2. THE SYSTEM SHALL use relative asset paths (base './'), so the site works under /<repo>/.
3. WHEN the first deploy finishes THE SYSTEM SHALL serve the live page over HTTPS, and the live main JS bundle SHALL be
   the one from the latest build. This is checked after the first push.
## R5 Review tooling
1. THE SYSTEM SHALL provide scripts/shots.sh, which takes headless Chrome screenshots of all 15 pages at 1280px and 375px
   into docs/screenshots (30 files), with ?splash=0. It is used because the browser MCP config could not be written.
2. THE SYSTEM SHALL provide scripts/serve.mjs, a dependency-free static server for dist/ on 127.0.0.1 (default port 4173),
   which refuses paths outside dist/.
## R6 Documentation
1. THE SYSTEM SHALL provide a README with the story, live link, video link, how it works, run and test commands, the
   feature list, the property table, the honest limits, a "Built with Kiro" section linking .kiro/, and the licences of
   jsQR (Apache-2.0) and qrcode (MIT).
2. THE SYSTEM SHALL provide DEPLOY.md, with the Pages setup and how to confirm the live bundle.
3. THE SYSTEM SHALL provide FIELD_TEST.md, a checklist for real paper, punches and phones.
