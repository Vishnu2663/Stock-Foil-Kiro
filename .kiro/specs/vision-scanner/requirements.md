# Requirements: vision-scanner (Phase 5)
Reads one photo of one half: QR, pose, punched circles, cut edge and warnings. It runs in a Web Worker behind a
promise wrapper so the UI never blocks.
Reference: docs/BUILD_BRIEF.md §4 Phase 5, §6.5.
## R1 Finding the QR
**User story:** As a worker or employer, I want any photo of a half to be recognised without lining it up.
1. WHEN a photo is scanned THE SYSTEM SHALL search for QR codes with jsQR, masking each hit and repeating, for up to
   2 hits.
2. IF no QR is found THE SYSTEM SHALL escalate in steps: median denoise, then unsharp, then 2× upscale, and stop at
   the first step that finds one (maxQrLevel limits the steps).
3. THE SYSTEM SHALL report QR corners in original image coordinates.
4. WHEN a QR is not a Stock & Foil payload THE SYSTEM SHALL list it in `foreign`; WHEN it looks like ours but does not
   decode THE SYSTEM SHALL list it in `invalid`.
## R2 Pose
1. THE SYSTEM SHALL compute a frame-mm → image-px homography from the QR corners.
2. THE SYSTEM SHALL then find corner-square blobs over the whole image, not in a fixed window around the QR, and fit
   all four as a set to refine the pose.
3. THE SYSTEM SHALL accept a blob only if it lies within 1.2mm of its predicted place and has an area of 33–70 mm²
   in frame units, and SHALL prefer fits that use more squares.
4. THE SYSTEM SHALL report fiducialsFound (0–4), fitError (px) and pxPerMm.
5. WHEN the QR gives a scale below 0.8 px/mm THE SYSTEM SHALL give up on that half.
## R3 Reading punches
**User story:** As an employer, I want a hole read as a hole and a doubtful circle marked "unsure", never guessed.
1. THE SYSTEM SHALL compute for each circle ratio = centre luminance ÷ local paper luminance, where paper is the
   median of three reference points inside the cell.
2. WHEN the card is a normal card THE SYSTEM SHALL mark a circle punched when ratio < 0.62 and unsure when ratio is
   in [0.48, 0.78].
3. WHEN the card has discs THE SYSTEM SHALL take the grey as the median of ratios within ±0.17 of 0.62, mark a
   circle punched when |ratio − grey| > 0.15, and unsure when it is between 0.0825 and 0.15.
4. IF |background ÷ paper − grey| < 0.26 on a disc card THE SYSTEM SHALL set ambiguousSurface, mark every circle
   unsure and warn "ambiguous-surface".
5. WHEN the background is not darker than 0.48 of the paper on a normal card THE SYSTEM SHALL mark every circle
   unsure and warn "dark-surface".
6. WHEN a calibration threshold is set THE SYSTEM SHALL use it in place of 0.62 and shift the unsure band with it.
7. FOR each punched circle with a measurable hole THE SYSTEM SHALL record the hole centre offset (dx, dy mm), the
   radius and `clipped`, using a mean-shift centroid in a 3.7mm window that follows the hole.
8. WHEN a whole, unclipped hole of radius 3 ± 0.45mm is found near a punched-but-unsure circle THE SYSTEM SHALL
   confirm the circle (unsure = false), except on an ambiguous or dark surface.
## R4 Cut edge and warnings
1. THE SYSTEM SHALL trace the cut edge at x = 0, 2, … 186 (94 points), with NaN where it is not found, and report
   coverage.
2. THE SYSTEM SHALL warn with these codes: partial, few-fiducials (< 3 squares), low-contrast, dark-surface,
   ambiguous-surface, far (< 2.4 px/mm), blurry (fit error > 0.9 px/mm) and dark-photo (paper < 50).
3. THE SYSTEM SHALL support about ±25° rotation, mild tilt, blur up to about 1.3px at about 3.6px/mm, noise, uneven
   light and the whole half in frame; OUTSIDE it THE SYSTEM SHALL warn rather than guess.
## R5 Worker and async wrapper
**User story:** As a user, I want the page to stay responsive while photos are read.
1. THE SYSTEM SHALL run scan, sim and roundtrip requests in src/vision/worker.ts and answer each by id with
   ok + results, or ok:false + error text.
2. THE SYSTEM SHALL expose scanImages, simulate and roundTrip as promises in src/ui/scanAsync.ts.
3. WHEN no Worker exists or it cannot start THE SYSTEM SHALL run the same work on the main thread.
4. WHEN the worker fails THE SYSTEM SHALL reject every pending call and start a new worker next time.
5. THE SYSTEM SHALL provide punchSets(half, overrides) that applies manual corrections and marks them as manual.
## Fix round (webcam recording) — these replace the earlier rules where they differ
1. QR: THE SYSTEM SHALL try jsQR (inversionAttempts "attemptBoth") on raw → blur 1 → blur 2 → unsharp(3, 1.5) → 2×
   upscale of it → unsharp(3, 3) → 2× upscale of it, stopping at the first hit, on every scan including the camera.
2. The QR fills its whole 38 mm box: corners (140,14), (178,14), (178,52), (140,52) in the printer and the scanner.
   Cards printed with the earlier 1-module margin SHALL still scan.
3. Pose: THE SYSTEM SHALL find corner squares in the whole photo (dark when v < 0.55 × local mean AND v < 0.45;
   moment rect 0.85–1.2; l1/l2 ≤ 2.2), leave out the QR's own squares, try every 4-subset of the 14 squarest blobs plus
   the 2 nearest each predicted corner, and accept a fit whose predicted QR corners are within 0.08 × QR side and whose
   blob areas are 0.5–1.6 × the projected square. Each centre is refined sub-pixel in ±8, ±15, ±26 mm windows. Failing
   that it SHALL grow outward from the QR (affine below 3 squares, homography after).
4. Punches: ratio = centre disc (1.6 mm) ÷ median of the cell's paper points; punched when ratio ≤ punchRatio (0.62);
   unsure when punchRatio × 0.774 < ratio < punchRatio × 1.258. A cell not in the photo is unsure. Disc cards: grey =
   median of ≥ 3 ratios within 0.17 of 0.62 (else 0.62); hole when |ratio − grey| > 0.15, unsure from 0.55 × 0.15;
   ambiguous surface when |background/paper − grey| < 0.26 (then every cell unsure). The background is sampled on a
   row just beyond the cut. There is NO rule that marks every cell unsure because of a light background: instead the
   warning "Place the halves apart on a dark surface so holes and the cut edge show." is added.
5. Hole centre: flood fill inside a 6 mm disc below paper × 0.4, date-number box masked, seed within 2.2 mm, area ≥ 4 mm².
6. Cut edge: x = 4…182 mm, step 0.15–0.35 mm, a crossing counts only when it stays dark 1.2 mm further; skipped when
   background ≥ 0.72 × paper; warning "Keep fingers off the wavy edge so it can be checked." below 50% coverage.

## R9 Live camera path (see .kiro/specs/scanner-speed)
1. `scanLive` SHALL read exactly what `scanImage` reads (same readers on the full-resolution frame); only its QR search
   is cheaper: a window around the last QR position (tracker), boxes located by BarcodeDetector, an 800 px copy, then
   the full frame when corner squares are seen. Exact QR corners always come from jsQR.
2. Photo import, "Capture now" and Check the cut SHALL keep the full search.
