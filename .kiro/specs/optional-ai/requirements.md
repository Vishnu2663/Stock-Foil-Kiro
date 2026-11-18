# Requirements: optional-ai (Phase 11)
An optional AI helper that explains a pay result and translates the interface. The app is complete without it.
Reference: docs/BUILD_BRIEF.md §4 Phase 11, §6.7 (settings).
## R1 Providers
**User story:** As an employer, I choose whether any AI is used, and which.
1. THE SYSTEM SHALL offer three providers in Settings: Off, Built-in (Chrome's on-device Prompt API) and Custom.
2. THE SYSTEM SHALL default to Built-in, which is used only when the browser provides it.
3. WHERE the provider is Custom THE SYSTEM SHALL accept any OpenAI-compatible endpoint, model name and the user's own API key.
4. THE SYSTEM SHALL offer presets for OpenRouter (free models), Groq and Gemini, each labelled "unverified".
5. THE SYSTEM SHALL keep the API key only on this device, in a password field.
6. WHEN the custom endpoint is not https THE SYSTEM SHALL refuse the request.
7. WHEN the provider is Off THE SYSTEM SHALL make no AI call.
## R2 Explain a pay result
**User story:** As a worker, I want the pay explained in my language, and I want the numbers to be right.
1. WHEN a result is shown THE SYSTEM SHALL build a deterministic offline explanation in the card's language, containing
   the sum line, the disputed days (one-sided days from either half) and the disputed amount, or a "no dispute" line.
2. WHEN the net is negative THE SYSTEM SHALL add a line saying how much is owed.
3. WHEN AI answers THE SYSTEM SHALL show the AI text and always append the deterministic offline text (with the
   calculated sum), so the numbers never come from the model.
4. WHERE "Label AI text" is on THE SYSTEM SHALL add a note that the text is AI-made and the sum is calculated on the device.
5. WHEN the AI call fails (off, unavailable, timeout, network error, HTTP error, empty answer) THE SYSTEM SHALL show the
   offline explanation and a note naming the reason.
6. THE SYSTEM SHALL time out a built-in model after 20 s to create and 30 s to answer, and a custom call after 25 s.
## R3 Privacy
1. THE SYSTEM SHALL send only anonymised numbers and fixed codes: verdict, currency (3 capitals, else XXX), day counts,
   rate, advances, carry, net, disputed amount, one-sided days and the rate change.
2. THE SYSTEM SHALL never send names, employer names, card ids or photos.
3. THE SYSTEM SHALL tell the model to use only the given numbers and not to invent anything.
## R4 Translate the interface
**User story:** As a volunteer, I want to add a language that is not built in.
1. WHEN a provider is on and a 2–3 letter language code is entered THE SYSTEM SHALL translate the interface strings in
   chunks of 40 and save the result in localStorage under sf.pack.<code>.
2. THE SYSTEM SHALL keep a translation only when its {n} placeholders equal the English string's.
3. THE SYSTEM SHALL send interface strings only, with no personal data.
4. IF the translation fails THE SYSTEM SHALL show the error and leave existing packs unchanged.
## R5 Settings page
1. THE SYSTEM SHALL show language, pictures-and-voice mode, read-aloud speed, test voice, the AI controls above,
   calibration reset, and "Clear all data" with a confirmation.
