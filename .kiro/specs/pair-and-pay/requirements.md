# Requirements: pair-and-pay (Phase 6)
Comparing the two halves, verifying that they belong together, working out the pay in three views and breaking it
into cash notes.
Reference: docs/BUILD_BRIEF.md §4 Phase 6, §6.6.
## R1 Comparing the halves
**User story:** As a worker or employer, I want every day compared on both halves so a changed hole is seen.
1. THE SYSTEM SHALL classify each circle as both, none, stockOnly or foilOnly.
2. THE SYSTEM SHALL define agreed as the circles on both halves (the intersection) and one-sided as the circles on
   exactly one half (the symmetric difference).
3. THE SYSTEM SHALL call the comparison consistent when there are no one-sided circles.
4. THE SYSTEM SHALL carry each circle's unsure and manual flags, and count the unsure circles.
5. THE SYSTEM SHALL never include a one-sided circle in the agreed pay.
## R2 Pay
**User story:** As a worker, I want the pay shown the same way I would work it out by hand.
1. THE SYSTEM SHALL compute gross = round(days × rate), advances = advance count × advance value, and
   net = gross − advances + carry; net MAY be negative (carried forward).
2. WHEN the card has half-day circles THE SYSTEM SHALL weigh every circle 0.5, so two circles on a date are 1 day and
   one circle is ½ day.
3. WHEN a wage change {fromDay, rateMinor} is set THE SYSTEM SHALL compute gross = round(daysBefore × rate +
   daysAfter × newRate), with days on or after fromDay at the new rate.
4. THE SYSTEM SHALL compute pay in three views: agreed, worker (agreed + stock-only) and employer (agreed +
   foil-only), and disputed = |worker net − employer net|.
5. THE SYSTEM SHALL return full days, half days, the day list and the units before and after a wage change.
6. THE SYSTEM SHALL list the dates that have a one-sided circle, for each half.
7. THE SYSTEM SHALL use integer minor units for all money.
## R3 Checks and verdict
**User story:** As an employer, I want a clear reason when a pair is not accepted.
1. THE SYSTEM SHALL return these checks in this order, each with a label, ok (true, false or null for unknown) and a
   detail: (1) worker half found, (2) employer half found, (3) same card id, (4) card code matches on both halves and
   equals the recomputed code, (5) pairing code, (6) wavy cut lines fit, (7) every punch is on both halves,
   (8) holes punched together, (9) photos sharp and complete enough.
2. THE SYSTEM SHALL set pairOk = roles right AND same id AND codes OK AND pairing not failed AND (pairing verified OR
   edge not a mismatch).
3. THE SYSTEM SHALL set the verdict to the first that applies: !poseOk && pairOk → unreliable; !pairOk →
   pair-mismatch; not consistent → genuine-disputed; any alignment flag → review; edge inconclusive and pairing
   legacy → inconclusive; otherwise genuine-consistent.
4. WHEN any circle is unsure THE SYSTEM SHALL also give the verdict "review" (the brief is silent here), so a pair is
   never genuine-consistent while something is unsure.
5. WHEN any circle is unsure THE SYSTEM SHALL show check 7 as failed if there are one-sided circles and as
   unknown (null) otherwise; with no unsure circles it SHALL be true when consistent.
6. THE SYSTEM SHALL set poseOk when both halves are present and the smaller fiducialsFound is at least 3.
7. THE SYSTEM SHALL provide pickHalves to choose the worker half and the employer half with the same id from many
   scans, and verdictTone and VERDICT_LABEL for display.
## R4 Cut match
1. THE SYSTEM SHALL compare only the points where both edges are finite: coverage = n / total, d = stock − foil,
   rms = standard deviation of d, c = correlation of the two edges.
2. WHEN coverage ≥ 0.4 THE SYSTEM SHALL answer match when rms ≤ 1.3 and c ≥ 0.8, mismatch when rms > 1.5 or c < 0.75,
   and inconclusive otherwise; with coverage < 0.4 or fewer than 3 points it SHALL answer inconclusive.
3. THE SYSTEM SHALL compute score = clamp((c − 0.3)/0.65) × clamp((2.5 − rms)/2) × 100.
4. WHEN pairing is verified THE SYSTEM SHALL treat the cut as extra evidence: a mismatch gives ok = null and never a
   rejection; on a paired disc card a non-match is shown as optional.
## R5 Holes punched together
1. THE SYSTEM SHALL pair the hole centres of the two halves; WHEN fewer than 4 holes are shared THE SYSTEM SHALL not
   check and make no judgement.
2. THE SYSTEM SHALL skip holes that are clipped or unsure on either half.
3. THE SYSTEM SHALL fit a rigid 2D transform (rotation + shift, least squares) leaving each hole out, and flag the
   hole when its residual is greater than 1.2mm (or the calibrated tolerance).
4. THE SYSTEM SHALL never flag holes punched together, even with a stacking error of 1.2mm and 0.5°.
5. THE SYSTEM SHALL flag a hole punched separately (about 2.5mm away) when at least 4 holes are shared.
## R6 Cash
**User story:** As an employer, I want to know which notes to hand over.
1. THE SYSTEM SHALL break an amount greedily over the note values for the currency: INR 500/200/100/50/20/10/5/2/1;
   USD 100/50/20/10/5/1; EUR 200/100/50/20/10/5/2/1; GBP 50/20/10/5/2/1; KES 1000/500/200/100/50/20/10/5/1;
   NGN 1000/500/200/100/50/20/10/5; BDT 1000/500/200/100/50/20/10/5/2/1; PKR 5000/1000/500/100/50/20/10/5/2/1;
   NPR 1000/500/100/50/20/10/5/2/1; PHP 1000/500/200/100/50/20/10/5/1; IDR 100000/50000/20000/10000/5000/2000/1000/
   500/200/100; MXN 1000/500/200/100/50/20/10/5/2/1; BRL 200/100/50/20/10/5/2/1; ZAR 200/100/50/20/10/5/2/1;
   any other currency 100/50/20/10/5/1.
2. THE SYSTEM SHALL make notes plus the remainder equal the amount exactly; an amount of zero or less gives no notes.
3. WHEN combining a crew THE SYSTEM SHALL add the notes and remainders of each person, so the total is exact.
