# Design: languages-and-voice (Phase 10)
## Architecture
    src/i18n/index.ts        LangInfo, UI_LANGS (6), STORY_EXTRA_LANGS (5), langInfo, pickUiLang, SLIP, VERDICTS,
                             PROMPTS, EXPLAIN, slipDict, verdictWord, prompt, explainTemplates, fill
    src/i18n/uiPack.ts       compile(pack), translateWith, loadPack (lazy import of ./ui/<lang>.json + sf.pack.<lang>),
                             setCurrent, tr, format, t
    src/i18n/dom.ts          startTranslator, translateAll, resetUntranslated, window.__sfUntranslated
    src/i18n/ui/*.json       source.json (English keys) and hi, bn, ta, es, sw (482 strings each)
    src/i18n/story/*.ts      ar bn es fr hi mr pt sw ta te (+ packs.ts); English is in src/i18n/story.ts
    src/ai/speech.ts         chunkText, scoreVoice, rankVoices, voiceLangs, speak, stopSpeaking, voicesReady
    src/ui/components/Listen.tsx  pageText(), ListenFab
    scripts/extract-ui-strings.mjs  AST walk → source.json
    scripts/extra-strings.json      hand-listed strings (verdict words, check details, formula templates)
    scripts/check-ui-pack.mjs       allStrings, checkPack(lang), LANGS = hi bn ta es sw
    scripts/merge-ui-pack.mjs       merge a partial JSON into a pack with placeholder checks
## Data shapes
    Pack = Record<English string, translation>   ("_note" key: "AI-drafted, native review recommended")
    Compiled = { exact: Map, templates: [{ re, to, n }], values }
    Chunk = { text, pause }       PAUSE = { paragraph: 650, sentence: 280, comma: 160 }    MAX_CHUNK = 170
    LangInfo = { code, name, english, rtl?, speech }   (speech is a BCP-47 tag such as hi-IN)
## Algorithms
- compile turns each key with {n} into an anchored regex (non-greedy groups, other parts escaped) and a replacement
  with arguments reordered by placeholder index. Templates are sorted longest first so the most specific wins.
- translateWith: exact match first, then templates. dom.ts walks text nodes (TreeWalker rejecting SKIP subtrees) and the
  four attributes. textOrig and attrOrig WeakMaps keep the English source. textWritten and attrWritten record what we
  wrote, so the observer ignores our own mutations and does not loop.
- check-ui-pack: missing = key absent or blank; broken = sorted placeholders differ; stale = pack key not in source.
- chunkText: paragraphs by blank lines, sentences after . ! ? । ॥ ። ؟ 。, long sentences split at commas or words to
  ≤ 170 characters. The pause comes from the position of the chunk.
- scoreVoice: +30 exact language, +20 same base, +40 natural-sounding names, +25 Google, +20 Siri, +6 network voice,
  −60 robotic. rankVoices drops broken voices and tries voiceLangs in order (mr → mr, hi).
- ListenFab collects h1–h3, p, li, .total-big, .stamp and [data-speak] in main .page, skipping aria-hidden and .no-speak.
## Correctness properties
- P1 each of hi, bn, ta, es, sw has every string and keeps every placeholder (tests/i18n.test.ts, "packs").
- P2 every story language has all 9 chapters with title, short and text (tests/i18n.test.ts, "packs").
- P3 slip, verdict, prompt and explanation dictionaries exist for every UI language with English's placeholders
  (tests/i18n.test.ts, "packs").
- P4 templates translate with their arguments in place, in any order (tests/i18n.test.ts, "packs", fast-check).
- P5 speech chunks are ≤ 170 characters, keep every word, and use the 650/280/160 ms pauses (tests/ai.test.ts, "speech").
- P6 voice scoring prefers natural voices and penalises robotic ones. Marathi falls back to Hindi
  (tests/ai.test.ts, "speech").
## Error handling
- A missing or failing pack import gives an empty pack, so the interface stays in English.
- Corrupt sf.pack.<lang> JSON is ignored. A speech error marks the voice as broken and the next ranked voice is tried.
- merge-ui-pack rejects mismatched placeholders and prints them. extract-ui-strings only adds, it never edits packs.
- Without speechSynthesis, speak is a no-op and all speech controls are hidden.
## Limits
The translations are machine drafts and need native review. Speech quality depends on the voices installed on the device.
