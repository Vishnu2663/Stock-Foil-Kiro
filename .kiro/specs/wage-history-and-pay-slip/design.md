# Design: wage history and the pay slip
- `src/core/wages.ts`: RateRange, PayLine, scheduleOf, rateOnDay, payFor (schedule-aware), WageEntry, WageSource,
  applyChanges, wageScheduleFor, sameSchedule, defaultWageSource.
- `src/core/members.ts`: wages, wagesOf, migrateMember, wageOn, appendWage, memberForCard; bulk cards carry memberId.
- `src/core/cash.ts`: cashBreakdown(amount, currency, without) with `skipped`.
- `src/core/words.ts`: wordsEn (Indian grouping option), amountInWords.
- `src/ui/payday.ts`: paydayModel(view, spec, wage, t, notesOff) → tokens, formula, lines, cash, checkSum, listen,
  wageNote. Scan.tsx computes wage → verifyPair({ wage }) → model in one memo chain.
- `src/vision/pair.ts`: opts.wage feeds the schedule and advance value; a "Wage adjusted" check.
- `src/core/history.ts`: receipts carry `wage` (in the hash string only when present, so old chains verify).
- UI: Party.tsx, Banknote.tsx (Banknote, NoteStacks), PaySlip.tsx, ResultView.tsx (PayFlow, Formula with popover),
  Members wage history, Settings → Notes I have, tokens.css (prefixed --tc-* retro tokens).
