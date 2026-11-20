# How Kiro was used

Stock & Foil was built in Kiro from an empty folder for Kiroween 2026 (category: Resurrection). Everything Kiro used is
in [`.kiro/`](../.kiro/) at the repo root. The dated build record is [docs/KIRO_LOG.md](KIRO_LOG.md) and the brief Kiro
worked from is [docs/BUILD_BRIEF.md](BUILD_BRIEF.md).

## Kiro surface
All of the work was done in **Kiro IDE**, in agent chat sessions. Kiro CLI, Kiro Web and Kiro Crew were not used, so
there is no comparison between surfaces to report.

## Brief first, then steering
The project started with a build brief created first using Kiro AI (`docs/BUILD_BRIEF.md`): the product, the users, the 1834 story, the
hard rules, exact layout and scanner numbers, and the submission requirements. Steering makes sure Kiro reads it
in every session:

| Steering file | Inclusion | What it holds |
|---|---|---|
| `product.md` | always | product, users, story, hard rules, and `#[[file:docs/BUILD_BRIEF.md]]` so the full brief is in every context |
| `tech.md` | always | stack (Vite, React, strict TypeScript, Vitest, fast-check), no server, offline |
| `structure.md` | always | where code goes (`src/core` and `src/vision` pure and DOM-free, `src/ui`, `tests/`) |
| `testing.md` | fileMatch: src/core, src/vision, tests | property tests first, the photo simulator as the oracle |
| `design.md` | fileMatch: src/ui | the retro look, motion rules (transform/opacity only, reduced motion) |
| `kiroween.md` | manual | the submission checklist |

The strategy: rules that must never be broken (money in integer minor units, "never silently wrong", no names sent to
AI) live in always-on steering. Area rules load only when Kiro touches that area, so the context stays small.

## Specs vs vibe coding
- **Phase 0 was vibe mode:** steering, hooks, agents and the scaffold.
- **Everything after that is spec-driven.** There are 14 specs in `.kiro/specs/`, each with `requirements.md`, `design.md` and
  `tasks.md`:
  - foundation, card-core, printable-card, photo-simulator, vision-scanner, pair-and-pay, payday-scan,
    ledger-and-money, story-demo-lab, languages-and-voice, optional-ai, phone-polish-and-deploy (Phases 1–12);
  - wage-history-and-pay-slip and received-thumb-mark (added later).
- **Fix rounds updated the spec first.** For example:
  - after two webcam recordings of a failed scan, payday-scan gained requirements R6 and R7;
  - "Check the cut" and phone accuracy became R9;
  - the received thumb mark got its own spec with layout, detector, flow and privacy requirements.
- **One honest caveat:** after Phase 0 the first build of Phases 1–12 was done in one pass on request. The specs for
  Phases 2–12 were written to match the implemented code and its tests, rather than strictly before it. Later rounds
  were written spec-first.

Spec-driven work paid off most where numbers matter: the punch threshold, the unsure band, the 1.2 mm punched-together
tolerance, the RECEIVED box clearances (≥ 4 mm from the corner square, asserted in a test) all trace back to a
requirement.

## Agent hooks (`.kiro/hooks/`)
| Hook | Trigger | What it automated |
|---|---|---|
| Property tests on save | a file in `src/core` or `src/vision` is saved | runs the related property tests with `SF_RUNS=10` and reports failures with the counterexample |
| i18n sync | a file in `src/ui` is saved | runs the string extractor and the pack checker, lists new or missing strings |
| Guard .kiro | `.gitignore` is edited | checks that `.kiro` is never ignored (a submission rule) |
| Kiro log | a spec task finishes | when all of a spec's tasks are done, appends a dated entry to `docs/KIRO_LOG.md` |
| Pre-submit audit | manual | checks every submission requirement (URL, offline, licence, `.kiro`, video, write-up) and reports pass/fail |

## Custom agents and sub-agents
- **`scanner-reviewer`** (`.kiro/agents/scanner-reviewer.json`): reviews changes in `src/vision` against the rule
  "never silently wrong". Every uncertain reading must come back as "unsure" or a warning, never a guess, and the
  vision code must stay free of React and the DOM.
- **`translator`** (`.kiro/agents/translator.json`): fills the UI language packs chunk by chunk and keeps `{0}`
  placeholders, names and numbers intact. Its instructions were run as **parallel sub-agents**, one per language:
  - the first build: Hindi, Bengali, Tamil, Spanish and Swahili, 482 strings each, plus the Story in 11 languages;
  - later rounds: 31, 35, 57 and 98 new strings × 5 languages.

  A merge script rejects any translation whose placeholders don't match. A checker keeps every pack at 100% (801 of
  801 strings).

## MCP
A free MCP setup was planned (Playwright for screenshots, GitHub for Actions and Pages status, fetch for library docs).
Writing `.kiro/settings/mcp.json` was blocked by a workspace permission rule, so the proposed config is in
`docs/mcp.proposed.json` and no MCP server was active. Instead, Kiro drove headless Chrome directly over the DevTools
protocol from small scripts. The scripts used Chrome's fake camera fed with videos made by the photo simulator, so the
full scan → join → pay flow could be run, checked for console errors and sideways scroll, and screenshotted at phone
(390 px) and desktop (1280 px) widths.

## Powers
None. Kiro Powers were not confirmed as available in this session, and nothing was installed without approval.

## Property-based tests and the bugs they caught
- **Size:** 161 tests in 40 files, written with fast-check.
- **The oracle:** a photo simulator (`src/render/scene.ts`) renders the real printed sheet and photographs it, then
  scanner results are compared with the truth.
- **Phone conditions:** tests add tilt, perspective, blur, motion blur, JPEG at quality 0.6, a 12 MP still downscaled,
  glare, 40% light and fingers.
- **Speed:** the heavy accuracy tests are split into shards that run in parallel. They make 50 runs by default (`npm test`,
  about 100 s) and 200 with `npm run test:accuracy`.

Real bugs the tests caught (details in KIRO_LOG):
1. **A forged hole passed the punched-together check.** With 4 holes, dropping the largest leave-one-out residual
   removed an honest hole and kept the separately made one (1.6 mm off). Fix: drop the hole whose removal leaves the
   others fitting best.
2. **Far corner squares were crowded out** under 15° tilt by punched holes and the QR's own squares.
3. **Non-reproducible photo tests:** random pairing secrets changed the QR between runs; fixed secrets made
   counterexamples reproducible.
4. **Glare hid punches:** 15 of 200 simulated phone frames had a hole read as blank with full confidence. Spots with a
   reflection are now "unsure" (0 of 200 after).
5. **"Check the cut" could never pass:** following the old on-screen instruction (edges touching), there was no table
   beyond the edge to trace against. The new instruction asks for a 1–3 cm gap.
6. **Check the cut missed real pairs:** at a 1 cm gap, the other half was read as the table; two QR codes in one
   picture confused the reader. Fixed with a darker-quarter table reference and reading the picture in bands
   (200 of 200 fit after, 0 of 62 forged foils).
7. **A finger over the cut was traced as the edge,** which turned an honest pair into "Halves do not match". This was
   found on the fake-camera run. An edge now counts only when the near side is bright paper.
8. **A finger over the RECEIVED box read as "no mark"** instead of "unclear". Found by the received-mark property run
   and fixed before release.

## In numbers
- 14 specs, 6 steering files, 5 hooks, 2 custom agents.
- 161 tests in 40 files.
- 6 UI languages at 801 of 801 strings.
- Built in Kiro IDE over the Submission Period. The commit history is on GitHub.
