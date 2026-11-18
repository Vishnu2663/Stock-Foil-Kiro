# Requirements: card-core (Phase 2)
Pure logic with no DOM: seeded hashing and random numbers, card data and payload, the wavy cut, physical layout,
cryptographic pairing and the homography.
Reference: docs/BUILD_BRIEF.md §4 Phase 2, §6.2, §6.3, §6.4.
## R1 Card data and amounts
**User story:** As an employer, I want card values kept in safe ranges so a card can never carry a nonsense amount.
1. WHEN clampAmount receives any value THE SYSTEM SHALL return an integer from 0 to 200000 minor units (2,000 major).
2. WHEN clampAmount receives NaN or a non-number THE SYSTEM SHALL return 0, and WHEN it receives ±Infinity THE SYSTEM
   SHALL return 200000 or 0.
3. WHEN clampCarry receives any value THE SYSTEM SHALL return an integer from −10,000,000 to 10,000,000 minor units
   (±100,000 major), never −0, and 0 for NaN.
4. WHEN cleanName receives text THE SYSTEM SHALL replace "|", CR and LF with spaces, trim it and keep at most 18
   characters.
5. WHEN makeCard builds a spec THE SYSTEM SHALL default to rate 50000, advance 10000, INR, language "en" and carry 0,
   clamp the month to 1–12, upper-case the currency, and add a random pairing unless pairing is false.
6. THE SYSTEM SHALL generate card ids as 8 characters of the base32 alphabet 0123456789ABCDEFGHJKMNPQRSTVWXYZ.
7. THE SYSTEM SHALL format money from integer minor units only, and parseMajor SHALL turn a typed amount such as
   "500.5" into minor units without floating-point drift (invalid text gives NaN).
## R2 Card code and payload
**User story:** As a worker or employer, I want each half's QR to carry the whole card so either half can be checked.
1. THE SYSTEM SHALL compute the card code as toBase32(hash53(parts joined by "|", 0x5f0), 6) over
   [v, id, year, month, rate, advance, currency, worker, employer, lang], then "c"+carry when carry ≠ 0, "h2" when
   halves, "d3" when discs, and show it as XXX-XXX.
2. THE SYSTEM SHALL encode the payload as SF1|role|id|yyyymm|rate|adv|cur|lang|code|worker|employer, or SF2 with a
   carry field before the code when carry ≠ 0, with version flags p, h, d appended in that order.
3. WHEN a card is paired THE SYSTEM SHALL add this half's own secret and the tag after the code (sa for S, sf for F).
4. WHEN a card has no carry, no halves and no discs THE SYSTEM SHALL produce exactly the SF1 form.
5. WHEN decodePayload receives text THE SYSTEM SHALL accept only ^SF([12])(p?)(h?)(d?)$, role S or F, an 8-character
   base32 id, a valid yyyymm (month 1–12), amounts up to 200000, a 3-letter currency, a language tag and a 6-character
   code, and return null otherwise.
6. WHEN a payload decodes THE SYSTEM SHALL set codeOk to whether the recomputed code equals the embedded code.
7. THE SYSTEM SHALL allow "|" inside the employer name by treating all remaining fields as the employer.
## R3 The wavy cut
**User story:** As an employer, I want every card cut along its own line so two different cards never fit together.
1. THE SYSTEM SHALL derive each wave from the card id alone: seed hash53("wave:"+id) >>> 0, 4 components with
   f = 1.2 + r·6.5, phase = r·2π, a = 0.4 + r·0.6.
2. THE SYSTEM SHALL normalise the wave so its peak over x ∈ [−14, 200] in steps of 0.5mm is exactly 5mm.
3. WHEN w(x) is asked for any x THE SYSTEM SHALL return a value within ±5mm.
4. THE SYSTEM SHALL give the stock edge y = 120 + 12 + w(x) and the foil edge y = w(x) − 12, so the two edges fit.
5. THE SYSTEM SHALL return the same wave for the same id and a different wave for a different id.
## R4 Physical layout
**User story:** As a user printing at 100%, I want the card at true millimetres so every circle lands where the
scanner expects it.
1. THE SYSTEM SHALL use A4 210×297, margin 12, frames of 186×120, stock frame at (12,12), foil frame at (12,156),
   nominal cut at sheet y = 12 + 120 + 12 = 144.
2. THE SYSTEM SHALL place 7mm corner squares inset 3mm, the QR box at x 140, y 14, size 38, and the day grid at
   x 14, y 27 with 16×11 cells, 7 columns × 6 rows, Monday first.
3. THE SYSTEM SHALL put each punch centre at the cell centre plus 0.6mm in y, and with half-day circles at −4.1mm and
   +4.1mm in x.
4. THE SYSTEM SHALL place 10 advance cells at x = 14 + (i−1)×11.2, y 99, size 11.2×11.
5. THE SYSTEM SHALL use a hole radius of 3mm, a sampling radius of 1.6mm, and three paper reference points near the
   corners of each cell.
6. THE SYSTEM SHALL name circles d<date>, d<date>a, d<date>b (half days) and a<1..10>.
## R5 Pairing
**User story:** As a worker, I want proof that my half and my employer's half were issued together.
1. THE SYSTEM SHALL implement SHA-256 synchronously and match the NIST vectors and Node crypto.
2. THE SYSTEM SHALL compute tag = the first 12 base32 characters of SHA-256("SFPAIR1|id|sa|sf"), with secrets of 12
   base32 characters.
3. WHEN both halves are unpaired THE SYSTEM SHALL answer "legacy"; WHEN exactly one is paired THE SYSTEM SHALL answer
   "failed".
4. WHEN roles are not S then F, ids differ, a secret or tag is malformed, the tags differ, or the hash of the two
   secrets differs from the tag THE SYSTEM SHALL answer "failed"; otherwise "verified".
5. THE SYSTEM SHALL keep the other half's secret out of every payload: a decoded half never contains a pairing object.
## R6 Homography
**User story:** As the scanner, I need an exact mapping between frame millimetres and image pixels.
1. WHEN given 4 or more correspondences THE SYSTEM SHALL solve a least-squares homography (normalised DLT), with
   optional weights, and return null when there are fewer than 4 or the system is singular.
2. THE SYSTEM SHALL provide applyH, mulH, invertH and localScale (pixels per mm at a point).
3. WHEN a homography is solved from points that a known pose produced THE SYSTEM SHALL recover that pose, and invertH
   SHALL map points back to within 1e-6.
