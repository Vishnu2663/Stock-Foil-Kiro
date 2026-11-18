# Requirements: payday-scan (Phase 7)
The Scan page, the live camera and the result views. The logic is covered by the pair-and-pay and vision-scanner
specs and their tests; this spec covers the screens.
Reference: docs/BUILD_BRIEF.md §4 Phase 7.
## R1 Two ways in
**User story:** As an employer, I want to scan both halves with the camera or from photos.
1. THE SYSTEM SHALL show "Open camera" and "Photos" on #/scan until both halves are read.
2. WHEN photos are chosen (several at once) or dropped THE SYSTEM SHALL read them automatically with scanImages at up
   to 1800px, and never upload them.
3. WHEN a half is found THE SYSTEM SHALL keep it, replacing any earlier half with the same role, and show chips for
   "Worker half (stock)" and "Employer half (foil)" with ✔ or ○.
4. WHEN a photo has a foreign QR, a damaged or edited code, or no card THE SYSTEM SHALL say which, per photo.
5. WHEN both halves are in THE SYSTEM SHALL close the camera and show the result.
6. THE SYSTEM SHALL offer "Start again" while at least one half is held.
## R2 Camera
**User story:** As a user, I want the phone to read each half by itself while I hold it still.
1. THE SYSTEM SHALL open the rear camera (facingMode environment, ideal 1920×1080), request continuous focus where
   supported, and show a 🔦 Torch button where the camera supports torch.
2. WHEN permission is denied or there is no camera THE SYSTEM SHALL say so and suggest choosing photos.
3. THE SYSTEM SHALL read frames continuously in the worker, downscaled to 960px, with QR escalation limited to level 1.
4. WHEN the tab is hidden THE SYSTEM SHALL pause the video and the reading, and resume when it is visible.
5. WHEN a half reads cleanly (at least 3 corner squares, no warnings, no unsure circle) on 2 frames in a row THE
   SYSTEM SHALL capture it automatically, and the camera SHALL stay open until both halves are in.
6. THE SYSTEM SHALL ignore a role that is already captured.
7. THE SYSTEM SHALL draw a live overlay on a canvas over the video, mapped through object-fit: contain: the card
   outline, the 4 corner squares (green found, amber missing) and every circle (green ring = hole, dashed amber =
   unsure, faint = not punched), with a soft pop-in over 260ms.
8. THE SYSTEM SHALL show a viewfinder (green when good, amber on a warning) and status text.
9. THE SYSTEM SHALL turn warnings into advice: show the whole half, move closer, more light, surface too close to the
   grey, place the card on a dark plain surface, hold still.
10. WHEN pictures-and-voice mode (settings.simple) is on THE SYSTEM SHALL speak prompts for: worker half, employer
    half, show the whole half, move closer, more light, hold still, surface too close to the grey, done; the same
    prompt SHALL NOT repeat within 6 seconds, and any prompt SHALL NOT follow another within 2.5 seconds.
11. WHEN the Camera closes THE SYSTEM SHALL stop every track.
## R3 Result
**User story:** As a worker or employer, I want one clear card that says what is owed and why.
1. THE SYSTEM SHALL show a payday card with month, worker, employer, a stamped verdict, and the total (count-up),
   labelled "To pay" or "Worker owes" when negative.
2. THE SYSTEM SHALL colour the verdict: genuine green; disputed or review amber; mismatch red; unreliable or
   inconclusive grey.
3. WHEN the verdict is genuine-consistent THE SYSTEM SHALL burst party pops over the whole card and tilt it gently
   without blur.
4. THE SYSTEM SHALL show the breakdown "days × wage − advances ± carried = total", with full days and half days
   separately on a half-day card, and the old and new rate when a wage change applies.
5. WHEN one-sided circles exist THE SYSTEM SHALL list them by day for each half, highlight them on both halves, and
   show the disputed amount and the worker and employer views; the disputed amount is not paid until both sides agree.
6. THE SYSTEM SHALL show each half as a Monday-first grid with one-sided circles highlighted and unsure circles
   dashed.
7. WHEN the user taps an unsure circle THE SYSTEM SHALL toggle its reading and mark it manual; tapping again SHALL
   step back to the scanned reading.
