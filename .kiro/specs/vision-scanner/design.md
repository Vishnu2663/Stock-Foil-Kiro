# Design: vision-scanner (Phase 5)
## Architecture
    src/vision/image.ts    RGBAImage, Gray, toGray, median3, unsharp, upscale2, downscale, integral, boxMean, median, sample
    src/vision/detect.ts   T (thresholds), findQRs, estimatePose, readPunches, holeCentre, traceEdge, scanHalf,
                           scanGray, scanImage, punchSets
    src/vision/worker.ts   Web Worker: 'scan' | 'sim' | 'roundtrip' requests
    src/ui/scanAsync.ts    scanImages, simulate, roundTrip (promise wrapper, main-thread fallback)
detect.ts imports qrGeometry from src/render/sheet.ts and the core modules; it has no DOM.
## Data shapes
    T = { punch 0.62, unsureLo 0.48, unsureHi 0.78, discNominal 0.62, discWindow 0.17, discHole 0.15,
          discUnsure 0.0825, ambiguous 0.26 }
    Pose { H, fiducials: (Pt|null)[4], fiducialsFound, fitError, pxPerMm }
    CellReading { key, kind, n, half, ratio, punched, unsure, hole?: {dx, dy, r, clipped} }
    HalfScan { decoded, qr, pose, cells, edge[94], edgeCoverage, paperRef, bgRef, grey?, ambiguousSurface, warnings, outline }
    ScanResult { width, height, halves, foreign, invalid, ms }
    ScanOptions { calibration?: {threshold?, tolerance?}, maxQrLevel?, maxHits? }
## Algorithms
- **findQRs**: runJsQR at level 0 (raw), 1 (median3), 2 (+unsharp), 3 (+2× upscale; corners divided by 2).
  After each hit the QR quad (grown 1.25×) is filled so the next search finds another code.
- **estimatePose**: H0 from qrGeometry(17 + 4·version).corners to the QR corners. darkBlobs thresholds pixels below
  0.55 × local mean (and < 140), labels connected components, and keeps compact blobs (aspect ≤ 2.4, fill ≥ 0.42, not
  on the border). Blobs are mapped to mm through H0, the QR box is excluded, and the 3 nearest blobs (< 45mm) are
  kept for each corner square. All combinations (including "none") are fitted with weighted solveHomography
  (weight 6 for 3+ squares); the best fit has the most squares, then the lowest error.
- **readPunches**: sampling disc of radius 1.6mm (step 0.4) per circle; paper = median of 3 patch means; paperRef
  = median over cells; bgRef = median of 9 background points. Normal and disc rules as in R3. Hole centres are measured
  only for punched cells darker than paper (normal) or darker than the grey (discs), with a darkness threshold at
  (1 + bg)/2 or (grey + bg)/2 and a maximum shift of 3.6mm (3.0mm on half-day cards).
- **holeCentre (mean-shift)**: window radius 3.7mm, step 0.25mm; weights = clamp((thr − v/paper)/0.12 + 0.5, 0, 1);
  the window re-centres on the weighted centroid up to 6 times (stop when it moves < 0.02mm or exceeds maxShift);
  r = √(Σw·step²/π); clipped when dark pixels touch the rim, r < 2.3 or r > 3.6, or the shift exceeds the maximum.
- **traceEdge**: for each x, compare luminance 1mm inside and 24mm outside the nominal edge; if the contrast is below
  18%, NaN; else walk in 0.1mm steps to the mid-level crossing, confirmed 1.5mm further out; offsets above 8mm are NaN.
- **Worker protocol**: `{id, kind, …}` in, `{id, ok, results|sim}` or `{id, ok:false, error}` out.
- **scanAsync**: one lazily created module worker; pending promises keyed by id; onerror rejects all, terminates and
  clears the worker; no Worker → dynamic import of detect.ts and scene.ts and the same work inline.
## Correctness properties (tests/scanner.test.ts, photoRuns, simulator as oracle)
1. Inside the envelope (±25°, tilt ±6°, blur ≤ 1.2, noise ≤ 0.02, light ≤ 0.3, 3.4–4.2 px/mm, dark background; white
   background for half the disc cards) the punched set is recovered exactly, 4 corner squares are found, and no cell
   is unsure.
2. Outside it (blur 1.8–3.2, noise 0.05–0.1, background 0.5–0.97, crop 12–40%, 1.8–2.6 px/mm, light 0.5–0.75, tilt
   14–22° with blur), every wrong reading is unsure or the half carries a warning.
3. Disc cards read correctly on dark (0.1), pale (0.78) and white (0.97) surfaces; on an ambiguous surface (0.5)
   ambiguousSurface is set, every circle is unsure and "ambiguous-surface" is warned.
4. The far corner squares are found (4 of 4) under 12–18° tilt about x or y.
Also: a QR that is not Stock & Foil goes to `foreign` with no half.
## Bugs caught by the properties
(a) **Separately punched hole skipped by the alignment check.** Property 1 and the pair alignment property showed
that a hole punched separately 2.2mm off its circle was clipped by the old fixed 4.6mm centre window. The clipped
hole was skipped by the alignment check and never flagged, so a forged hole passed. Fix: a mean-shift centroid in a
3.7mm window that follows the hole, plus confirmation of punched-but-unsure cells when a whole, unclipped 3mm hole is
found (R3.7, R3.8).

(b) **Non-deterministic photo tests.** Cards got a random pairing secret on every run, so the QR changed, and with it
the reading of a borderline 0.48 ratio. Failures could not be reproduced and fast-check shrank them for about
13 minutes. Fix: fixed pairing secrets in the photo pair tests (tests/pair.test.ts), and `endOnFailure` in
photoRuns (tests/helpers.ts) so a failure is reported at once.
## Error handling
- scanHalf returns null when the pose cannot be made; the half is dropped, never guessed.
- NaN samples (outside the image) become warning "partial" and unsure cells.
- A worker exception returns ok:false with the message; scanImages throws it, and the UI shows a toast.
- A crashed worker rejects all pending calls and is recreated on the next call.
