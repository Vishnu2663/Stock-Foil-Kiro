# Design: optional-ai (Phase 11)
## Architecture
    src/ai/index.ts          PayFacts, anonymise, sumLine, offlineExplain, buildPrompt, askAI, explain, translateStrings,
                             builtinAvailable, PRESETS
    src/ui/pages/Settings.tsx  provider select, custom fields, presets, Label AI text, Translate the app with AI
    src/ui/pages/Scan.tsx    calls explain(settings, facts, spec.lang) after a result (outside this spec)
    src/i18n/index.ts        EXPLAIN templates (sum, disputed, stockOnly, foilOnly, disputedAmount, noDispute, owes)
## Data shapes
    PayFacts = { verdict, currency, fullDays, halfDays, days, rateMinor, advCount, advMinor, carryMinor, netMinor,
                 disputedMinor, stockOnlyDays[], foilOnlyDays[], rateChange? }
    ExplainResult = { text, source: 'ai'|'offline', note? }
    FetchLike = (url, init) => Promise<{ ok, status, json() }>      (injected in tests)
    Settings AI fields: aiProvider 'off'|'builtin'|'custom', aiNote, customUrl, customModel, customKey
## Algorithms
- anonymise rebuilds PayFacts field by field with numeric coercion, so extra properties (names, ids) cannot pass.
  Currency is kept only if it matches /^[A-Z]{3}$/.
- sumLine: `<days> × <rate> = <gross>` (or `<days> (<rate> → <new rate>) = <gross>` with a rate change), then
  `− n × <advance>` and a signed carry, then `= <net>`. gross = net + advances − carry.
- offlineExplain: sum line, then disputed days (sorted union) with stock-only and foil-only lists and the disputed
  amount, or the no-dispute line, then the owes line when net < 0. Templates come from the card's language.
- askAI: off → throw. builtin → `LanguageModel` or `ai.languageModel`, create (20 s), prompt (30 s), destroy.
  custom → require https, POST `{ model, temperature: 0.2, messages:[user prompt] }` with a Bearer header only when a key
  exists, 25 s timeout, require ok and a non-empty `choices[0].message.content`.
- explain: build offline text. If provider is off, return it. Otherwise try askAI. Success returns
  `ai + "\n\n" + offline` with source 'ai'. Any error returns offline with source 'offline' and a note.
- translateStrings: chunks of 40, a prompt that asks for a JSON object, a regex to extract it, then a placeholder-equality
  filter per string. A chunk that cannot be parsed is skipped.
## Correctness properties
- P1 the cloud prompt never contains the worker name, employer name or card id, for any facts (tests/ai.test.ts,
  "optional-ai", fast-check).
- P2 the offline text always contains the sum line, the net amount and every disputed day, in every UI language
  (tests/ai.test.ts, "optional-ai", fast-check).
- P3 a failure (thrown error, HTTP 500, empty answer) returns exactly the offline explanation, and a success returns
  source 'ai' with the calculated sum still present (tests/ai.test.ts, "optional-ai").
- P4 provider 'off' returns the offline explanation with source 'offline' (tests/ai.test.ts, "optional-ai").
## Error handling
- Every failure path in explain is caught and degraded to offline text. The note carries the error message.
- Settings: translation errors show a toast and do not write a pack. The Translate button is disabled unless the code
  matches /^[a-z]{2,3}$/ and no request is running.
- Clear all data requires confirm(), then removes every sf.* key and reloads.
## Limits
Free endpoints change without notice, so presets are labelled unverified. Built-in AI exists only in some Chrome
builds. Both are optional. A model can still word things badly, which is why the sum is always recalculated and shown.
