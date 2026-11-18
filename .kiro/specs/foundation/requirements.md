# Requirements: foundation (Phase 1)

App shell, design tokens, navigation, splash loader, ambient effects, settings store, app context and PWA.
Reference: docs/BUILD_BRIEF.md §4 Phase 1, §6.7, §6.10.

## R1 Hash routing
**User story:** As any user, I want every page to have its own link so I can bookmark it and use Back.

1. THE SYSTEM SHALL support exactly these routes: #/home #/issue #/scan #/members #/crew #/story #/history #/ledger
   #/income #/punch #/demo #/lab #/calibrate #/about #/settings.
2. WHEN the hash is empty or unknown THE SYSTEM SHALL show #/home.
3. WHEN the route changes THE SYSTEM SHALL scroll the window to the top.
4. WHEN a route is shown THE SYSTEM SHALL render that page's placeholder with its title.
5. WHEN a route is shown THE SYSTEM SHALL set document.title to "<Page> · Stock & Foil".

## R2 Desktop header (≥1001px)
**User story:** As an employer or volunteer at a computer, I want one calm header row that gets me to every page.

1. WHILE the viewport is ≥1001px wide THE SYSTEM SHALL show one dark header row with, left to right: the brand, a thin
   divider, then evenly spaced Home · New card · Members · Payday scan · Crew · Story · Records ▾ · More ▾, then a
   bordered "Settings" button with a gear icon.
2. THE SYSTEM SHALL render the brand as the logo, then "STOCK" above a dashed wavy line above "& FOIL" in red.
3. THE SYSTEM SHALL render Payday scan as a red gradient (#e2584a → #b3321f) button with white text, a soft red glow
   and a scan-frame icon, and Story in orange (#e0832f).
4. THE SYSTEM SHALL give every nav item a line icon.
5. WHEN Records ▾ opens THE SYSTEM SHALL list History ("All scans: paid or yet to pay"), Ledger ("Receipts, saved
   cards, chain check") and Income proof ("Certificate for a loan or rent").
6. WHEN More ▾ opens THE SYSTEM SHALL list Punch guide ("How to punch each day"), Demo ("The 4 vs 5 days story"),
   Test lab ("Simulate, forge, stress-test"), Calibrate ("Tune to your paper and punch") and About & security ("How it
   is protected, and its limits").
7. THE SYSTEM SHALL render each dropdown item as an icon tile, a bold title, the hint and a chevron.
8. WHEN the pointer hovers a nav item THE SYSTEM SHALL glide a soft pill under it, and WHEN the pointer leaves THE
   SYSTEM SHALL return the pill to the active item.
9. THE SYSTEM SHALL mark the active item with the pill and a short red underline (a dropdown trigger is active when one
   of its pages is open).
10. WHEN a menu is open THE SYSTEM SHALL move focus with ArrowUp/ArrowDown (also Home/End), and WHEN Escape is pressed
    or the user clicks outside THE SYSTEM SHALL close it (Escape returns focus to the trigger).
11. WHILE the viewport is 1001–1239px THE SYSTEM SHALL hide nav icons except the scan icon.
12. THE SYSTEM SHALL never let the header row overflow horizontally at any width ≥1001px.

## R3 Phone navigation (≤1000px)
**User story:** As a worker or employer on a phone, I want big thumb-friendly navigation.

1. WHILE the viewport is ≤1000px THE SYSTEM SHALL show a header with the brand, a red square scan button with the
   scan icon, and a gear button.
2. THE SYSTEM SHALL show a fixed bottom tab bar: Home · New card · Payday scan · Members · More, each with icon and label.
3. WHEN More is tapped THE SYSTEM SHALL open a slide-up sheet listing every other page, over a dimmed backdrop; WHEN
   the backdrop, Escape or a link is used THE SYSTEM SHALL close it.
4. THE SYSTEM SHALL respect safe-area insets, use 16px side gutters, and set overflow-x: clip on html and body.
5. THE SYSTEM SHALL make every tap target at least 44px tall.

## R4 Themes and type
1. THE SYSTEM SHALL define the §6.10 light tokens and, WHEN prefers-color-scheme is dark, the dark tokens.
2. THE SYSTEM SHALL set the serif body stack, system-ui sans for controls and nav, and kickers uppercase with 0.14em
   tracking in red.

## R5 Splash loader
**User story:** As a first-time visitor, I want a short branded intro that never shows the logo twice.

1. WHEN the page loads THE SYSTEM SHALL show, from inline CSS and script in index.html, a dark full screen with an
   exact clone of the header brand scaled up in the centre.
2. THE SYSTEM SHALL keep the splash for at least 1500ms, or for the ?splash=<ms> value when given.
3. WHEN the time is up and the app header has rendered THE SYSTEM SHALL fly the clone onto the exact rectangle of the
   header brand, then remove the splash.
4. WHILE body.splashing is set THE SYSTEM SHALL keep the header brand hidden, so the logo never appears twice.
5. THE SYSTEM SHALL play the splash on every reload.
6. WHEN prefers-reduced-motion is set THE SYSTEM SHALL skip the flight and fade out instead.
7. IF the app fails to mount within 8s THE SYSTEM SHALL remove the splash anyway.

## R6 Ambient effects
1. THE SYSTEM SHALL show drifting warm light and a faint field of punched holes behind the content.
2. WHEN the route changes THE SYSTEM SHALL play a page-turn transition.
3. WHEN a button is pressed THE SYSTEM SHALL show a ripple from the press point.
4. WHEN elements marked [data-reveal] scroll into view THE SYSTEM SHALL rise them in, staggered.
5. WHEN the pointer moves over [data-tilt] THE SYSTEM SHALL tilt it in 3D with at most one style write per animation
   frame and no blur.
6. WHEN (max-width:1000px) or (pointer:coarse) matches THE SYSTEM SHALL set body.lite and turn heavy effects off
   (drifting light, hole field animation, tilt).
7. WHEN prefers-reduced-motion is set THE SYSTEM SHALL turn every effect off.

## R7 Settings, toast and app context
1. THE SYSTEM SHALL provide a settings store with the §6.7 defaults, persisted in localStorage with every access in
   try/catch; missing or corrupt values fall back to the defaults field by field.
2. THE SYSTEM SHALL provide a toast that shows a short message for about 3s in an aria-live region.
3. THE SYSTEM SHALL provide an app context with settings, setSettings, lang, t(), toast and startCard.
4. t(s, ...args) SHALL return s with {0}, {1}… replaced (translation arrives in Phase 10).
5. startCard(prefill) SHALL store a pre-fill and navigate to #/issue.

## R8 PWA
1. THE SYSTEM SHALL ship public/manifest.webmanifest and public/icon.svg (the §6.10 logo).
2. THE SYSTEM SHALL register a hand-written public/sw.js in production only.
3. THE SYSTEM SHALL cache the app shell at install and the built assets on first fetch, so the app works offline
   after the first visit.
4. WHEN a new version is installed THE SYSTEM SHALL delete old caches on activate.
