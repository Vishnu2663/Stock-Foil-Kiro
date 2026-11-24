# Stock & Foil: the tally sticks that burned Parliament, back from the dead

**Category:** Resurrection (Kiroween 2026)
**Live app:** https://vishnu2663.github.io/Stock-Foil-Kiro/
**Source:** https://github.com/Vishnu2663/Stock-Foil-Kiro (MIT)
**How Kiro was used:** [docs/HOW_KIRO_WAS_USED.md](HOW_KIRO_WAS_USED.md)

## What is resurrected, and why
For about 700 years England's Exchequer kept its accounts on split tally sticks. A hazel stick was notched for the
amount and split lengthwise: the creditor kept the *stock*, the debtor the *foil*. Nobody could fake a match, because
the two halves only fit along their own grain. In October 1834 the obsolete sticks were burned in the furnaces under
the House of Lords. The chimney flues caught fire and most of the Palace of Westminster burned down.

The split tally solved a problem that is still open today: two people who don't trust each other need one record that
neither can change alone. Millions of daily-wage workers (construction, farms, domestic work, small workshops) are paid
in cash with no record at all. Days get "forgotten", advances get counted twice, and the worker's word is set against
the employer's. Many of these workers have no smartphone and some cannot read.

Stock & Foil brings the split stick back as a sheet of paper.

## How it works
1. **Print and cut.** Each A4 card has two halves separated by a wavy cut that is unique to the card. Each half has four
   corner squares, a QR code, a calendar of punch circles, a row of advance tokens and a RECEIVED box.
2. **Punch both, every day.** The two halves are stacked and the day's circle is punched through both at once with an
   ordinary office punch. The worker keeps the stock, the employer keeps the foil.
3. **Scan on payday.** Any phone reads both halves. It checks the pair (same card, card code, a SHA-256 pairing tag
   over both halves' secrets, the wavy cut fit, holes punched together), compares every hole, and pays only the days
   that are on both halves: `days × wage − advances ± carried = total`. A day punched on one half only is shown and
   never paid until both sides agree.
4. **Hand over and confirm.** The app shows which notes to hand over, reads the result aloud in the worker's language,
   and the worker presses an inked thumb in the RECEIVED box on both halves, like the old pay-register thumb
   impression. The app checks that the mark is there (it never identifies anyone) and saves the payment in a
   hash-chained ledger.

The worker needs no phone and does not need to read. The app is free, works offline after the first visit, has no
server and no account, and keeps everything on the device.

## Users
- Daily-wage workers, who keep the stock as their proof.
- Small employers and contractors, who keep the foil and pay from it.
- NGO and union volunteers, who can verify a disputed pair with any phone.

## What is in the app
- **New card:** live A4 preview, print at 100%, PDF, half-day circles, grey discs for any table, carried balance.
- **Members:** a roster with wage history (raises dated and appended, never overwritten), cards in bulk.
- **Payday scan:** rear camera with a live overlay and automatic capture (blur and motion checks, a 3-in-a-row streak and
  a 4-of-5 vote on phones), or photos and drag and drop. The scanner runs in a Web Worker.
- **Result:** stamped verdict, the employer → worker payment flow, the wage source (card, current or custom) with the
  formula split by date range, banknote stacks, a printable wage-packet slip with the amount in words.
- **Check the cut:** both halves on a dark table with a small gap; the app traces both wavy edges and fits them.
- **Received mark:** step-by-step payment, a camera mode for the RECEIVED box, an already-paid warning when both halves
  already carry a mark.
- **Records:** hash-chained ledger, History (paid, yet to pay, paid without a mark), crew payroll, an income-proof
  certificate.
- **Story, Demo, Test lab, Calibrate, Punch guide.** Six UI languages (English, Hindi, Bengali, Tamil, Spanish,
  Swahili), a pictures-and-voice mode and optional AI explanations (on-device, or the user's own key, anonymous numbers
  only).

## How it was built
Built in Kiro IDE from an empty folder: a written brief, steering files, 14 specs, five agent hooks, two custom agents
and parallel sub-agents. The scanner is tested against a photo simulator: the real printed sheet is rendered,
photographed with tilt, blur, JPEG compression, glare, dim light and fingers, and scanned back. The suite has 161 tests
in 40 files (fast-check property tests). Accuracy runs (`npm run test:accuracy`, 200 runs each):
- phone frames with a punch read wrong and not flagged: 15 of 200 before the glare rule, 0 of 200 after;
- "Check the cut": 200 of 200 real pairs fit, 0 of 62 forged foils fit;
- received mark: 81 of 82 thumbs read as thumbs, 0 empty boxes read as marked, glare and fingers always "unclear".

The paper card, punch reading and received mark have also been tried on real printed paper.

## Honest limits
- One person holding both halves can punch both. The protocol assumes each side keeps their own half; a witness
  (union, NGO) settles disputes.
- Pairing proves the two halves were issued together. The issuer could reprint either half, and anyone can copy their
  own half's QR.
- Scanner thresholds were set on simulated photos and checked on real paper; they need wider field testing with more
  phones, papers and punches (Calibrate exists for this, see FIELD_TEST.md).
- The thumb mark check looks only at the shape and texture of the ink. It is not fingerprint recognition. Its thumb /
  smudge / signature rules were tuned on simulated marks.
- Translations were drafted with AI and need native-speaker review.

## Disclosure 
An earlier prototype was built after the start of the Submission Period for testing, in a separate repository. 
This repository is a ground-up rebuild made with Kiro; no code was copied from the prototype. 


## Third-party licences
Stock & Foil is MIT licensed. Runtime libraries: [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0),
[qrcode](https://github.com/soldair/node-qrcode) (MIT), React (MIT). Development: Vite, Vitest, fast-check, TypeScript
(MIT / Apache-2.0).
