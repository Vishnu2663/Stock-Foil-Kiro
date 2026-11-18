# Requirements: languages-and-voice (Phase 10)
Six UI languages, a runtime DOM translator, story packs, speech and pictures-and-voice mode.
Reference: docs/BUILD_BRIEF.md §4 Phase 10, §6.9.
Provenance: the five UI packs (hi, bn, ta, es, sw: 482 strings each) and the story packs (11 languages) were filled by
the translator agent in parallel. All are labelled "AI-drafted, native review recommended".
## R1 Languages
**User story:** As a worker who reads Hindi, Tamil or Swahili, I want the whole app in my language.
1. THE SYSTEM SHALL offer six UI languages: English, हिन्दी, বাংলা, தமிழ், Español, Kiswahili.
2. WHEN the language is changed in Settings THE SYSTEM SHALL change the whole interface, without reloading.
3. THE SYSTEM SHALL label the language control "AI-drafted, native review recommended".
4. THE SYSTEM SHALL offer story narration in five more languages: తెలుగు, मराठी, Français, Português, العربية (right to left).
5. IF a code is not a UI language THE SYSTEM SHALL use English for the interface.
## R2 Runtime translator
**User story:** As a maintainer, I want new text to translate without wiring each string.
1. WHEN text nodes or the attributes placeholder, title, aria-label and alt appear or change THE SYSTEM SHALL translate
   them through a MutationObserver.
2. THE SYSTEM SHALL keep each English original, so switching languages (including back to English) is lossless.
3. THE SYSTEM SHALL skip [data-notranslate], script, style, textarea, pre, code and svg.
4. WHEN a string has {0} style placeholders THE SYSTEM SHALL match it as a template and place the arguments in the
   translated order.
5. WHEN a string has no translation THE SYSTEM SHALL show the English text and record it, readable with
   window.__sfUntranslated().
6. THE SYSTEM SHALL load a pack on demand, and add strings from localStorage key sf.pack.<lang> (AI translation of extra languages).
## R3 String tooling
1. THE SYSTEM SHALL build src/i18n/ui/source.json from a TypeScript AST walk of src/ui and the label tables in src/vision
   (JSX text, translatable attributes, t() calls, title/hint/label/text properties), skipping data-notranslate.
2. THE SYSTEM SHALL list strings the walk cannot see in scripts/extra-strings.json.
3. THE SYSTEM SHALL provide check-ui-pack.mjs, reporting per language the missing, broken-placeholder and stale strings.
4. THE SYSTEM SHALL provide merge-ui-pack.mjs, which rejects entries whose placeholders differ from the English.
5. WHEN a pack misses a string or breaks a placeholder THE SYSTEM SHALL fail the test suite.
## R4 Dictionaries
1. THE SYSTEM SHALL provide slip words, verdict words, spoken scan prompts and explanation templates for every UI
   language, with the same placeholders as English.
2. THE SYSTEM SHALL provide all 9 story chapters in all 11 story languages.
## R5 Speech
**User story:** As a worker who cannot read well, I want the app to talk.
1. THE SYSTEM SHALL split text into chunks of at most 170 characters that keep every word, with pauses of 650 ms after
   a paragraph, 280 ms after a sentence and 160 ms after a clause.
2. THE SYSTEM SHALL rank voices for a language, preferring natural, Google and Siri voices and penalising robotic ones.
3. WHEN no Marathi voice exists THE SYSTEM SHALL use a Hindi voice.
4. THE SYSTEM SHALL remember voices that fail (sf.brokenVoices) and skip them.
5. WHERE speech is unsupported THE SYSTEM SHALL hide speech controls and keep the text.
## R6 Pictures-and-voice mode
1. WHEN the Settings switch is on THE SYSTEM SHALL add body.simple with larger pictures and buttons (44px or more).
2. WHILE the mode is on and speech is supported THE SYSTEM SHALL show a floating Listen button on every page except the
   Story, which reads the page's headings, paragraphs and list items, and stop when the route changes.
3. WHILE the mode is on THE SYSTEM SHALL speak scan prompts, and read the result (suns, notes and total) aloud.
4. THE SYSTEM SHALL read at the speed set in Settings (default 0.9).
