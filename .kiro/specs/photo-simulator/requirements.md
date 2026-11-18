# Requirements: photo-simulator (Phase 4)
A deterministic renderer that shows one cut half the way a phone photo looks. It is the oracle for the scanner tests
and powers Demo, Story and the Test lab.
Reference: docs/BUILD_BRIEF.md §4 Phase 4, §6.5 item 7.
## R1 One cut half as a photo
**User story:** As a developer, I want realistic photos with known answers, so I can test the scanner without paper.
1. WHEN renderHalf is called THE SYSTEM SHALL return RGBA pixels (width, height, data) of one half, plus a ground
   truth.
2. THE SYSTEM SHALL render the frame, QR (error correction M), corner squares and circles from the same print model
   as the printable sheet.
3. THE SYSTEM SHALL show the background through every punched hole and outside the wavy cut edge, with the cut edge
   at wave(x) plus optional jitter.
4. THE SYSTEM SHALL render an intact disc at 0.54 of paper brightness, and printed discs at that grey.
5. THE SYSTEM SHALL work in Node and the browser with no DOM or canvas.
## R2 Conditions
**User story:** As a tester, I want to dial each real-world problem up and down.
1. THE SYSTEM SHALL support rotation, perspective tilt about x and y, scale (pixels per mm, 3.6 by default), blur
   (Gaussian sigma), noise, uneven light with a strength of 0 to 0.6 and an angle, background brightness, paper
   brightness (0.93 by default) and a crop that removes a fraction of the width.
2. THE SYSTEM SHALL support background brightness for dark cloth (0.12), a pale table (0.68) and a white table (0.97).
3. THE SYSTEM SHALL support a hole offset: a hole centre different from its printed circle ("punched separately").
4. THE SYSTEM SHALL support cut jitter in mm ("sloppy cut") and a cut on a different wave id (a different-cut forgery).
5. THE SYSTEM SHALL support a payload override, so a half can carry any QR text.
## R3 Determinism and ground truth
1. WHEN the same input and seed are used THE SYSTEM SHALL return identical pixels; WHEN the seed changes THE SYSTEM
   SHALL change them (when noise or pose randomness is on).
2. THE SYSTEM SHALL return the truth: role, payload, the frame-mm → image-px homography, the punched keys, each
   hole centre, the edge offsets at x = 0, 2, … 186 (94 values) and pixels per mm.
3. THE SYSTEM SHALL seed every random choice from the seed alone.
## R4 Pairs
**User story:** As a tester of the verifier, I want both halves of a card punched together or not.
1. WHEN holes are punched together THE SYSTEM SHALL place each foil hole where the stock hole lands after a stacking
   error (dx, dy, rotation about the frame centre), with a per-hole punch jitter (0.3mm by default).
2. WHEN a foil hole is listed as separate THE SYSTEM SHALL move it a further separateOffset mm (2.5 by default)
   in a random direction.
3. WHEN forgeCutFoil is set THE SYSTEM SHALL cut the foil on a different wave.
4. THE SYSTEM SHALL render the pair with different derived seeds for the two halves.
## R5 Print round-trip
**User story:** As the maintainer, I want proof that the real printed sheet can be scanned.
1. THE SYSTEM SHALL rasterise the real SVG sheet (rect, circle, path, no text) to a luminance bitmap in Node.
2. WHEN an ink sampler from that bitmap is passed to renderHalf THE SYSTEM SHALL use it as the printed luminance,
   then cut it on its wave, punch it, photograph it and let the scanner read it.
3. THE SYSTEM SHALL skip stroked paths such as the cut line, because the cut removes them.
