# Requirements: wage history and the pay slip

## R1 Member wage history
1. A member SHALL keep a wage history `wages[]` ({fromYear, fromMonth, fromDay, rateMinor, advMinor}), oldest first;
   rateMinor/advMinor on the member stay as the CURRENT values for older code.
2. Members saved before this existed SHALL load with one entry dated createdAt holding their wage; nothing is lost.
3. WHEN a member's wage is edited THE SYSTEM SHALL ask "From which date?" (default today) and APPEND an entry
   (an entry on the same date is replaced; history is never overwritten), and show the history as chips.
4. A card issued for a member SHALL record memberId (local only). A scanned card's member is found by that id,
   then by worker + employer name (ignoring case).

## R2 The pay schedule
1. wageScheduleFor(spec, history, source) SHALL return day ranges with rates for the card's month:
   'card' = the printed rate all month; 'current' = the rate in force on the 1st, then every change dated in the
   month (any number); 'custom' = given ranges. Changes after the month are ignored. The advance value is the card's
   (card), the latest entry on or before the month's end (current), or the custom one.
2. payFor SHALL compute gross = round(Σ rate(day) × halfUnits(day) / 2) in integer minor units, with per-range lines
   that sum to gross; net = gross − advances × advance value + carry. The single-change API is a wrapper.
3. The result SHALL offer a source switch (Card wage, Current wage only when it differs, Custom with from-day and
   wage), pre-select Current when the history has a change inside the card's month and show "{name}'s wage changed to
   {rate} from {date}: applied to days {a}–{b}". It SHALL always show which source is used and mark "wage adjusted"
   in the checks, the receipt and the ledger when it is not the card wage.
4. Tapping a rate or the advance value in the formula SHALL open a popover to change it (custom; clamped, ≥ 0).
5. One view model SHALL drive the amount, the formula split by range, the notes, the slip, Listen/Explain, the receipt,
   the ledger and the crew line. Changes animate: the odometer rolls (whole units), changed numbers flash amber, the
   notes re-deal.
6. Next month's card SHALL use the member's current wage.

## R3 Cash
1. Notes SHALL always come from the current net; a remainder shows as a coin chip; net ≤ 0 shows "Worker owes" and
   no notes. Settings → Notes I have lists denominations the payer lacks; smaller notes are used and the result says so.
2. Σ notes + remainder SHALL equal the net for every currency and every subset.

## R4 Banknotes
1. Notes SHALL be drawn as stylised SVG (paper grain, wave border, typewriter value, currency seal, serial line, a tint
   per value; no real artwork, emblems or portraits), stacked per value (≤ 10 layers + ×N badge), dealt from a cash
   box (70 ms stagger, ±6°), removed ones flying out; hover or tap fans a stack and shows "3 × ₹500 = ₹1,500"; a
   check sum "₹1,500 + ₹400 = ₹1,900" is shown.

## R5 Pay slip (wage packet)
1. The slip SHALL be a sepia receipt with perforated edges: header "PAY SLIP · MON YYYY", card number and decorative
   bars; PAY TO (worker) and FROM (employer) with avatars; a mini month with worked days punched and the day count;
   lines with dotted leaders per wage range, advances and carry; TO PAY under a double rule; amount in words (English,
   Indian grouping for INR; other languages show digits); the notes; a status stamp, "WAGE ADJUSTED" when it applies, a
   PAID stamp that slams when marked paid; "Received by …" / "Paid by …" signature lines and "Paid on".
2. The panel SHALL NOT repeat the slip title or show a second total.
3. Print slip SHALL print only the slip on A5, black and white, no animation, every line visible.
4. With reduced motion the slip and notes SHALL render in their final state.

## R6 Who is who
1. A Party component SHALL show the worker as a round ID badge (hard-hat) labelled WORKER and the employer as a
   square company seal (briefcase) labelled EMPLOYER, coloured from a stable name hash, with aria "Worker: X" /
   "Employer: Y", on the result (payment flow employer → amount → worker, reversed and amber when the worker owes),
   tally, slip, camera pill, Members, Crew, Ledger, History and the New card form.
