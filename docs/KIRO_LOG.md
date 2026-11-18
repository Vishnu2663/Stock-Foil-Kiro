# Kiro log

A running record of how Kiro was used to build Stock & Foil. Each phase adds a dated entry: what was built, the Kiro features used, the bugs the property tests caught, and screenshots.

## Specs

12 specs in `.kiro/specs/`: foundation, card-core, printable-card, photo-simulator, vision-scanner, pair-and-pay, payday-scan, ledger-and-money, story-demo-lab, languages-and-voice, optional-ai, phone-polish-and-deploy (Phases 1 to 12). Each has requirements.md (EARS criteria), design.md (data shapes, algorithms, numbered correctness properties tied to test files) and tasks.md.

## Steering

- Always: `product.md` (product, users, story, hard rules 5 to 8, and `#[[file:docs/BUILD_BRIEF.md]]` so the full brief is in every context), `tech.md`, `structure.md`.
- fileMatch: `testing.md` (src/core, src/vision, tests), `i18n.md` (src/ui, src/i18n), `design.md` (src/ui).
- Manual: `kiroween.md` (submission checklist).

## Hooks

- **Property tests on save** (src/core, src/vision): runs the related tests with SF_RUNS=10.
- **i18n sync** (src/ui): runs extract-ui-strings and check-ui-pack, and lists new or missing strings.
- **Guard .kiro** (.gitignore): makes sure .kiro is never ignored.
- **Kiro log** (after a spec task): appends an entry here when a spec's tasks are all done.
- **Pre-submit audit** (manual): checks every item of the submission requirements.

## MCP

Intended: Playwright (screenshots and click-through at 1280px and 375px), GitHub (read-only, Actions and Pages status), fetch (library docs). The agent could not write `.kiro/settings/mcp.json` (blocked by a workspace permission rule), so the config is in `docs/mcp.proposed.json` for the user to copy. Until then screenshots come from `scripts/shots.sh` (headless Chrome, all 15 pages at 1280px and 375px, saved in `docs/screenshots/`).

## Property-based tests

65 tests in 14 files, fast-check, `SF_RUNS` (default 15). The photo simulator is the oracle for the scanner. Full run: about 106 s.

## Custom agents

- `scanner-reviewer` (.kiro/agents/scanner-reviewer.json): reviews src/vision against rule 5 and the property tests.
- `translator` (.kiro/agents/translator.json): fills src/i18n/ui/<lang>.json chunk by chunk, keeping {0}, names and numbers. Its instructions were run as six parallel sub-agents: hi, bn, ta, es and sw UI packs (482 strings each) plus the Story in 11 languages.

## Powers

None installed. Kiro Powers availability was not confirmed in this session; nothing was installed without approval.

## Spec vs vibe

Phase 0 was vibe mode (steering, hooks, agents, scaffold). Phases 1 to 12 are spec-driven. The user asked for the whole build in one pass after Phase 0, so the specs for Phases 2 to 12 were written to match the implemented code and its tests, and every task is ticked against a test file.

---

## 2026-11-18 · Phase 0 · Kiro setup and scaffold (Vibe mode)

- Built: docs/BUILD_BRIEF.md (the full brief), 7 steering files, 5 hooks, 2 custom agents, scaffold (Vite, React, strict TypeScript, Vitest, fast-check), LICENSE, README stub, icon.svg.
- Kiro features: steering (always, fileMatch, manual), agent hooks, custom agents, vibe mode.
- Note: TypeScript 7 ships without the compiler API that the string extractor needs, so typescript is pinned to 5.9.

## 2026-11-18 · Phases 1 to 12 · The whole app

- Built: app shell, header with sliding pill and keyboard menus, phone tab bar and More sheet, splash that flies onto the header brand, ambient effects (lite on phones, off with reduced motion), settings store, PWA with a hand-written service worker; card core, wave, layout, pairing (synchronous SHA-256), homography; A4 SVG sheet, PDF writer, New card, Members with bulk cards; photo simulator and SVG rasteriser; scanner in a Web Worker; pair verification and pay; Payday scan with camera overlay, result, slip; ledger, history, crew, income certificate; Home, Story, Demo, Test lab, Calibrate, Punch guide, About; 6 UI languages with a runtime DOM translator and string tooling; speech; optional AI; deploy workflow, README, DEPLOY.md, FIELD_TEST.md.
- Kiro features: specs, steering, sub-agents (translator in parallel, spec writers in parallel), property-based tests.
- Bugs the property tests caught:
  1. **Separately punched hole missed.** `pair.test.ts` ("a separately punched hole is flagged for review") failed after 14 runs. Counterexample: `{"id":"00000000","month":1,"seed":999747,"stack":{"dx":0,"dy":0.2227,"rotDeg":0}}`, expected `[]` to include `d19`. A hole made 2.2 mm off its circle was clipped by the fixed 4.6 mm centre window or read at a ratio of 0.48 (unsure), so it was left out of the alignment check and never flagged. Fix: a mean-shift centroid in a 3.7 mm window that follows the hole, and a punched-but-unsure cell is confirmed when a whole unclipped 3 mm hole is found.
  2. **Non-deterministic photo tests.** The same counterexample did not reproduce, because every test card got a random pairing secret, so the QR and a borderline reading changed between runs. Fix: fixed pairing secrets in the photo tests. Shrinking slow photo cases took 13 minutes, so photo properties now use `endOnFailure`.
  3. **Test generator bug.** `punchArb` asked for more days than February has (`fc.subarray` maxLength error). Fixed in tests/helpers.ts.
- Found during the build (not by a property): jsQR did not read the QR at the combined worst case of the envelope (−25°, tilt 12°/8°, blur 1.3, noise 0.03). Each condition alone reads exactly; the envelope property uses mild tilt (≤ 6°) as in the brief. Outside it the scanner finds no QR or warns.
- Splash fix: in background or headless tabs requestAnimationFrame never fires, so the splash stayed up; a timer fallback now finishes it.
- Screenshots: `docs/screenshots/<page>-1280.png` and `<page>-375.png` for all 15 pages (`sh scripts/shots.sh`).
