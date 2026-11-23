# Design: demo-cards

## Code
- `src/render/demoCards.ts` (pure): the cards (makeCard + fixed pairing, like sim.ts demoCard), the four sets (punched
  keys, photo settings, seeds), `expectedFor(set)` computed from the truth by plain arithmetic (not by the app's pay
  code), `photographSet(set, ink)` (pairHoles + renderHalf: the same simulator as Demo and Test lab), and the
  punched-genuine page: `punchedPageSvg(spec, role, keys)` and `punchedPageBitmap(...)`, both built from one geometry
  (page origin, the card's wave, the hole circles).
- `src/render/jpeg.ts` (pure): a baseline JPEG encoder (YCbCr 4:4:4, the standard quantisation and Huffman tables of
  ITU T.81 Annex K, IJG quality scaling) and a decoder for baseline files. No dependency.
- `scripts/make-demo-cards.mjs`: starts Vite (already a dependency) to run the TypeScript above, and headless Chrome on
  the same Vite server to run the app's own `sheetBitmap` (sheet with its text, as ink for the photos) and
  `sheetsToPdf` (the New card → PDF path). Chrome path: CHROME env or the macOS default.
- `scripts/demo-shots.mjs`: uploads set 1 and set 2 in the built app (same approach as cdp-shots.mjs) and saves the
  result screens; it also checks the verdict shown, so the browser's own JPEG decoder is covered.

## Why the punched page is two pages
A single printed sheet has paper beyond each cut, so the scanner (correctly) cannot see the cut edge and warns
"place the halves apart on a dark surface". Each half is therefore drawn on its own page, cut along its wave, on a
dark background, with the punched circles as dark discs: to the scanner that is a cut half on a dark table.

## Verification
- tests/demoCards.test.ts reads the committed files only (no Chrome): decode → scanImage → verifyPair → compare with
  expected.json, and the punched pages from `punchedPageBitmap` (same geometry as the PDF, without its text).
- tests/jpeg.test.ts: the codec round-trips within JPEG error, the Huffman tables are complete.
