# Design: scanner-speed

## Measure first
- `StageTimes` (src/vision/detect.ts): gray, qr, squares, pose, cells, edge, receipt, total (ms, from performance.now()).
  scanImage fills it and returns it as `ScanResult.timing`; it crosses the worker boundary unchanged.
- The camera adds the main-thread stages: grab (videoFrame), blur (sharpness check) and transfer (round trip minus
  the worker's total). `timingLine()` in src/vision/capture.ts formats them for the debug line (pure, tested).
- Benchmark: tests/scanSpeed.test.ts, skipped unless BENCH=1. It composes realistic live frames (a half of the real
  printed sheet at ~5 px/mm inside a 1600×900 frame, as a 1920×1080 camera downscaled to 1600 gives today) and runs the
  current live call `scanImage(img, { calibration: {} })`. Frame sets: "card in view" (rotations, small tilt, 1.2–1.5 px
  blur, uneven light) and "no card" (table only). It prints p50/p95 per stage.

## Tracker (src/vision/track.ts, pure)
- State per session: last HalfScan per role (H, outline, fiducials, spec id, role), frame counter, misses.
- predictROI(): the last outline's bounding box expanded by 25%, clamped to the frame.
- update(result): stores a found half, counts misses, resets after 2 misses (R3).
- shouldDecode(): true on the first frame, every 10th frame, after a miss, or when the fit error rises above 1.5× its
  running value (R4).

## Scanner options
- `scanImage(img, opts)` gains `opts.roi`, `opts.known` ({ id, role, payload }), `opts.live`.
- Returned coordinates stay in full-frame pixels: a crop is scanned and its homography is shifted back.
- findQRs(g, …, { live }): live uses ladder levels 0, 1, 3 with dontInvert; otherwise unchanged.
- decodeQR(g) in src/vision/qr.ts: BarcodeDetector when present (feature-detected once, detector cached; it is async,
  so the worker awaits it), else jsQR. Tests mock BarcodeDetector.

## Two resolutions
- Find on a ≤ 800 px copy (QR, squares, pose). Scale H by the downscale factor, then read cells, edge and the
  received mark on the full-resolution frame through the same H. Only the samples near the card are touched, so the
  cost scales with the card, not the frame.

## Worker and scheduling
- New request `{ kind: 'scanBitmap', bitmap, opts }`: drawn to one reused OffscreenCanvas, read, scanned, bitmap
  closed. The main thread only calls createImageBitmap(video) and posts it as a transferable.
- Camera: a loop that awaits each scan and then waits for the next video frame (requestVideoFrameCallback, else
  requestAnimationFrame, else a 0 ms timeout). The busy flag stays.

## Capture rule
- `streakNeeded(h, punchRatio)`: 2 when no cell is unsure and every finite ratio is ≥ 0.08 from the threshold, else 3
  (phones) / 2 (desktop, unchanged). The vote, captureBlocker and glare rules are untouched.

## Safety
- Accuracy tests keep calling the full (non-live) path, so they measure exactly what photo import does.
- A live read never captures with fewer checks than today: QR re-decode before capture is guaranteed by R4.2 and by
  requiring the decoded id to equal the tracked id on the capture frame.
