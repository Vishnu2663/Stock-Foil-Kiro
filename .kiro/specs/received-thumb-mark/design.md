# Design
- layout.ts: INFO_BOX, RECEIVED_BOX, RECEIPT_AREA, THUMB_GUIDE. sheet.ts: infoBoxSvg, receivedBoxSvg, PANEL_TEXT (6 languages),
  fitText (textLength squeeze when the estimate is wider), fitLines (two caption lines).
- vision/receipt.ts: readReceipt(minRG, H) → { status, kind, coverage, centre, quality, why, m }. Blob grouping by a 0.5 mm
  dilation; texture = band-pass (≈0.5–2 mm) energy over the blob's interior / mark contrast; coherence = structure tensor.
  At 3–4 px/mm with 1.5 px blur real 0.4–0.7 mm ridges are below what the photo resolves, so texture is measured at the
  finest band the photo keeps. It is not fingerprint recognition.
- Open item: the thumb / smudge / signature rules (texture, coherence, oval, stroke width) have been checked ONLY against
  simulated marks drawn by tests/receiptSim.ts. They still need a test with real photos of inked thumbs (violet, blue
  and black pads) on printed cards before field use.
- core/received.ts: markState, markText, alreadyMarked, receiptStep (2 matching reads, wrong card), paidMark, paidWithMark.
- history.ts: `receipt` / `noMark` on payment records, hashed only when present (old chains verify).
- UI: PaySteps.tsx (sheet), Camera mode 'receipt', ThumbChip.tsx, PaySlip RECEIVED BY, Settings privacy.
