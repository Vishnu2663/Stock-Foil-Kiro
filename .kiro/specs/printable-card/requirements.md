# Requirements: printable-card (Phase 3)
The A4 sheet at true millimetres, the PDF writer, the New card page and the Members page.
Reference: docs/BUILD_BRIEF.md §4 Phase 3, §6.3.
## R1 The printable sheet
**User story:** As an employer, I want one A4 page I can print, cut along the wavy line and use as two matching halves.
1. THE SYSTEM SHALL render the sheet as SVG 210mm × 297mm with viewBox 0 0 210 297 (true millimetres), a white
   background, the stock half first, then the wavy cut line with "✂" and "cut here", then the foil half.
2. THE SYSTEM SHALL title the halves "STOCK · worker keeps" and "FOIL · employer keeps".
3. WHEN a half is drawn THE SYSTEM SHALL show the worker, employer, month, wage, advance token value and the card
   code, and WHEN carry ≠ 0 THE SYSTEM SHALL also show "Carried: <amount>".
4. THE SYSTEM SHALL draw the 4 corner squares (7mm, inset 3mm) in black.
5. THE SYSTEM SHALL draw a QR with error correction M that holds that half's own payload, 38mm at x 140, y 14.
6. THE SYSTEM SHALL draw a Monday-first calendar of circles numbered by date, and 10 advance circles labelled "Advance".
7. WHEN halves is on THE SYSTEM SHALL draw two circles per date and the legend "both = full day · one = half day".
8. WHEN discs is on THE SYSTEM SHALL fill every circle with grey #9d9d9d and add "punch through the grey disc".
9. THE SYSTEM SHALL draw the cut line from the card's own wave, so the cut is unique to the card id.
10. THE SYSTEM SHALL escape all user text in the SVG.
## R2 Print and PDF
**User story:** As an employer, I want to print at actual size or save a PDF.
1. WHEN the user prints THE SYSTEM SHALL print the sheet at 100% with the app chrome hidden by print CSS.
2. WHEN the user chooses Download PDF THE SYSTEM SHALL embed the rendered sheet in a PDF written by a small
   hand-written writer: one A4 page (595.28 × 841.89 pt) per JPEG image.
3. THE SYSTEM SHALL write a valid PDF skeleton: header, catalog, page tree with the right /Count, one image per
   page, a cross-reference table and a trailer whose startxref points at "xref".
## R3 New card page
**User story:** As an employer, I want to fill in a few fields and see the sheet before I save it.
1. THE SYSTEM SHALL offer worker, employer, a custom month picker, daily wage, advance token value, currency and
   worker language.
2. THE SYSTEM SHALL offer switches for Pairing code (on by default), Half-day circles, Printed grey discs and
   Carried balance.
3. WHEN any field changes THE SYSTEM SHALL redraw the live sheet preview.
4. WHEN a wage or advance is above 2,000 THE SYSTEM SHALL snap it back to 2,000 and show a message, and WHEN it is
   not a valid amount THE SYSTEM SHALL restore the default and say so.
5. WHEN the previous month ended with a negative balance for the same worker and employer THE SYSTEM SHALL offer to
   carry it onto this card.
6. WHEN the user chooses Save, Print or Download PDF without a worker and employer name THE SYSTEM SHALL ask for the
   names and save nothing.
7. WHEN the user saves THE SYSTEM SHALL store the card, and Print and PDF SHALL save first.
8. WHEN a saved card is edited THE SYSTEM SHALL create a revised card with a new id, cut and pairing, set
   revisedFrom, and replace the old card.
9. WHEN the page opens with a pre-fill THE SYSTEM SHALL use it once and clear it.
## R4 Members page
**User story:** As an employer with a crew, I want a roster and one click to make every card for the month.
1. THE SYSTEM SHALL let the user add, edit and remove members with name, employer, wage, advance, currency, language,
   half-day and disc options; a new wage applies to future cards only.
2. WHEN a name or employer is missing THE SYSTEM SHALL ask for it; amounts above 2,000 SHALL snap back with a message.
3. THE SYSTEM SHALL show each member's card count for all time and for the chosen month.
4. WHEN "New card" is pressed on a member THE SYSTEM SHALL open the New card page pre-filled from that member.
5. WHEN a member name and employer match a card ignoring case THE SYSTEM SHALL count that card as theirs, and SHALL
   never match across employers.
6. WHEN "Create N cards + one PDF" is pressed THE SYSTEM SHALL make exactly one new card for each member without a
   card that month, with a unique id, the member's halves and discs options and their carried balance, save them,
   and download one PDF with one page per card.
7. WHEN two roster rows are the same person THE SYSTEM SHALL make only one card for them.
8. WHEN every member already has a card THE SYSTEM SHALL create nothing, and running it again SHALL add no duplicates.
9. WHEN removing a member THE SYSTEM SHALL ask first and keep their cards and receipts.
## Retro time-card style (user request)
1. THE SYSTEM SHALL print each half as a retro time card from the card's own data: role word with "who keeps it",
   a red month stamp, worker/employer names or write-in blanks, weekday header (weekend in red), weekend cells tinted,
   date numbers top-left, dashed rings (and grey discs on disc cards), a dashed divider on half-day cards, advance tokens
   as ticket stubs, a right panel with the card code, the daily wage and advance token, and "✓ Paired card" when paired.
2. The scanned geometry (frame, corner squares, QR box, cells, circles, advance row) SHALL NOT move, and printed text
   SHALL keep at least 4 mm of clear paper from every corner square.
3. Month and weekday names SHALL come from Intl in the card's language. New cards default to half-day circles and
   printed grey discs.