8. THE SYSTEM SHALL list the checks with ✔, ✖ or – and their details.
9. WHEN "Wage changed this month" is on THE SYSTEM SHALL ask for a from-day (2–31) and a new daily wage, apply them
   only when valid, and show a "Wage changed from day X" badge.
10. WHEN the pair was already paid THE SYSTEM SHALL say when, and warn when the amount now differs.
## R4 Reliability rules
1. WHEN either half has fewer than 3 corner squares THE SYSTEM SHALL show "Photo not reliable", show no total, and
   disable Mark as paid, Add to crew, Print slip, Listen and the ledger save.
2. WHEN the halves do not match THE SYSTEM SHALL say nothing is paid and disable the same actions.
3. WHEN a verdict is neither unreliable nor pair-mismatch THE SYSTEM SHALL save one receipt per distinct result, not
   a new one on every redraw.
## R5 Actions and slip
1. THE SYSTEM SHALL offer: 💰 Mark as paid, Add to crew, Print slip, Listen, 💬 Explain, Carry this balance to next
   month's card (only when net is negative and the result is reliable) and Scan another.
2. WHEN Mark as paid is pressed THE SYSTEM SHALL record a "paid" receipt for the agreed net.
3. WHEN Add to crew is pressed THE SYSTEM SHALL add or replace that card's crew line.
4. WHEN Listen is pressed THE SYSTEM SHALL read the days and total aloud in the card's language; WHEN pictures-and-
   voice mode is on it SHALL do so when the result appears.
5. WHEN Explain is pressed THE SYSTEM SHALL show an AI or offline explanation built from the pay facts.
6. WHEN Carry is pressed THE SYSTEM SHALL open a new card for next month with the net as the carried balance.
7. THE SYSTEM SHALL show a picture pay slip in the worker's language: suns for days (a half sun for a half day),
   advance coins, the notes to hand over as note pictures, the total, and any disputed days; it SHALL be printable.
## R6 Live camera capture (fix round, from the webcam recording)
1. THE SYSTEM SHALL scan a frame every 450 ms at up to 1600 px, one scan at a time, paused while the tab is hidden
   and for 1800 ms after a capture.
2. THE SYSTEM SHALL block capture ONLY when, checked in this order: the surface matches the grey discs; fewer than 4
   corner squares were found; a punch target is not in the photo (ratio not finite); under 2.5 px/mm; paper ≤ 0.15.
   'partial' (card filling the frame), a hidden cut edge, fingers, background warnings and unsure cells SHALL NOT block.
3. WHEN the same half reads without a blocker on 2 ticks in a row THE SYSTEM SHALL capture it, vibrate 60 ms and flash
   "✓ worker/employer half captured" for 1.6 s; WHEN the page has not marked it done after 7 s it MAY capture it again.
4. THE SYSTEM SHALL show the reason it is or is not capturing in a bar at the bottom of the video, always visible;
   WHEN Settings → Scanner debug is on it SHALL also show corner squares n/4 (and which were missed), the pose method,
   px/mm, paper, background/paper and the punched, blank and unsure counts. It SHALL NOT show names or card data.
5. WHEN no QR decodes but 3 or more corner-square blobs are in view THE SYSTEM SHALL say to move the card closer.
6. THE SYSTEM SHALL draw the frame outline, the 4 corner markers (green found, orange missed) and every target (green
   punched, grey blank, amber unsure) over the video, clear them when a scan finds no card, and otherwise fade them
   out between 2.2 and 3 s after the last scan. The frame border SHALL match the video's displayed size.
7. THE SYSTEM SHALL offer Capture now at all times, an Auto-capture checkbox and a Light (torch) button when supported.
8. THE SYSTEM SHALL open the camera once (fallbacks: rear 1920×1080 → rear → any), stop at once on NotAllowedError,
   and not restart the camera when the language changes.
9. WHEN the scan worker fails THE SYSTEM SHALL scan on the main thread after 30 ms; WHEN a frame cannot be read it SHALL
   say "Could not read that frame, trying again…".
10. THE SYSTEM SHALL pass the saved calibration (punchRatio, alignTolMm) to every scan and pair check.
