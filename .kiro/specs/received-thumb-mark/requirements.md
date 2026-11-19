# Received thumb mark (payday only)
When the wage is handed over the worker presses an inked thumb in a printed RECEIVED box on BOTH halves, like the old
pay-register thumb impression. The app checks only that a mark is present and whether it looks like a thumb mark, a
signature or a smudge. It never identifies anyone and stores no fingerprint image by default.

## R1 Printed card
1. The right panel SHALL have ONE info box (x 134–178, y 55–69): "№ code", "rate/day · advance", "✓ Paired".
2. RECEIVED_BOX (x 134–172, y 72–106): double rule, plain inner area 2 mm in, label + thumb glyph, a dotted guide at
   ≥ 0.85 of paper brightness, a caption per half. ≥ 4 mm from the bottom-right corner square, the QR and all text.
3. New cards carry `receiptBox` (payload flag `r`, covered by the card code); old cards decode and say "not available".
## R2 Detector (vision/receipt.ts, pure, called from detect.ts)
1. Inner area warped at 4 px/mm, normalised to the paper band beside it; ink = min(R, G) < 0.6 × paper.
2. absent < 3%; present = one blob 8–70% and ≥ 10 × 12 mm; thumb = oval 0.55–0.95 with texture and coherent flow;
   signature = thin long strokes under 20%; smudge = solid without texture; unclear on glare (> 250 in > 15%), a finger or
   the box out of the photo, blur, or flooded ink (> 70%).
3. A heavy mark SHALL NOT change punch reads, corners, the QR or the cut edge.
## R3 Flow
1. Checks row: not yet / on both halves ✓ (kind) / only on one half / unclear.
2. Both halves already marked: red banner "looks like this month was already paid", an extra confirm, the ledger record.
3. "Mark as paid" opens steps: hand over (notes) → thumb on both halves (animation) → show both halves (receipt camera:
   HUD frames the box, 2 matching reads per half, another card refused). Saved as `{ receipt: { stock, foil, checkedAt } }`.
4. Fallbacks: a signature (recorded as signature) or pay without a mark with a reason (no ink pad / worker absent / other).
5. A re-scan after paying shows "Paid · received mark on both halves" without replaying the celebration.
## R4 Records and privacy
1. Slip "RECEIVED BY" with a drawn violet thumbprint; Ledger/History/Crew thumb icon; History filter "Paid without received mark";
   Listen sentence; Story/Guide/About sections and "thumb ink pad" in what you need.
2. Settings: keep a 96 px blurred, low-contrast picture of the box (OFF by default, device only, deletable, downloadable only when ticked).
