---
inclusion: always
---
# Tech

- Stack: TypeScript (strict), React, Vite, Vitest, fast-check. Static site, no backend.
- Runtime dependencies are ONLY: react, react-dom, jsqr, qrcode. Dev dependencies are ONLY: typescript, vite,
  @vitejs/plugin-react, vitest, fast-check and @types/*. Ask the user before adding anything else.
- No paid APIs, no database, no analytics, no login. Write all-new code; never copy from other Stock & Foil repos.
- The scanner runs in a Web Worker (src/vision/worker.ts); the UI uses the promise wrapper src/ui/scanAsync.ts.
- The service worker (public/sw.js) is hand-written. No workbox.
- Routing is hash based (#/home, #/issue, ...). vite.config.ts uses base './'.
- localStorage access is always wrapped in try/catch (private mode and quota errors must not crash the app).
- Money is integer minor units. Never use floats for money.
- Every phase ends green: `npm run typecheck`, `npm test`, `npm run build`.
- Git: use the configu- Git: use the configu- Git: usvasavan26@gmail.com) and the origin remote only. Never force-push,
  never change git config, never push without the user's approval.
- Work only inside this workspace folder.
