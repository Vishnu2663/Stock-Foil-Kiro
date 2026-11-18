# Design: ledger-and-money (Phase 8)
## Architecture
    src/core/history.ts      Receipt types, GENESIS, receiptString, hashReceipt, appendReceipt, verifyChain,
                             receiptDays, isScan, latestPaid, latestScan, buildHistory (pure)
    src/core/settlement.ts   paidInfo, prevMonth, carryForward (pure)
    src/store/index.ts       KEYS, readJSON/writeJSON over an injectable KV, cards/ledger/members/crew load+save,
                             addReceipt, ledgerToCSV/ledgerFromCSV, toCSV/parseCSV, download, clearAll
    src/store/certificate.ts buildCertificate, verifyCertificate, certToText, certFromText (pure)
    src/ui/pages/Ledger.tsx  receipts, saved cards, Check chain, Tamper demo, CSV/JSON export, import
    src/ui/pages/History.tsx grouped table, filters, month picker, totals chips
    src/ui/pages/Crew.tsx    payroll table, total cash, note mix, CSV, print
    src/ui/pages/Income.tsx  certificate view with QR, verifier
## Data shapes
    Receipt = { seq, at, cardId, month 'yyyy-mm', worker, employer, verdict, agreedDays[], stockOnlyDays[],
                foilOnlyDays[], agreedAdv, netMinor, disputedMinor, currency, rateChange?, halfUnits?, prev, hash }
    Verdict = 'genuine-consistent'|'genuine-disputed'|'review'|'inconclusive'|'pair-mismatch'|'unreliable'|'paid'
    HistoryRow = { cardId, month, worker, employer, currency, scan, scans, paid?, status 'paid'|'unpaid', amountChanged }
    HistoryMonth = { month, rows[], totals: Record<currency, { all, paid, unpaid }> }
    Certificate = { v:1, worker, employer, currency, from, to, months:[{m, days, adv, net, h, paid?}],
                    totalDays, totalNet, head, at }
    CrewRow = { id, cardId, worker, employer, month, currency, agreedDays, netMinor, disputedMinor, verdict }
Storage keys: sf.ledger, sf.cards, sf.members, sf.crew (plus sf.settings, sf.prefill, sf.storyPace, sf.storyVoice).
## Algorithms
- receiptString joins seq, at, cardId, month, worker, employer, verdict, the three day lists (comma-joined), agreedAdv,
  netMinor, disputedMinor, currency, then `rc:<fromDay>:<rate>` and `hu:<n>` only when present, then prev, with "|".
- verifyChain walks the list: for index i it requires seq = i, prev = previous hash (GENESIS at 0) and a recomputed hash
  equal to the stored one. It returns the first failing i.
- buildHistory keeps the last scan per cardId (counting scans), attaches latestPaid, sets status and
  amountChanged = paid.netMinor ≠ scan.netMinor, applies filters, groups by month, sums totals per currency and sorts
  months descending.
- carryForward scans the chain backwards for the previous month's key, the same normalised worker and employer and a
  scan verdict. It returns that net when negative, otherwise 0.
- buildCertificate keeps the last counted receipt per month for the normalised worker and employer, takes the last 6
  months, marks paid when any 'paid' receipt exists for the same cardId, and sets head to the last chain hash (16 hex).
- verifyCertificate recomputes everything from the chain up to the head receipt. Each problem adds a message.
- Tamper demo: copy the chain, add 50000 to receipt 0's netMinor, run verifyChain on the copy.
## Correctness properties
- P1 an intact chain verifies, and survives CSV and JSON round-trips (tests/ledger.test.ts, "chain").
- P2 any edit of a hashed field, removal or reorder breaks the chain at exactly the first affected index
  (tests/ledger.test.ts, "chain", fast-check).
- P3 the latest payment wins and a changed amount is flagged (tests/ledger.test.ts, "chain").
- P4 a certificate verifies against its own ledger and fails on inflated figures, invented months, or an edited or
  deleted receipt (tests/ledger.test.ts, "certificates").
- P5 history totals add up: all = paid + unpaid per month and currency (tests/ledger.test.ts, "history and carry").
- P6 carry-forward comes only from the previous month's latest scan and never from payment receipts
  (tests/ledger.test.ts, "history and carry").
- P7 sanitizeSettings never throws and returns default types (tests/ledger.test.ts, "settings"; from foundation).
## Error handling
- readJSON catches parse errors and returns the fallback. A non-array value becomes [].
- writeJSON catches quota errors and returns false. UI shows a toast when a save fails.
- Import: invalid JSON or CSV, or an empty list, shows "That file is not a ledger export." and changes nothing.
  Replacing existing receipts needs a confirm().
- A tampered import is accepted as data but Check chain reports the broken index.
- Certificates: certFromText returns null for bad JSON or a wrong shape, and the verifier says "Not a certificate".
## Limits
The ledger is local and the chain proves edits, not who made them. Deleting the whole ledger or truncating the tail
cannot be detected without a copy, which is why a certificate carries the ledger head.
