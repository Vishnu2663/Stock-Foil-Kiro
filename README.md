# Stock & Foil

**The tally sticks that burned Parliament have come back from the dead.**

For about 700 years England's Exchequer kept accounts on split tally sticks: notched hazel split lengthwise. The creditor kept the stock, the debtor the foil, and a cheat would have to match wood grain nobody can copy. In October 1834 the obsolete sticks were burned in the furnaces under the House of Lords, the chimneys caught fire, and the Houses of Parliament burned down.

Stock & Foil resurrects the split stick for the millions of people paid daily in cash who still get no record. It is a paper card cut in two along a one-of-a-kind wavy line. The worker keeps the stock, the employer keeps the foil, both are punched together every day, and on payday any phone verifies the pair and works out the pay. The worker needs no phone and doesn't need to read. Free, offline, no server, no account.

- **Live app:** https://vishnu2663.github.io/Stock-Foil-Kiro/
- **Demo video:** _link added after recording_
- Built with [Kiro](https://kiro.dev) for **Kiroween 2026**, category **Resurrection**.
- **Project description:** [docs/DEVPOST.md](docs/DEVPOST.md) · **How Kiro was used:** [docs/HOW_KIRO_WAS_USED.md](docs/HOW_KIRO_WAS_USED.md)

## How it works

1. **Print and cut.** Each A4 card has two halves separated by a wavy cut generated from the card id. Each half has 4 corner squares, a QR code, a Monday-first calendar of punch circles and 10 advance-token circles.
2. **Punch both, daily.** Stack the halves and punch the day's circle through both with a 6 mm office punch.
3. **Scan on payday.** The phone reads both QR codes and checks, in order: worker half found, employer half found, same card id, card code, pairing code (SHA-256 tag over both secrets), the wavy cut fit, every punch on both halves, holes punched together (leave-one-out rigid fit, 1.2 mm), and photo quality (≥ 3 corner squares). It pays only the agreed holes: `days × wage − advances ± carried = total`, and shows the notes to hand over on a picture pay slip that is read aloud in the worker's language.

## Features

- New card (live A4 preview, print at 100%, hand-written PDF writer), half-day circles, printed grey discs, carried balance, edit-as-revision
- Members roster and "Create N cards + one PDF" (never duplicates)
- Payday scan: rear camera with live overlay and automatic capture, or photos / drag and drop; scanning in a Web Worker
- Result card with stamped verdict, party pops, count-up, one-sided holes, tap-to-correct unsure cells, wage change mid-month
- Hash-chained ledger, "Already paid", History (paid / yet to pay), Crew payroll with note mix, Income proof certificate + verifier
- Story (9 chapters, real scanner live, narration in 11 languages), Demo, Test lab (sliders, tamper, stress test, print round-trip), Calibrate, Punch guide
- 6 UI languages (English, हिन्दी, বাংলা, தமிழ், Español, Kiswahili), pictures-and-voice mode
- Optional AI (Chrome on-device or your own OpenAI-compatible key) with anonymised numbers only and an offline fallback
- PWA: works offline after the first visit

## Run, test, build

    npm install
    npm run dev          # http://localhost:5173
    npm test             # property-based tests (SF_RUNS=15 by default)
    SF_RUNS=50 npm test  # more runs
    npm run test:accuracy  # phone, cut-check and received-mark accuracy with 200 runs each
    npm run typecheck
    npm run build        # dist/

## Property-based tests

All in `tests/`, written with fast-check. The photo simulator (`src/render/scene.ts`) is the oracle for the scanner.

| Area | Property |
|---|---|
| Card | encode → decode round-trips every spec, role and flag; editing a coded field breaks the code; SF1 form unchanged |
| Wave | deterministic, within ±5 mm, peak exactly 5 mm, distinct per id |
| Money | amounts capped at 2,000 even for NaN/±∞; net pay exact in every view; cash notes + remainder = amount |
| SHA-256 / pairing | NIST vectors and Node crypto; honest pairs verify; fabricated, swapped, foreign or edited halves never do |
| Homography | recovers a random pose and inverts exactly |
| Scanner | inside the envelope the punched set is exact; outside it every wrong reading is "unsure" or warned; disc cards on dark/pale/white; ambiguous surface → all unsure; far corners under strong perspective |
| Pair | agreed = intersection; extra or missing holes always detected and never paid; holes punched together never flagged (1.2 mm / 0.5°); separate holes flagged; wrong secret rejected; legacy cards rely on the cut |
| Ledger | chain breaks at the right place on any edit, removal or reorder; latest payment wins; certificates fail on any tampering; history totals add up |
| i18n / AI / speech | every pack complete with intact placeholders; every story chapter has text; prompts never contain names or ids; offline text always states the sum and disputed days; failures fall back |
| Print round-trip | the real SVG sheet is rasterised, cut on its wave, punched, photographed and scanned as a genuine pair |

## Honest limits

- One person holding BOTH halves can punch both. The protocol assumes each side keeps their own half; use a witness for disputes.
- Pairing proves the halves were issued together. The issuer could reprint either half, and anyone can copy their own half's QR.
- The 1.2 mm punched-together tolerance and the scanner thresholds come from the simulator. Field-test them with real paper, punches and phones (Calibrate exists for this; see [FIELD_TEST.md](FIELD_TEST.md)).
- Translations are AI-drafted and need native-speaker review.
- The supported capture envelope is about ±25° rotation, mild tilt, blur ≲1.3 px at ~3.6 px/mm, noise, uneven light, the whole half in frame. Outside it the app warns instead of guessing.

## Built with Kiro
**The build brief came first.** Before any code, the full build brief was created using Kiro AI: product, users, the 1834 story, hard rules, exact layout and scanner numbers, and the submission requirements. It is in [docs/BUILD_BRIEF.md](docs/BUILD_BRIEF.md), and the steering file `product.md` includes it in every Kiro session, so every spec, hook and line of code was built from it.


Everything Kiro used is in [`.kiro/`](.kiro/): 14 specs (`.kiro/specs/`), steering (`.kiro/steering/`), agent hooks (`.kiro/hooks/`) and custom agents (`.kiro/agents/`). The write-up is [docs/HOW_KIRO_WAS_USED.md](docs/HOW_KIRO_WAS_USED.md), the build log is [docs/KIRO_LOG.md](docs/KIRO_LOG.md) and the original brief is [docs/BUILD_BRIEF.md](docs/BUILD_BRIEF.md). Deployment: [DEPLOY.md](DEPLOY.md).

## Licences

Stock & Foil is MIT licensed ([LICENSE](LICENSE)). Third-party runtime libraries: [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0) and [qrcode](https://github.com/soldair/node-qrcode) (MIT), plus React (MIT).
