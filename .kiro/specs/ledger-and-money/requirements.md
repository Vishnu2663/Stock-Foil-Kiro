# Requirements: ledger-and-money (Phase 8)
Hash-chained receipts, paid status, carry-forward, History, Ledger, Crew payroll and Income proof.
Reference: docs/BUILD_BRIEF.md §4 Phase 8, §6.7, §6.8.
## R1 Hash-chained receipts
**User story:** As a worker or employer, I want every scan and payment written to a chain that shows any later edit.
1. WHEN a receipt is appended THE SYSTEM SHALL set seq to the chain length, prev to the previous hash (64 zeros for the
   first) and hash to the SHA-256 hex of the receipt fields plus prev.
2. WHEN rateChange or halfUnits is absent THE SYSTEM SHALL leave it out of the hash input.
3. WHEN a payment is recorded THE SYSTEM SHALL append a receipt with verdict 'paid'.
4. WHEN a receipt has halfUnits THE SYSTEM SHALL count halfUnits / 2 days, and otherwise agreedDays.length.
5. WHEN a receipt is edited, removed or moved THE SYSTEM SHALL make verifyChain return the index of the first broken
   receipt, and −1 for an intact chain.
## R2 Paid status
**User story:** As a worker, I want a card that was paid to say so, so I am not paid twice and not cheated later.
1. WHEN a card has paid receipts THE SYSTEM SHALL use the latest one ("the latest payment wins").
2. WHEN a card is scanned again after payment THE SYSTEM SHALL show "Already paid on <date>".
3. WHEN the current net differs from the paid net THE SYSTEM SHALL flag that the amount changed.
## R3 Carry-forward
**User story:** As an employer, I want a debt carried onto next month's card.
1. WHEN a new card is made for a worker and employer THE SYSTEM SHALL carry the net of the latest scan of the
   previous month (year rolls back in January) only if that net is negative, otherwise 0.
2. THE SYSTEM SHALL match worker and employer ignoring case and extra spaces.
3. THE SYSTEM SHALL never use payment receipts for carry-forward.
## R4 History page
**User story:** As an employer, I want every scan grouped by month with its paid status and totals.
1. THE SYSTEM SHALL list one row per card (its latest scan), grouped by month, newest month first.
2. THE SYSTEM SHALL show a chip Paid (with the date) or Yet to pay, and an "Amount changed" chip when it applies.
3. WHEN a filter (status, month, text query on worker, employer or card id) is set THE SYSTEM SHALL show only matching rows.
4. THE SYSTEM SHALL show totals per month and per currency: all, paid and yet to pay, where all = paid + unpaid.
5. WHILE the viewport is phone width THE SYSTEM SHALL stack table rows into cards.
## R5 Ledger page
**User story:** As an employer, I want to see, check, export and restore my records.
1. THE SYSTEM SHALL list receipts and saved cards, and let the user reprint, edit or delete a card.
2. WHEN "Check chain" is pressed THE SYSTEM SHALL report the chain intact or the first broken receipt.
3. WHEN "Tamper demo" is pressed THE SYSTEM SHALL edit a copy of the ledger (receipt 1 gets extra pay), show where the
   chain breaks, and leave the real ledger untouched.
4. THE SYSTEM SHALL export the ledger as CSV and as JSON.
5. WHEN a CSV or JSON file is imported THE SYSTEM SHALL reject files that are not a ledger, and ask before replacing
   existing receipts.
6. THE SYSTEM SHALL return the same receipts from a CSV round-trip and a JSON round-trip.
## R6 Crew payroll
**User story:** As a contractor with many workers, I want one payroll sheet and the cash to bring.
1. THE SYSTEM SHALL list rows with name, agreed days, net, the notes for that person and the disputed amount.
2. THE SYSTEM SHALL exclude disputed amounts from the net, show the total cash and the note mix to bring.
3. THE SYSTEM SHALL let the user remove one row, clear the list (after confirmation), export CSV and print.
## R7 Income proof
**User story:** As a worker, I want a one-page certificate for a loan or a landlord that others can verify.
1. WHEN a certificate is built THE SYSTEM SHALL use the latest counted receipt per month (verdicts genuine-consistent,
   genuine-disputed, review, inconclusive), at most the last 6 months, with days, advances, net, an 8-hex receipt
   hash and a paid flag per month, the totals, and the ledger head (16 hex).
2. WHEN there are no counted receipts for the worker and employer THE SYSTEM SHALL build no certificate.
3. THE SYSTEM SHALL show the certificate with a QR code of its text, and allow print and copy.
4. WHEN a pasted certificate is verified against a loaded ledger THE SYSTEM SHALL pass it only if the chain is intact, the
   head and every month hash match, and days, advances, net, currency, worker, employer, paid flags and totals agree.
5. WHEN a figure is inflated, a month is invented or repeated, or a receipt is edited or deleted THE SYSTEM SHALL fail
   verification and list the problems.
## R8 Storage
1. THE SYSTEM SHALL keep the ledger, cards, members and crew under sf.ledger, sf.cards, sf.members, sf.crew.
2. IF stored data is missing or not an array THE SYSTEM SHALL use an empty list, and IF a write fails THE SYSTEM SHALL not throw.
