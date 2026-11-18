# Design: printable-card (Phase 3)
## Architecture
    src/render/sheet.ts      halfSvg, sheetSvg (A4 SVG), qrMatrix, qrGeometry, printModel (shared with the simulator)
    src/render/pdf.ts        makePdf(pages): one A4 page per JPEG
    src/core/members.ts      Member, normName, ownsCard, cardCounts, membersWithoutCard, bulkCreate (pure)
    src/ui/pages/Issue.tsx   New card page (form, live preview, Save / Print / PDF)
    src/ui/pages/Members.tsx Roster, month picker, bulk create
    Used from elsewhere: src/ui/imageIO.ts (printHTML, sheetsToPdf), src/store/index.ts (upsertCard, upsertCards,
    loadMembers, saveMembers), src/core/settlement.ts (carryForward).
## Data shapes
    interface Member { id; name; employer; rateMinor; advMinor; currency; lang; createdAt; halves?; discs? }
    interface CardCounts { all: number; month: number }
    interface BulkOptions { pairing?: boolean; carryFor?: (m) => number; idGen?: () => string }
    interface PdfPage { jpeg: Uint8Array; width: number; height: number }
    interface HalfOptions { payloadOverride?: string }   interface SheetOptions { stockPayload?; foilPayload? }
Colours: DISC_GREY #9d9d9d, circle stroke #b5a47e, cell stroke #d9ccaa, frame stroke #cdbb8f.
## Algorithms
- **sheetSvg**: stock half in a `<g translate(12 12)>`, the cut as `wavePath(makeWave(id), 144)` dashed, the foil half
  in `<g translate(12 156)>`. Each half is `halfSvg(spec, role)`.
- **halfSvg**: frame rect, fiducials, title, info lines, weekday labels, QR path (one `M h v h z` square per dark
  module, geometry from qrGeometry: module = 38 / (size + 2) mm), code and id under the QR, legends, then for each
  target a cell rectangle (once per cell), the date number and the circle (outline, or grey disc filled). Advance
  label and "= <value> each" follow. Text goes through esc().
- **printModel**: the same geometry as a luminance function `ink(x, y)` for the simulator: fiducials and dark QR
  modules 0.04, disc 0.54, circle ring 0.72, cell border 0.86, frame 0.8, paper 1. Targets are bucketed on an 8mm
  grid for speed.
- **makePdf**: objects 1 catalog, 2 pages, then page, content and image per page (3 + 3i). Byte offsets are recorded
  as each object is written, then the xref table, trailer and startxref are appended.
- **Issue page**: `makeCard` from the form with the page's id and pairing (kept stable while editing, so the
  preview and the printout match). Amounts go through parseMajor → clampAmount. Save calls upsertCard, which drops
  the card with the same id and the one named by revisedFrom.
- **ownsCard**: normName (cleanName, lower-case) equal for name and for employer.
- **bulkCreate**: membersWithoutCard(year, month), skip repeated name|employer keys, draw ids until unused (also
  against existing cards), then makeCard with the member's rate, advance, currency, language, halves, discs,
  pairing (default on) and carryFor(member).
## Correctness properties
1. Matching ignores case and never crosses employers. (tests/members.test.ts)
2. Bulk creation makes exactly one card per distinct missing member, with unique ids, the member's halves and discs
   and the carried balance. (tests/members.test.ts)
3. Re-running bulk creation adds nothing. (tests/members.test.ts)
4. Card counts add up: every member has at least one card in the month after bulk creation, and the month count
   never exceeds the all-time count. (tests/members.test.ts)
5. The PDF has the %PDF-1.4 header, /Count equal to the page count, ends with %%EOF, and startxref points at the
   xref table. (tests/roundtrip.test.ts, "pdf")
6. The SVG sheet is the one the scanner reads: rasterised, cut on its wave, punched and photographed, it scans back
   to the same punches and a genuine pair. (tests/roundtrip.test.ts, "print round-trip")
## Error handling
- Missing names: toast and no save. Invalid amount text: default restored with a message. Above 2,000: snapped back.
- Duplicate roster rows: one card. Ids that collide with existing cards are redrawn.
- A failure while building the bulk PDF clears the busy flag in `finally`; cards are already saved, so a retry
  makes no duplicates.
- Pre-fill storage is read once and removed; corrupt pre-fill falls back to the default form.
