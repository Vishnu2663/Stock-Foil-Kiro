# Requirements: story-demo-lab (Phase 9)
Home, Story, Demo, Test lab, Calibrate, Punch guide and About.
Reference: docs/BUILD_BRIEF.md §4 Phase 9, §6.1, §6.8, §6.12.
## R1 Home
**User story:** As a first-time visitor, I want to understand the idea in ten seconds and reach the main actions.
1. THE SYSTEM SHALL show the kicker "CUT IT · PUNCH IT · PROVE IT" and the title "The tally stick, back from the dead."
2. THE SYSTEM SHALL show four buttons: See the story (primary), 4-vs-5 days demo, Make a card, Payday scan.
3. THE SYSTEM SHALL show the chips Free, Works offline, No account, No server, The worker needs no phone.
4. THE SYSTEM SHALL show a 3D tally card whose halves part along a generated wave and tilt towards the pointer.
5. WHILE the device is in lite or reduced-motion mode THE SYSTEM SHALL not tilt the card.
6. THE SYSTEM SHALL show three steps (Print and cut, Punch both daily, Scan on payday) and a QR to open the site on a phone.
## R2 Story
**User story:** As a judge or a worker, I want a short illustrated story that proves the idea live.
1. THE SYSTEM SHALL show 9 chapters: The fire, The split, Resurrection, The claim, Extra hole, Sloppy cut, The forgery,
   Paid, The end, on a dark full-screen page with embers.
2. WHEN chapters 4 to 7 are shown THE SYSTEM SHALL run the real scanner on a simulated photo pair and show the verdict.
3. WHEN chapter 7 is shown THE SYSTEM SHALL burn the forged half.
4. THE SYSTEM SHALL provide chapter dots, ←/→ keys (reversed in right-to-left languages) and a Play/Pause button.
5. WHEN Play is on and narration ends THE SYSTEM SHALL advance to the next chapter.
6. THE SYSTEM SHALL narrate with Web Speech in the story language, which follows the app language when a pack exists
   and otherwise falls back to English.
7. THE SYSTEM SHALL offer a voice picker preferring natural voices, and warn when only a robotic voice or no voice exists.
8. THE SYSTEM SHALL offer a pace of 0.6–1.2 (default 0.85) and remember pace and voice.
## R3 Demo
**User story:** As a visitor, I want to see the 4-vs-5 days claim settled by the real scanner.
1. WHEN a scenario button is pressed THE SYSTEM SHALL simulate two photos and run the real scanner and pair check on them.
2. THE SYSTEM SHALL offer: 4 vs 5 days (expect genuine-consistent), An extra hole (genuine-disputed), A sloppy cut
   (genuine-consistent), A forged cut (pair-mismatch) and A half day (4½ days).
3. THE SYSTEM SHALL use the saved calibration tolerance when one exists.
4. IF the scanner fails THE SYSTEM SHALL show an error message and stay usable.
## R4 Test lab
**User story:** As a skeptic, I want to attack the system and see it hold.
1. THE SYSTEM SHALL offer photo sliders (rotation, tilt, blur, noise, light) and a Simulate button.
2. THE SYSTEM SHALL offer tamper buttons: Extra hole, Covered hole, Forged cut, Changed rate, Foreign card.
3. WHEN a stress test of 10, 25 or 50 runs starts THE SYSTEM SHALL run random photo cases, show progress, the success
   rate and the failures, and allow Stop.
4. THE SYSTEM SHALL offer Print round-trip, which rasterises the real printable sheet, cuts, punches, photographs and scans it.
## R5 Calibrate
**User story:** As an employer with my own paper and punch, I want the scanner tuned to them.
1. WHEN photos of punched cards are chosen THE SYSTEM SHALL measure punched and blank brightness, hole radius and
   half-to-half alignment.
2. THE SYSTEM SHALL suggest a threshold midway between the median punched and blank ratios, and a tolerance of
   1.5 × the 95th-percentile alignment residual + 0.3, limited to 0.8–2.5, when at least 4 residuals exist.
3. IF there are no punched or blank samples, or punched ≥ blank, THE SYSTEM SHALL decline to suggest and say so.
4. WHEN "Apply to this device" is pressed THE SYSTEM SHALL save the suggestion in settings.calibration, and before that
   THE SYSTEM SHALL change nothing.
5. WHEN "Reset to defaults" is pressed THE SYSTEM SHALL clear settings.calibration.
6. THE SYSTEM SHALL allow downloading the report as JSON.
7. THE SYSTEM SHALL skip disc cards and photos with a "dark-surface" warning, and add a note.
## R6 Punch guide
1. THE SYSTEM SHALL explain, in order: stack the halves, line up the corner squares, punch today's circle once through
   both, half-day cards (one or two circles), and advance tokens, with a 3D punch animation.
## R7 About and security
1. THE SYSTEM SHALL list every protection and the honest limits of §6.12.
## R8 Story text
1. THE SYSTEM SHALL provide every story language with all 9 chapters, each with title, short label and text.
