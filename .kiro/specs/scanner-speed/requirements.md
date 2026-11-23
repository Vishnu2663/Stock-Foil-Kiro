# Requirements: scanner-speed
Make the live Payday scan fast on phones without losing any accuracy. Extends vision-scanner and payday-scan.
Out of scope: the printed card layout, the QR payload, pay and ledger logic.

## Problem
On a phone, a half takes several seconds to lock and capture, and the camera sometimes keeps saying "Hold still…" with
the card flat and in good light. Today each tick grabs a 1600 px frame on the main thread, copies it to the worker,
searches the whole frame for the QR with up to 7 ladder steps (two of them 2× upscales, all with attemptBoth), and needs
3 identical reads in a row on phones.

## Goals (mid-range Android phone, Chrome, good indoor light, half held 25–35 cm away)
- Per-frame live scan p50 ≤ 120 ms and p95 ≤ 250 ms once the card is found; first find p50 ≤ 300 ms.
- Card fully in view → auto-capture ≤ 1.2 s p50.
- Accuracy unchanged: `npm run test:accuracy` gives 200/200 genuine pairs, 0/62 forged foils, 0/200 phone frames wrong.
  No existing test is weakened or deleted.
- No main-thread task over 50 ms while scanning.
- Desktop-equivalent benchmark target for a tracked frame: p50 ≤ 60 ms.

## R1 Timing breakdown
1. WHEN the scanner debug setting is on, THE SYSTEM SHALL show a per-frame timing breakdown in ms: grab, blur check,
   transfer, gray, QR, pose, cells, edge, receipt, total.
2. THE SYSTEM SHALL measure the same stages in a benchmark (tests/scanSpeed.test.ts, run with BENCH=1) and print p50
   and p95 per stage.

## R2 Region of interest
1. WHILE a card is being tracked, THE SYSTEM SHALL search for its QR and corner squares only inside a region predicted
   from the last pose (the card outline expanded by 25%).

## R3 Losing the card
1. IF the card is not found in the region for 2 consecutive frames, THEN THE SYSTEM SHALL search the whole frame again.

## R4 Tracking (changed after Task 1, approved)
1. WHILE a card is tracked, THE SYSTEM SHALL decode its QR on EVERY frame, but only inside a window around where the QR
   was in the last frame (its box grown by 60%), at full resolution.
2. THE SYSTEM SHALL never reuse a card id, role or reading from an earlier frame, so a swapped card is read as the new
   card on the next frame and can never be captured as the first one.
   (The original "skip QR decoding" plan was dropped: decoding in the small window costs ~14 ms and removes the risk.)

## R5 Native QR detection
1. THE SYSTEM SHALL use BarcodeDetector (format qr_code), where available, to LOCATE QR codes (text and box) in a live
   frame, and jsQR otherwise.
2. The exact corners SHALL always come from jsQR inside the located box, so the pose means the same on every browser.

## R6 Short live QR ladder
1. In live mode THE SYSTEM SHALL use the ladder raw → blur1 → unsharp, at 1×, with inversionAttempts 'dontInvert'.
2. THE SYSTEM SHALL keep the full 7-step ladder with 2× upscales and attemptBoth for "Capture now", photo import and
   the accuracy tests.

## R7 Two resolutions (changed after Task 1, approved)
1. WHEN nothing is tracked, THE SYSTEM SHALL look for QR codes on a copy with a long side of about 800 px, and SHALL then
   measure the exact QR corners with jsQR on a full-resolution window around each one (at 800 px a QR module is only
   ~2.6 px, too small for exact corners).
2. THE SYSTEM SHALL read the corner squares, punch cells, cut edge and received mark on the full-resolution frame, as
   the full path does.
3. IF the small copy decodes nothing but shows corner-square blobs, THE SYSTEM SHALL try the full frame once.

## R8 Scheduling
1. THE SYSTEM SHALL start the next scan as soon as the previous one finishes (requestVideoFrameCallback where
   available, so each scan uses a new frame), instead of a fixed interval.
2. THE SYSTEM SHALL never run more than one scan at a time.

## R9 Frames off the main thread
1. WHERE OffscreenCanvas and createImageBitmap exist, THE SYSTEM SHALL transfer an ImageBitmap of the video frame to
   the worker and read its pixels there.
2. WHERE they do not exist, THE SYSTEM SHALL keep the current path.

## R10 Adaptive capture streak
1. THE SYSTEM SHALL capture after 2 consecutive identical reads WHEN no cell is unsure AND every cell's ratio is at
   least 0.08 from the punch threshold; otherwise it SHALL need 3.
2. The 5-read vote, captureBlocker and the glare rule SHALL stay exactly as they are.

## R11 Camera resolution
1. THE SYSTEM SHALL request about 1280×720 at 30 fps for the live preview, keep continuous focus and exposure, and fall
   back to the current constraints if 720p is refused.

## R12 Allocation-free hot loops
1. toGray, boxBlur, the local mean in detectSquares and cell sampling SHALL reuse preallocated typed arrays and use an
   integral image for box sums, so no large arrays are allocated per frame.
