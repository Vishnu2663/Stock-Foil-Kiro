# Design: story-demo-lab (Phase 9)
## Architecture
    src/ui/sim.ts            demoCard, scenario(id), runPair(input, tolerance), randomCase(rnd)
    src/vision/calibrate.ts  suggestCalibration, calibrationReport (pure)
    src/i18n/story.ts        Chapter, STORY_EN, STORY (en + packs from ./story/*.ts), storyLangs, storyFor
    src/ui/pages/Home.tsx    hero, chips, TallyCard (components/Tally), three steps, QRImage
    src/ui/pages/Story.tsx   chapters, embers canvas, thumbs with burn, narration, voice and pace controls
    src/ui/pages/Demo.tsx    scenario buttons and SimView
    src/ui/pages/Lab.tsx     sliders, tamper buttons, stress test, print round-trip
    src/ui/pages/Calibrate.tsx  photo input, report, Apply, Reset, download
    src/ui/pages/Punch.tsx   3D punch animation and steps
    src/ui/pages/About.tsx   protections and limits
## Data shapes
    ScenarioId = 'claim'|'extra'|'sloppy'|'forged'|'forgedFit'|'halfday'|'paid'|'legacyForged'
    Scenario = { id, title, text, input: PairInput, expect }
    ScenarioRun = { sim: SimOutput, stock?, foil?, result: PairResult }
    CalibrationSuggestion = { threshold?, tolerance? }
    CalibrationReport = { halves, punchedRatios[], blankRatios[], holeRadii[], residuals[], punchedMedian, blankMedian,
                          holeRadius, suggestion | null, notes[] }
    Chapter = { title, short, text }
Story progress and voice persist in sf.storyPace and sf.storyVoice. Calibration lives in settings.calibration.
## Algorithms
- demoCard fixes the pairing secrets (7K3QX9ZT2M4B / P8D2W6HN5RCA) and card id, so every scenario is reproducible.
  Photo options are fixed (rotation −9° and 12°, blur, noise, light), and the seed defaults to 7.
- Scenarios: claim = 5 day holes + 1 advance on both halves; extra = one extra hole on stock only; sloppy = cut jitter 3
  on both halves; forged = no pairing and a foil cut on a different wave; forgedFit = right cut, wrong foil secret;
  halfday = half-day card, 9 half circles = 4½ days.
- runPair simulates in the worker (scanAsync.simulate), picks the stock and foil halves, then calls verifyPair with the
  calibration tolerance.
- Story: chapter index maps to scenarios (4 claim, 5 extra, 6 sloppy, 7 forgedFit). Narration speaks
  "<title>.\n\n<text>" with the ranked voice, and onEnd advances while playing.
- suggestCalibration: p = median(punched), b = median(blank). If not finite or p ≥ b, return null. threshold =
  round((p+b)/2, 3). With ≥ 4 finite residuals, tolerance = clamp(p95 × 1.5 + 0.3, 0.8, 2.5), rounded to 2 places.
- calibrationReport collects ratios from non-disc, non-dark-surface halves (skipping unsure cells), pairs each stock with
  the foil of the same card id to get alignment residuals, and adds notes when data is missing.
- storyFor(lang) uses the base language code and falls back to English.
- Lab stress test: N × randomCase (random month, half-day or disc card, random day holes, advance, photo options),
  run sequentially with a stop flag, counting passes.
## Correctness properties
- P1 the calibration suggestion lies between punched and blank brightness, and is null without data
  (tests/roundtrip.test.ts, "calibrate").
- P2 the simulator is deterministic per seed (tests/roundtrip.test.ts, "photo-simulator").
- P3 the print round-trip (real SVG sheet → raster → cut → punch → photo → scan) returns the punched days
  (tests/roundtrip.test.ts, "photo-simulator").
- P4 every story language has all 9 chapters with non-empty title, short and text (tests/i18n.test.ts, "packs").
- P5 a paired card is genuine-consistent, a wrong secret is rejected, and an extra hole is shown and never paid
  (tests/pair.test.ts; the scenarios reuse these cases).
## Error handling
- runPair rejections show an inline error in Demo, Lab and Story, and do not stop the page.
- Story: if speech is unsupported, Play advances on a timer (at least 4 s, about 55 ms per character) and the text is
  still shown. If no voice exists for the language, a note says the text is still shown.
- Calibrate: a photo that cannot be read adds a note and is skipped. Apply is disabled while suggestion is null.
- Lab sliders clamp to their ranges. Stop sets a flag checked between runs.
