# Tasks: scanner-speed
- [x] 1. Measure first: per-stage timing in scanImage, camera debug line (grab, blur, transfer + worker stages),
  tests/scanSpeed.test.ts behind BENCH=1, baseline recorded in docs/KIRO_LOG.md — R1
- [x] 2. QR via BarcodeDetector with jsQR fallback (src/vision/qr.ts), tests for both paths — R5
- [x] 3. Live short QR ladder with dontInvert; full ladder kept for manual capture, import and tests — R6
- [x] 4. Two-resolution pipeline: find at ~800 px, read cells/edge/mark at full resolution — R7
- [x] 5. Tracker and ROI search (src/vision/track.ts), unit tests: track, lose, re-find, card swap — R2, R3
- [x] 6. Tracked QR decoded in a small window every frame (no skipping); test: a different card in the tracked place is read as that card — R4
- [x] 7. ImageBitmap → worker → OffscreenCanvas; requestVideoFrameCallback scheduling — R8, R9
- [x] 8. Adaptive streak; tests: borderline cell needs 3, clear card captures on 2 — R10
- [x] 9. 720p live constraints with fallback — R11
- [x] 10. Allocation-free hot loops — R12 (partial: pooled gray and ink buffers on the live path, pooled integral/mask/stack in the square search; boxBlur and cell sampling unchanged, they are not the cost)
- [x] 11. npm test and npm run test:accuracy equal the baseline (200/200, 0/62, 0/200); benchmark before/after in KIRO_LOG
- [x] 12. Update vision-scanner and payday-scan specs (tracker, ROI, adaptive streak)
- [x] 13. Found while checking accuracy: the card layout change (ad7424c) made one "Check the cut" scene miss the foil QR
  (199/200). Fix: in a pair picture with one half read, search where the partner's QR must be (beyond the cut, any gap
  up to 40 mm), then the partner's whole area. Back to 200/200.
- [x] 14. Main thread: the capture snapshot is made from a 640 px frame in its own task; the audio context is created when
  the camera opens (it cost ~100 ms on the first capture sound).
- [x] 15. Live path added to the accuracy property runs: every phone frame is also read on the live path (first find and
  tracked) with 0 wrong-and-sure spots; every received-mark photo reads the same mark on both paths.
