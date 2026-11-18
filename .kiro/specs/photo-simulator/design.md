# Design: photo-simulator (Phase 4)
## Architecture
    src/render/scene.ts      renderHalf, renderPair, pairHoles, stackTransform, gaussBlur, EDGE_XS
    src/render/rasterSvg.ts  rasterSheet(svg, pxPerMm = 6) → Bitmap, inkFromBitmap(bitmap, originX, originY)
    uses src/render/sheet.ts printModel, src/core/{wave,layout,homography,prng}.ts
Consumers: src/vision/worker.ts ('sim' and 'roundtrip' requests), Demo, Story, Test lab, tests.
## Data shapes
    PhotoOpts { seed?, pxPerMm?, rotationDeg?, tiltXDeg?, tiltYDeg?, blur?, noise?, light?, lightAngleDeg?,
                background?, paper?, crop?, supersample? }
    HalfInput { spec, role, punched, holeCentres?, cutWaveId?, cutJitter?, payloadOverride?, ink? }
    SceneTruth { role, payload, H, punched, holeCentres, edge: number[94], pxPerMm }
    Scene { width, height, data: Uint8ClampedArray, truth }
    PairInput { spec, stockPunched, foilPunched, seed, stack?, punchJitter?, separate?, separateOffset?,
                forgeCutFoil?, stockCutJitter?, foilCutJitter?, stockPayload?, foilPayload?, photoStock?, photoFoil? }
    StackError { dx, dy, rotDeg }      Bitmap { width, height, data: Float32Array, pxPerMm }
## Algorithms
- **Pose** (poseFor): the piece rectangle x −12…198, y −12…138 (stock) or −18…141 (foil) is projected: tilt about x,
  then y, then in-plane rotation, with a pinhole at distance D = 420mm, scale k = ppm·D/(D+Z). The projected corners
  plus a seeded margin (20px + 5–9% of the size) give the image size, and solveHomography maps frame mm to px.
- **Pixel**: for each pixel, ss×ss samples (ss = 2, or 1 when blur ≥ 0.6) are mapped back through the inverse
  homography. sampleLum returns the background outside the piece, outside x −12…198, below the stock edge
  (132 + edge(x)) or above the foil edge (edge(x) − 12), and inside any hole (r = 3mm, bucketed on an 8mm grid);
  otherwise paper × ink(x, y).
- **Light**: a linear gradient along lightAngleDeg multiplies luminance by 1 − light·(g + 1)/2.
- **Blur and noise**: separable Gaussian blur (radius ⌈3σ⌉, clamped edges), then Gaussian noise from the seeded PRNG.
  Colour channels are v, 0.97v and 0.9v, so the image is slightly warm.
- **Cut**: edge(x) = wave(id).at(x) + jitter(x); jitter is 3 seeded sine components scaled to cutJitter mm.
- **pairHoles**: stock centres = printed centre + random offset within punchJitter; a foil hole that has a stock hole
  = stackTransform(stock centre), plus separateOffset in a random direction when it is listed as separate; a foil
  hole with no stock hole = printed centre plus its own jitter. Seeded by hash53('holes' + seed).
- **renderPair**: stock seed = 2·seed + 1, foil seed = 2·seed + 2.
- **rasterSheet**: a regex walker over the sheet SVG that tracks `translate` groups and fills rects, circles (disc or
  ring), and QR squares from the path; text and stroked paths are skipped.
## Correctness properties
1. Same input and seed give byte-identical pixels; another seed gives different pixels; the truth lists the punched
   keys. (tests/roundtrip.test.ts, "is deterministic per seed")
2. Print round-trip: the rasterised real sheet, cut, punched and photographed at ±15° and blur 0.7, scans back to
   exactly the punched set, and the pair is genuine-consistent with an edge match. (tests/roundtrip.test.ts)
3. The simulator is the oracle for the scanner properties 1–4, so every scanner property also exercises it.
   (tests/scanner.test.ts)
## Error handling
- Unknown punched keys are ignored (not in the truth).
- A crop leaves at least 40px of width.
- Photo tests use photoRuns(n) = { numRuns: n, endOnFailure: true } so a failing case is reported at once instead
  of being shrunk for minutes (each case renders full images).
- Photo pair tests (tests/pair.test.ts) use fixed pairing secrets, so the same seed always draws the same QR.
  A random secret changes the QR modules and with them the pixels.
