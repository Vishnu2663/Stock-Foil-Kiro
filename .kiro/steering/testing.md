---
inclusion: fileMatch
fileMatchPattern: "{src/core/**,src/vision/**,tests/**}"
---
# Testing

- Write the property tests first (fast-check), then the code. One test file per area in tests/.
- Run count comes from env SF_RUNS (default 15). Read it in one shared helper (tests/helpers) and pass it as
  `numRuns` to every fc.assert.
- The photo simulator (src/render/scene.ts) is the oracle for scanner tests: it returns the ground truth.
- Inside the supported envelope the punched set must be recovered exactly. Outside it, any wrong reading must
  carry a warning or be marked "unsure". Never accept a silently wrong reading.
- Money properties use integers only. Include NaN and +-Infinity in am- Money properties use integers only. Include NaN and +-Infinity in am- Money properties use integers only. Include NaN and +-Infinity in am- Money properties use integers only. Include NaN and +-Infinity in am- Money properties use integers only. Include NaN and +-Infinity in am- Money propertie ("Total" + ": " + x). Use one string with {0}, {1} placeholders,
  e.g. t("Paid on {0}", date).
- The runtime DOM translator maps exact English text to translations, so keep the visible text identical to the key.
- Names, numbers, card ids and currency amounts are never translated. Mark them with data-notranslate.
- Translation packs are src/i18n/ui/<lang>.json, flat {"English": "translation"}, label "AI-drafted, native review recommended".
