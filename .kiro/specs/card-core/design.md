# Design: card-core (Phase 2)
## Architecture
All files are pure TypeScript with no DOM, so they run in Node tests, the browser and the Web Worker.

    src/core/prng.ts        hash53 (cyrb53), mulberry32, toBase32, randomBase32, gaussian, BASE32, BASE32_RE
    src/core/card.ts        CardSpec, makeCard, cardCode, encodePayload, decodePayload, clampAmount, clampCarry,
                            cleanName, formatMoney, parseMajor, formatCode, looksLikeOurs
    src/core/wave.ts        makeWave(id) → Wave, stockEdgeY, foilEdgeY, wavePath
    src/core/layout.ts      mm constants, daysInMonth, firstWeekday, dayCell, targetsFor, dayNumberPos
    src/core/pairing.ts     sha256Bytes, sha256Hex, bytesToBase32, pairTag, newPairing, verifyPairing, SECRET_RE
    src/core/homography.ts  applyH, mulH, invertH, solveLinear, solveHomography, localScale
Dependency order: prng → pairing → card; prng → wave; card (type only) → layout; homography stands alone.
## Data shapes
    type Role = 'S' | 'F';
    interface CardSpec { v:1; id; year; month; rateMinor; advMinor; currency; worker; employer; lang; carryMinor;
                         pairing?:{sa,sf}; halves?; discs?; revisedFrom? }
    interface DecodedHalf { raw; role; spec; code; codeOk; paired; secret?; tag? }   // spec never has pairing
    interface Wave { id; comps: {f,p,a}[]; k; at(x): number }                        // k = 5 / peak
    interface Target { key; kind:'day'|'adv'; n; half:0|1|null; cx; cy; cell:{x,y,w,h}; refs:[x,y][3] }
    type Hom = number[9]  (row-major, h33 = 1)
Constants: MAX_AMOUNT 200000, MAX_CARRY 10,000,000, DEFAULT_RATE 50000, DEFAULT_ADV 10000, WAVE_AMP 5,
FRAME 186×120, HOLE_R 3, SAMPLE_R 1.6, HALF_DX 4.1, PUNCH_DY 0.6, FOIL_ORIGIN (12,156), NOMINAL_CUT_Y 144.
## Algorithms
- **hash53**: cyrb53 with two 32-bit lanes; result is 53 bits. mulberry32 returns [0,1).
- **Card code**: join parts with "|", hash53(s, 0x5f0), toBase32(…, 6). Flags c, h2 and d3 are appended only when
  set, so a plain card hashes exactly as before and old codes stay valid.
- **Payload**: field list per R2; versionTag gives SF1 or SF2 plus p, h, d. decodePayload checks the field count
  first (minFields), then each field with its own regex, and joins the tail into the employer name.
- **Wave**: mulberry32(hash53('wave:'+id) >>> 0) draws f, p, a for 4 components. raw(x) = Σ a·sin(2π f x/186 + p).
  k = 5 / max|raw| over x = −14…200 step 0.5. at(x) = clamp(k·raw(x), ±5). Results are cached by id (cleared past 500).
- **Layout**: dayCell uses firstWeekday (Monday = 0) to place date d at column idx % 7, row ⌊idx/7⌋. targetsFor
  returns days (one or two circles each) then advances a1…a10, cached by year-month-halves.
- **SHA-256**: standard padding and 64 rounds on Uint32Array. pairTag base32-encodes the first 60 bits.
- **verifyPairing**: legacy / failed / verified as in R5. Both halves carry the same tag, so a forged partner
  needs the other secret, which is not in the QR.
- **Homography**: Hartley normalisation of both point sets, 8×8 weighted normal equations solved by Gaussian
  elimination with partial pivoting, then de-normalise. invertH uses the adjugate and rescales so h33 = 1.
## Correctness properties (fast-check, SF_RUNS runs)
1. encode → decode round-trips every spec, role and flag combination; editing any field covered by the code makes
   codeOk false. (tests/card.test.ts)
2. A card with no carry, halves or discs encodes to exactly the SF1 form, and a fixed old payload still decodes.
   (tests/card.test.ts)
3. The wave is deterministic, within ±5mm, peaks at exactly 5mm on the 0.5mm grid, differs per id by more than 0.5mm
   somewhere, and stockEdgeY − 132 equals foilEdgeY + 12. (tests/wave.test.ts)
4. Amounts never exceed 2,000 major units, even for NaN or ±Infinity; a typed carry is capped at ±100,000 major.
   (tests/card.test.ts)
5. SHA-256 equals the NIST vectors and Node crypto for any string. (tests/pairing.test.ts)
6. An honest pair verifies; a fabricated partner, swapped roles, a foreign half or an edited tag never verifies; one
   half's QR never contains the other secret. (tests/pairing.test.ts)
7. The homography recovers a random pose (rotation, scale 1.5–8, shift, perspective) and invertH inverts it
   exactly, to 1e-6. (tests/homography.test.ts)
## Error handling
- decodePayload never throws: bad version, role, month, numbers, lengths or alphabets return null.
- clampAmount, clampCarry and parseMajor treat NaN and malformed text as 0 or NaN instead of throwing.
- solveHomography returns null for fewer than 4 points, a singular system or non-finite output; callers must check.
- randomBase32 falls back to Math.random only when crypto.getRandomValues is missing.
