# Design: pair-and-pay (Phase 6)
## Architecture
    src/core/wages.ts    compareSets, payFor, threeViews, disputedDays          (pure, no scanner types)
    src/vision/pair.ts   edgeMatch, fitRigid, alignment, holesFromScans, verifyPair, pickHalves,
                         VERDICT_LABEL, verdictTone
    src/core/cash.ts     NOTES, notesFor, cashBreakdown, breakdownTotal, combineCash
    uses src/core/pairing.ts (verifyPairing), src/core/layout.ts (targetsFor), src/vision/detect.ts (punchSets, HalfScan),
    src/core/history.ts (Verdict type)
## Data shapes
    Comparison { cells: CellCompare[], consistent, unsureCount, agreed:Set, stockOnly:Set, foilOnly:Set }
    CellCompare { key, kind, n, half, state: 'both'|'none'|'stockOnly'|'foilOnly', unsure, manual }
    PayTerms { rateMinor, advMinor, carryMinor, halves?, rateChange?: {fromDay, rateMinor} }
    PayView { halfUnits, days, fullDays, halfDays, dayList, unitsBefore, unitsAfter, gross, advCount, advances, carry, net }
    ThreeViews { agreed, worker, employer, disputed }
    EdgeMatch { status, coverage, rms, c, score, n }
    Alignment { checked, shared, flagged[], residuals{}, tolerance }
    Check { id, label, ok: boolean|null, detail }
    PairResult { verdict, checks, pairing, edge, align, comparison, pay, spec, poseOk, pairOk, minFiducials }
    CashBreakdown { amountMinor, notes: {value, count}[], remainderMinor }   // value in major units
## Algorithms
- **payFor**: parse each key `^([da])(\d+)([ab]?)$`. Advances are counted. For a day circle the units are 2 on a
  full-day card (a/b suffixes ignored), or 1 per circle on a half-day card; units per date are capped at 2. A date
  with 2 units is a full day, with 1 a half day. With a wage change, dates ≥ fromDay add to unitsAfter.
  gross = round((unitsBefore·rate + unitsAfter·newRate) / 2), which stays in integers until the one rounding.
  net = gross − advCount·adv + carry.
- **threeViews**: agreed = payFor(agreed); worker = agreed ∪ stockOnly; employer = agreed ∪ foilOnly.
- **edgeMatch**: statistics as in R4; thresholds 0.4 coverage, 1.3/0.8 match, 1.5/0.75 mismatch.
- **fitRigid**: centroid-centred angle a = atan2(Σ(ax·by − ay·bx), Σ(ax·bx + ay·by)), then the shift.
- **alignment**: for each hole i, fit f → s on the other holes, map hole i's foil point, residual = distance to its
  stock point; flagged when > tolerance (default 1.2). Fewer than 4 holes: checked = false.
- **holesFromScans**: hole centre in frame mm = target centre + (dx, dy); only cells with a hole on both halves, not
  clipped, not unsure.
- **verifyPair**: build the checks in order; pairing = verifyPairing; edge match when both halves exist; pairOk;
  when both halves share an id build the comparison from punchSets (with overrides), pay with the card's terms and the
  optional wage change, and the alignment (tolerance from calibration); poseOk from the smaller fiducialsFound.
  Verdict: unreliable → pair-mismatch → genuine-disputed → review (alignment flag **or any unsure circle**) →
  inconclusive (edge inconclusive and legacy) → genuine-consistent.
- **cashBreakdown**: greedy over notesFor(currency) in minor units (value × 100); remainder is what no note fits.
  combineCash sums counts per value and remainders.
## Design choice the brief does not state
The brief's verdict list has no case for "unsure". Unsure circles are guesses, and a guessed circle is not evidence.
So `unsureCount > 0` gives "review", never "genuine-consistent". Manual corrections remove the unsure flag
(punchSets), so a user can resolve the review by tapping the circles.
## Correctness properties
1. agreed = intersection and one-sided = symmetric difference; an extra or missing hole on one half is always
   detected and never paid. (tests/pair.test.ts, "comparison")
2. Net pay is exact in every view (half days, carry and wage change included); with no change it equals days × rate.
   (tests/pair.test.ts, "pay")
3. Holes punched together are never flagged, even with a 1.2mm / 0.5° stacking error; a separately made hole never
   passes; fewer than 4 shared holes means no judgement. (tests/pair.test.ts, "alignment")
4. On simulated photos: a paired card verifies; a different cut does not matter when pairing is verified; a half
   with the right id, code and cut but the wrong secret is rejected; legacy cards rely on the cut; an extra hole is
   shown and never paid and a separately punched hole is flagged for review. (tests/pair.test.ts, "simulated photos")
5. Half-day cards: two circles = 1 day, one = ½ day, a one-sided circle is disputed. (tests/pair.test.ts, "pay")
6. Cash notes plus the remainder equal the amount; combined crew cash is exact; the denominations match §6.6.
   (tests/cash.test.ts)
## Error handling
- A missing half gives null checks and verdict "pair-mismatch" (pairOk is false), never an exception.
- Unknown currency falls back to 100/50/20/10/5/1.
- Negative or zero amounts give no notes; the remainder keeps the value.
- Keys that do not match the key pattern are ignored by payFor.
- Fewer than 3 points for the edge, or no finite points, give "inconclusive".
