# Design: payday-scan (Phase 7)
## Architecture
    src/ui/pages/Scan.tsx          page state, photo reading, verifyPair, actions, ledger save
    src/ui/components/Camera.tsx   getUserMedia, worker loop, auto-capture, overlay, voice prompts
    src/ui/components/Result.tsx   PaydayCard, PayBreakdown, HalfView, ChecksList, Slip, Sun, Coin, NotePic,
                                   spokenResult, daysText, warningText
    Depends on: src/ui/scanAsync.ts, src/ui/imageIO.ts (fileToImage, videoFrame, printHTML), src/vision/pair.ts,
    src/core/{wages,cash,settlement,history}.ts, src/store/index.ts, src/ai/{index,speech}.ts, src/i18n/index.ts,
    src/ui/fx.ts (partyPops).
No new core logic. The pure parts (verifyPair, payFor, cashBreakdown) are tested in pair-and-pay and vision-scanner.
## State (Scan.tsx)
    halves: HalfScan[]            one per role (addHalf replaces the same role)
    overrides: { S, F: Record<key, boolean> }   manual corrections
    wageChange, fromDay, newWage → rateChange?: { fromDay (2–31), rateMinor }
    camera, busy, over (drag), explainText, savedKey, ledgerVersion
Derived with useMemo: {stock, foil} = pickHalves(halves); result = verifyPair(stock, foil, {tolerance from
settings.calibration, overrides, rateChange}); canSave = result and verdict not unreliable or pair-mismatch;
paid = paidInfo(ledger, spec.id, net).
## Flows
- **Photos**: readFiles filters image types, fileToImage(f, 1800), scanImages in the worker, then addHalf for each
  half and a toast per photo for foreign, invalid or empty results.
- **Camera loop**: every 60ms (300ms when hidden or not ready) take videoFrame(v, 960), scanImages with
  maxQrLevel 1, store live halves for the overlay, and for each half whose role is not yet captured count clean
  reads in a streak map keyed by role + id. Clean = fiducialsFound ≥ 3, no warnings, no unsure circle. Streak 2 →
  onHalf(h). Any unclean read resets the streak and picks the first matching advice in order: partial, far,
  dark-photo or low-contrast, ambiguous-surface, dark-surface, otherwise "Hold still".
- **Voice**: say(key) is silent unless settings.simple; it blocks the same key for 6s and any key for 2.5s.
- **Overlay**: a requestAnimationFrame loop sizes the canvas by devicePixelRatio (max 2), computes the contain scale
  s = min(cw/vw, ch/vh) and offsets, and maps frame mm → image px (pose.H) → screen. Radius = 3mm projected, scaled
  by 0.6 + 0.4·min(1, age/260ms).
- **Manual correction**: toggle(role)(key) cycles: no override → flip the scanned reading → back to the scanned
  reading → remove the override.
- **Ledger**: saveScan builds a receipt (receiptOf) and adds it once per distinct JSON key (time excluded). Mark as
  paid saves, then adds a 'paid' receipt.
- **Carry on**: month + 1 (December rolls to January of the next year) with carryMinor = agreed net.
- **PaydayCard**: tone from verdictTone; stamp label from VERDICT_LABEL; total hidden ("—") when unreliable and the
  whole total hidden on pair-mismatch; partyPops on genuine-consistent; data-tilt="3" only then.
- **Slip**: slipDict(lang) strings, suns (full and half), coins, cashBreakdown notes as NotePic with counts, remainder,
  disputed days or "no dispute". It is data-notranslate and printed through printHTML.
## Properties and where they are tested
The screens have no properties of their own. Their rules are checked through:
1. Verdict and reliability rules (R4): tests/pair.test.ts (verdicts, unreliable via fiducials).
2. Pay and cash shown on the card and slip: tests/pair.test.ts, tests/cash.test.ts.
3. Clean-read rule and warnings used by the camera: tests/scanner.test.ts.
4. Ledger save, paid info and carry: tests/ledger.test.ts.
5. Screens are checked by screenshots at 1280px and 375px (docs/screenshots/scan-*.png).
## Error handling
- getUserMedia failure: "Camera permission was denied" or "No camera is available", with the choose-photos path left
  open. Torch and focus constraint errors are ignored.
- Cancelled camera start (unmount before the stream arrives) stops the tracks.
- A frame that fails to scan is skipped and the loop continues.
- A photo that fails to read shows "Could not read the photo: …"; busy is cleared in `finally`.
- Explain falls back to the offline text when the AI is off or fails (src/ai/index.ts).
- Speech and storage errors never block the result.

## Fix round: live capture (R6)
- `src/vision/capture.ts`: `captureBlocker(h)` is the pure capture rule (R6.2), `readingSummary` and `debugLine`
  feed the hints and the debug line. Tested directly in tests/cameraScan.test.ts.
- `src/ui/components/Camera.tsx`: `CAMERA` holds the timing (tick 450, frame 1600, streak 2, cooldown 1800, flash 1600,
  retry 7000, hold 2200, fade 800). The app context is read through a ref, so the stream effect has no dependencies.
  The displayed video rect (object-fit: contain) is measured and the viewfinder, flash and status bar are placed in it.
- `src/ui/scanAsync.ts`: `scanImages` falls back to `scanHere` (main thread, after 30 ms) on any worker failure.
- Scanner changes are in .kiro/specs/vision-scanner (pose, punches, edge) and pair-and-pay (edge match, alignment).
