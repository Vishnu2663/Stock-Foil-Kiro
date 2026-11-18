# BUILD "STOCK & FOIL" FROM SCRATCH (Kiroween 2026, Resurrection category)  
  
FIRST ACTION: create docs/BUILD_BRIEF.md in this workspace and save this ENTIRE message into it, word for word.  
The steering files and every later phase refer to that file, so the exact reference stays available after this chat.  
Then start Phase 0. Stop at the end of every phase for my review.  
  
## 1. Your role and goal  
  
You are the lead engineer building **Stock & Foil** from an empty folder, using Kiro the way an expert would:  
specs, steering, hooks, MCP, property-based tests, and custom agents and powers where this Kiro supports them.  
The finished app must work and look exactly like the product described here. It is a submission to the  
**Kiroween 2026 hackathon, Resurrection category** ("Bring your favorite dead technology back to life"), so how  
Kiro is used matters as much as the code.  
  
Stock & Foil resurrects the medieval **split tally stick**, whose halves were called the stock and the foil.  
England burned its obsolete tally sticks in 1834 and the fire destroyed the Houses of Parliament.  
Stock & Foil is a tamper-proof paper work record for people paid daily in cash. A card prints in two halves  
separated by a **unique wavy cut**. The worker keeps the stock, the employer keeps the foil, and both are punched  
together every day. On payday any phone camera scans both halves, proves they belong together (QR pairing  
secret + wavy cut + card code), compares the holes, counts full and half days, subtracts advances, and prints a  
picture pay slip that is read aloud in the worker's language. The worker needs no phone and does not need to  
read. Free, offline, no server, no account.  
  
## 2. Hard rules (apply to everything)  
  
1. Work only inside this workspace folder. Never read, write or run commands outside it.  
2. Use the git remote and git identity already configured here. Do not create repositories, change git config,  
   force-push, or push without my approval. Commit at the end of each phase with a clear message.  
3. Free and open source only: no paid APIs, no backend, no database, no analytics, no login. Runtime deps:  
   react, react-dom, jsqr and qrcode only. Dev deps: typescript, vite, @vitejs/plugin-react, vitest, fast-check  
   and @types/* only. Ask before adding anything else.  
4. Write all-new code. Do not fetch or copy code from any other Stock & Foil repository or website.  
5. Never silently wrong: anything the scanner is not sure of is flagged "unsure", and the app warns instead of  
   guessing.  
6. Money is integer minor units (paise/cents). Never floats.  
7. Privacy: names, card ids and photos never leave the device. Optional AI gets anonymised numbers only and  
   always has an offline fallback.  
8. Accessibility: every motion respects prefers-reduced-motion; every control is keyboard reachable and labelled.  
9. Every phase ends green: `npm run typecheck`, `npm test` and `npm run build` all pass.  
10. Follow section 6 (Reference) exactly: formats, constants, thresholds, wording, order and design. Where it is  
    silent, choose the simplest option and tell me.  
  
## 3. How you must work  
  
- Phase 0 is Vibe mode. Phases 1–12 each get their own Kiro spec in .kiro/specs/<phase-name>/:  
  requirements.md (user stories + EARS acceptance criteria "WHEN … THE SYSTEM SHALL …"), design.md  
  (architecture, data shapes, algorithms, correctness properties, error handling), tasks.md (small tasks tied  
  to requirements, each with tests).  
- Show me requirements, then design, then tasks; wait for my approval before running the tasks.  
- Write property-based tests (fast-check) for every correctness property listed. The SF_RUNS env var sets the run  
  count (default 15). The photo simulator is the oracle for scanner tests.  
- After each phase: run the checks, screenshot the new screens at 1280px and 375px with the browser MCP, add a  
  dated entry to docs/KIRO_LOG.md (what was built, the Kiro features used, the bugs the property tests caught,  
  screenshots), commit, and stop for my review.  
  
## 4. Phases  
  
### Phase 0: Kiro setup and scaffold (Vibe mode)  
1. Steering in .kiro/steering/ (Markdown with front matter):  
   - product.md (always): the product, its users (daily cash workers who may not read or own a phone, their  
     employers, NGO and union volunteers), the Resurrection story (§6.1), hard rules 5–8. End with  
     `#[[file:docs/BUILD_BRIEF.md]]`.  
   - tech.md (always): the stack and dependency rule; a Web Worker for the scanner; a hand-written service  
     worker; hash routing; localStorage wrapped in try/catch.  
   - structure.md (always): the folder layout (§6.11); pure logic in src/core and src/vision never imports  
     React or touches the DOM.  
   - testing.md (fileMatch src/core/**, src/vision/**, tests/**): property tests first; SF_RUNS; simulator  
     as oracle; outside the envelope a wrong reading must carry a warning or "unsure".  
   - i18n.md (fileMatch src/ui/**, src/i18n/**): short plain English strings, whole strings only (never glued  
     fragments), {0} placeholders.  
   - design.md (fileMatch src/ui/**): the tokens, navigation, motion and phone rules of §6.10.  
   - kiroween.md (manual): the submission requirements in §5.  
2. Agent hooks (create them with Kiro's Agent Hooks feature so they are saved in .kiro/hooks/):  
   - "Property tests on save": src/core or src/vision saved → run the related tests with SF_RUNS=10 and report.  
   - "i18n sync": src/ui saved → run `node scripts/extract-ui-strings.mjs && node scripts/check-ui-pack.mjs`  
     (until Phase 10 report "not yet available") and list new or missing strings.  
   - "Guard .kiro": .gitignore edited → make sure .kiro is never ignored.  
   - "Kiro log": a spec's tasks all done → append an entry to docs/KIRO_LOG.md.  
   - "Pre-submit audit" (manual): check every item in §5 and report pass or fail.  
3. MCP, free only, in .kiro/settings/mcp.json: a browser automation server (e.g. Playwright) for screenshots  
   and click-through checks at 1280px and 375px; GitHub (read-only is fine) for Actions and Pages status; a  
   fetch or docs server for library docs (jsQR, qrcode, Web Speech, MDN). Tell me which ones you enabled.  
4. Custom agents, if supported (e.g. .kiro/agents/): `scanner-reviewer` (reviews src/vision changes against  
   rule 5 and the property tests) and `translator` (fills src/i18n/ui/<lang>.json chunk by chunk, keeping {0},  
   names and numbers intact). If not supported, say so and skip.  
5. Powers: if Kiro Powers exist, suggest relevant free ones (React/Vite, testing) and install only what I approve.  
6. Scaffold: package.json (name stock-and-foil, "type":"module"; scripts dev=vite, build="tsc --noEmit && vite  
   build", preview, test="vitest run", test:watch="vitest", typecheck="tsc --noEmit"), a strict tsconfig,  
   vite.config.ts with base './', index.html, src/main.tsx, LICENSE (MIT, holder = the git user name),  
   .gitignore (node_modules, dist; never .kiro), a README stub, and docs/KIRO_LOG.md with a section per Kiro  
   feature (Specs, Steering, Hooks, MCP, Property-based tests, Custom agents, Powers, Spec vs vibe).  
   Run npm install, build and test.  
  
### Phase 1: spec `foundation` (app shell, design, navigation, loader, PWA)  
- Hash routes: #/home #/issue #/scan #/members #/crew #/story #/history #/ledger #/income #/punch #/demo #/lab  
  #/calibrate #/about #/settings. Scroll to the top on navigation; each page a placeholder for now.  
- Desktop header (≥1001px): one calm dark row.  
  - Left: the brand (logo §6.10, then "STOCK" above a dashed wavy line above "& FOIL" in red), then a thin divider.  
  - Then, evenly spaced, in this order: Home · New card · Members · [Payday scan] · Crew · Story · Records ▾ ·  
    More ▾. Payday scan is the red gradient button with a scan icon, near the middle of the row. Story is orange.  
  - Right: a bordered "Settings" button with a gear.  
  - Records ▾: History ("All scans: paid or yet to pay"), Ledger ("Receipts, saved cards, chain check"),  
    Income proof ("Certificate for a loan or rent").  
  - More ▾: Punch guide ("How to punch each day"), Demo ("The 4 vs 5 days story"), Test lab ("Simulate,  
    forge, stress-test"), Calibrate ("Tune to your paper and punch"), About & security ("How it is protected,  
    and its limits").  
  - Each dropdown item shows an icon tile, a bold title, the small hint and a chevron.  
  - A soft pill glides under the hovered item and returns to the active page, which also has a short red underline.  
  - Every nav item has a line icon. Arrow keys work in menus; Escape and outside clicks close them.  
  - 1001–1239px shows labels only (the scan icon stays). The row never overflows.  
- Phone (≤1000px):  
  - Header: the brand, a red square scan button with the scan icon, and a gear.  
  - Fixed bottom tab bar: Home · New card · Payday scan · Members · More (icons + labels). More opens a  
    slide-up sheet with every other page; a dimmed backdrop closes it.  
  - Safe-area insets and 16px gutters. No page ever scrolls sideways (overflow-x: clip as a safety net).  
- Light and dark themes from the §6.10 tokens, and the type rules.  
- Loader: an inline splash in index.html (inline CSS and script) shows an exact clone of the header brand, scaled  
  up in the centre of a dark screen, for at least 1500ms (?splash=<ms> overrides). It then flies onto the exact  
  rectangle of the header brand, which stays hidden until it lands (body.splashing), so the logo never appears  
  twice. It plays on every reload.  
- Ambient effects: drifting warm light, a faint field of punched holes, page-turn transitions, a ripple on button  
  press, scroll reveal (cards rise in, staggered), and pointer tilt for [data-tilt] (at most one style write per  
  frame, no blur). body.lite on (max-width:1000px), (pointer:coarse) turns heavy effects off; reduced motion  
  turns everything off.  
- A settings store with the §6.7 defaults, a toast, and an app context (settings, setSettings, lang, t(), toast,  
  startCard).  
- PWA: manifest, the icon.svg logo, and a service worker that caches the app shell for offline use.  
  
### Phase 2: spec `card-core` (pure logic)  
Implement src/core/prng.ts, card.ts, wave.ts, layout.ts, pairing.ts and homography.ts exactly as §6.2–§6.4.  
Properties:  
(1) encode→decode round-trips every spec, role and flag combination; editing any field makes codeOk false;  
(2) a card with no carry, halves or discs encodes to exactly the SF1 form, and old payloads still decode;  
(3) the wave is deterministic, within ±5mm and distinct per id;  
(4) amounts never exceed 2,000 major units, even for NaN or ±Infinity;  
(5) SHA-256 equals the NIST vectors and Node crypto;  
(6) an honest pair verifies; a fabricated partner, swapped roles, a foreign half or an edited tag never  
    verifies; one half's QR never reveals the other secret;  
(7) the homography recovers a random pose and inverts exactly.  
  
### Phase 3: spec `printable-card` (A4 sheet, New card, Members)  
- SVG sheet at true mm (§6.3): stock half, then the wavy cut line with ✂ and "cut here", then the foil half.  
  Each half shows:  
  - the title "STOCK · worker keeps" or "FOIL · employer keeps";  
  - worker, employer, month, wage, advance token value and card code;  
  - the 4 corner squares;  
  - the QR (qrcode, error correction M) with that half's payload;  
  - a Monday-first calendar of punch circles numbered by date;  
  - 10 advance-token circles labelled "Advance".  
  Half-day cards: two circles per date, with the legend "both = full day · one = half day".  
  Disc cards: a grey #9d9d9d disc in every circle, with the note "punch through the grey disc".  
- Print at 100% (print CSS hides the app chrome). "Download PDF" uses a tiny hand-written PDF writer embedding  
  the rendered sheet.  
- New card page:  
  - Fields: worker, employer, a custom month picker (not native), daily wage, advance token value, currency,  
    worker language.  
  - Switches: Pairing code (on), Half-day circles, Printed grey discs. Optional carried balance.  
  - Live sheet preview, Save, Print, PDF. Values above 2,000 snap back with a message.  
  - Editing a saved card creates a revised card (new id, cut and pairing; revisedFrom) that replaces the old one.  
- Members page:  
  - Roster: add, edit and remove members (name, employer, wage, advance, currency, language). A new wage applies  
    to future cards.  
  - Card counts all-time and for a chosen month. "New card" pre-fills the New card page.  
  - "Create N cards + one PDF" makes one unique card for every member without one that month (applying each  
    member's carried balance, halves and discs), saves them, and never duplicates on a re-run.  
- Properties: matching ignores case and never crosses employers; bulk creation makes exactly one card per  
  missing member with unique ids; re-running adds nothing; counts add up.  
  
### Phase 4: spec `photo-simulator` (src/render/scene.ts)  
- Renders one cut half the way a phone photo looks, as RGBA arrays, working in Node and the browser and  
  deterministic per seed (§6.5.7).  
- Conditions: rotation, perspective tilt, scale, blur, noise, uneven light, background brightness (dark cloth,  
  pale or white table), hole offset ("punched separately"), cut jitter ("sloppy cut"), and a different-cut forgery.  
- It returns the ground truth and powers the tests, Demo, Story and Test lab.  
- Include a print round-trip: rasterise the real SVG sheet, cut it on its wave, punch, photograph and scan it.  
  
### Phase 5: spec `vision-scanner` (src/vision/*, in a Web Worker)  
Implement the §6.5 pipeline and thresholds exactly, in src/vision/worker.ts, with a promise wrapper  
src/ui/scanAsync.ts so the UI never blocks.  
Properties:  
(1) inside the envelope, the punched set is recovered exactly;  
(2) outside it, every wrong reading carries a warning or "unsure";  
(3) disc cards read correctly on dark, pale and white surfaces; on an ambiguous surface every circle is  
    "unsure", never wrong;  
(4) far corner squares are found under strong perspective.  
Log every bug these properties catch.  
  
### Phase 6: spec `pair-and-pay` (src/core/wages.ts, src/vision/pair.ts, src/core/cash.ts)  
Implement §6.6 exactly: checks and their order, verdicts, edge matching, the punched-together alignment check,  
pay in three views, half-day weighting, mid-month wage change, carried balance, cash breakdown.  
Properties:  
(1) agreed = intersection and one-sided = symmetric difference; an extra or missing hole on one half is always  
    detected and never paid;  
(2) net pay is exact in every view (half days, carry and wage change included); with no change it equals  
    days×rate;  
(3) holes punched together are never flagged, even with a 1.2mm / 0.5° stacking error; a separately made hole  
    never passes; fewer than 4 shared holes means no judgement;  
(4) on simulated photos: a paired card verifies; a different cut doesn't matter when pairing is verified; a  
    half with the right id, code and cut but the wrong secret is rejected; legacy cards rely on the cut;  
(5) half-day cards: two circles = 1 day, one = ½ day, a one-sided circle is disputed;  
(6) cash notes plus the remainder equal the amount; combined crew cash is exact.  
  
### Phase 7: spec `payday-scan` (Scan page, Camera, Results, PaydayCard, PayBreakdown, Slip)  
- Two ways in:  
  - Open camera: rear camera, continuous focus and a 🔦 torch where supported, paused when the tab is hidden.  
  - Photos: choose both at once, or drag and drop. Uploads are read automatically.  
- Camera:  
  - Reads frames continuously in the worker, on downscaled frames.  
  - A half is captured automatically once it reads cleanly on 2 frames in a row; the camera stays open until  
    both halves are in.  
  - Live overlay: a canvas over the video, mapped through object-fit: contain, draws the card outline, its 4  
    corner squares and every circle (green ring = hole, dashed amber = unsure) with a soft pop-in.  
  - A viewfinder (green when good, amber on a warning) and status text.  
  - Spoken prompts in pictures-and-voice mode: worker half, employer half, move closer, more light, hold still,  
    done, show the whole half, surface too close to the grey.  
- Result:  
  - An animated payday card with a stamped verdict and its colour: genuine green; disputed or review amber;  
    mismatch red; unreliable or inconclusive grey.  
  - For a genuine pair, party pops burst over the WHOLE card, the totals count up, and the card tilts gently  
    without blurring.  
  - Breakdown "days × wage − advances ± carried = total", with full and half days shown separately.  
  - One-sided holes are listed by day and highlighted on both halves. Tap an unsure cell to correct it (marked  
    manual). The checks list shows its details.  
  - A "Wage changed this month" switch (from day X, new wage) with a clear badge.  
- Actions: 💰 Mark as paid, Add to crew, Print slip, Listen (read aloud), Explain (AI or offline), Carry this  
  balance to next month's card (when net is negative), Scan another.  
- With fewer than 3 corner squares on either half, the verdict is "Photo not reliable", and the slip and ledger  
  save are disabled.  
- Picture pay slip: suns for days (a half sun for a half day), advance coins, the notes to hand over (pictures of  
  notes) and the total, in the worker's language and printable.  
  
### Phase 8: spec `ledger-and-money`  
- Hash-chained receipts (§6.7). Ledger page: receipts, saved cards (reprint, edit, delete), "Check chain" with a  
  built-in tamper demo, CSV and JSON export and import.  
- Paid status: a `paid` receipt. A re-scan shows "Already paid on <date>" and warns if the amount now differs.  
- History page: every scan grouped by month, status chips Paid or Yet to pay, filters, a month picker, and totals  
  per currency. It stacks into cards on phones.  
- Carry-forward: a negative net is carried onto next month's card (SF2, locked into its code), only from the  
  previous month's latest scan, never from payment records.  
- Crew payroll: rows (name, agreed days, net, the notes per person), the total cash and the note mix to bring;  
  disputed amounts excluded; remove, clear, CSV, print.  
- Income proof: a one-page certificate (months, days, agreed pay, paid, totals, ledger head) with a QR, and a  
  verifier: paste a certificate and load a ledger export; inflated figures, invented months and edited or deleted  
  receipts all fail.  
- Properties: the chain breaks at the right place on any edit, removal or reorder; the latest payment wins and a  
  changed amount is flagged; certificates verify against their own ledger and fail on any tampering; history  
  totals add up.  
  
### Phase 9: spec `story-demo-lab` (Home, Story, Demo, Test lab, Calibrate, Punch guide, About)  
- Home:  
  - Kicker "CUT IT · PUNCH IT · PROVE IT"; title "The tally stick, back from the dead." (with "back from the dead."  
    in a warm accent); the lead paragraph from §6.1.  
  - Buttons: 🎃 See the story (primary, red) · ▶ 4-vs-5 days demo · + Make a card · 📷 Payday scan.  
  - Chips: Free · Works offline · No account · No server · The worker needs no phone.  
  - A 3D tally card whose halves part along a generated wave and tilt towards the pointer (stock with punched  
    day circles and a QR; foil below).  
  - "How it works": three steps (Print and cut · Punch both, daily · Scan on payday), and a QR to open the site  
    on a phone.  
- Story (full screen, dark, embers):  
  - The 9 chapters of §6.8. Chapters 4–7 run the REAL scanner on simulated photos live and show the verdict;  
    in chapter 7 the forged half BURNS.  
  - Chapter dots, ←/→ keys, ▶ play / ⏸ pause with auto-advance after the narration finishes.  
  - 🔊 narration via Web Speech (§6.9). The story language follows the app language, plus extra languages.  
  - A voice picker that prefers natural voices and warns when only a robotic voice exists; pace 0.6–1.2  
    (default 0.85, remembered).  
- Demo: scenario buttons running the real scanner on simulated photos, including "1 · 4 vs 5 days" (the claim),  
  an extra hole on one half, a forged cut, and "4 · A half day".  
- Test lab: simulator sliders; tamper buttons (extra hole, covered hole, forged cut, changed rate, foreign card);  
  a stress test (N random photos, success rate and failures); 🖨 Print round-trip.  
- Calibrate:  
  - Upload photos of really punched cards; it measures hole contrast, hole size and half-to-half alignment, and  
    suggests a punch threshold and tolerance.  
  - "Apply to this device" and "Reset to defaults"; nothing changes before Apply. Download the report.  
  - Property: the suggestion lies between punched and blank brightness, and it declines without data.  
- Punch guide: how to stack and punch daily, with a 3D punch animation.  
- About & security: every protection, plus the honest limits (§6.12).  
  
### Phase 10: spec `languages-and-voice`  
- Six UI languages: English, हिन्दी (hi), বাংলা (bn), தமிழ் (ta), Español (es), Kiswahili (sw). The single control  
  in Settings changes the WHOLE interface.  
- Runtime DOM translator (src/i18n/dom.ts, uiPack.ts):  
  - Packs are src/i18n/ui/<lang>.json (English → translation; {0} templates).  
  - A MutationObserver translates text nodes and placeholder, title, aria-label and alt attributes.  
  - It keeps each English original in WeakMaps, so switching languages is lossless.  
  - It skips [data-notranslate], script, style, textarea, pre and code.  
  - Dev helper: window.__sfUntranslated().  
- String tooling:  
  - scripts/extract-ui-strings.mjs (a TypeScript AST walk) builds src/i18n/ui/source.json.  
  - scripts/extra-strings.json lists the rest by hand (verdict words, formula templates).  
  - check-ui-pack.mjs and merge-ui-pack.mjs.  
  - A test fails if a pack misses a string or breaks a placeholder.  
  - Fill the packs with the translator agent, labelled "AI-drafted, native review recommended".  
- Slip, verdict and spoken-prompt dictionaries per language in src/i18n/index.ts. Story packs live in  
  src/i18n/story.ts (test: every chapter has text).  
- Speech: src/ai/speech.ts per §6.9.  
- Pictures-and-voice mode (Settings switch): body.simple with bigger pictures and buttons; a floating 🔊 Listen  
  button on every page that reads the page's main text; spoken scan prompts; the result as suns, notes and the  
  total, spoken automatically.  
  
### Phase 11: spec `optional-ai` (src/ai/index.ts)  
- Providers:  
  - Off.  
  - Built-in: Chrome's on-device Prompt API, when available.  
  - Custom: any OpenAI-compatible endpoint with the user's own free key. Presets: OpenRouter :free, Groq and  
    Gemini, labelled "unverified".  
- Uses: explain the pay result in the worker's language; translate the UI into extra languages.  
- Only anonymised numbers are sent. A deterministic offlineExplain always states the sum and the disputed days,  
  and every failure falls back to it.  
- Properties: the cloud prompt never contains names or ids; the offline text always contains the sum and the  
  disputed days; a failure falls back.  
  
### Phase 12: spec `phone-polish-and-deploy`  
- Phone checks:  
  - All 15 pages at 375px with the browser MCP: no sideways scroll, tap targets ≥44px, table dates never wrap  
    (white-space: nowrap).  
  - The camera stays smooth on mid-range phones (worker + downscaled frames).  
- Performance: no blur on hover, rAF-throttled tilt, heavy pages loaded lazily, background motion paused while  
  scrolling.  
- Deploy: a GitHub Actions workflow that builds and publishes dist/ to GitHub Pages on every push to main (HTTPS,  
  which the camera needs). Verify the live bundle is the new one.  
- README: the story, live link, video link, how it works, run, test, the features list and the property table,  
  the honest limits, a "Built with Kiro" section linking .kiro/, and the licences of jsQR (Apache-2.0) and  
  qrcode (MIT).  
- Also DEPLOY.md, and FIELD_TEST.md (a checklist for real paper, punches and phones).  
  
### Phase 13: submission kit (Vibe mode)  
From docs/KIRO_LOG.md and the specs, write:  
- docs/DEVPOST.md:  
  - problem, users, how it works, what is resurrected and why, the build, the limits;  
  - category Resurrection, and the bonus categories I name;  
  - this disclosure: "The concept and an earlier prototype existed before the hackathon; this repository is a  
    ground-up rebuild made with Kiro during the Submission Period, and no code was copied.";  
  - third-party licences.  
- docs/HOW_KIRO_WAS_USED.md, answering the judges' questions with concrete examples and numbers:  
  - Kiro surfaces used (IDE/CLI/Web/Crew) and how they differed;  
  - custom agents;  
  - each hook and what it automated;  
  - the spec structure, and spec vs vibe coding;  
  - the steering strategy;  
  - the MCP servers and what they enabled;  
  - the property tests and the real bugs they caught;  
  - the powers used.  
- docs/VIDEO_SCRIPT.md (≤2:45, real phone, real paper, royalty-free audio):  
  - 0:00 the 1834 fire;  
  - 0:15 the problem;  
  - 0:30 print, cut and punch;  
  - 1:00 the live payday scan with the overlay;  
  - 1:25 an extra hole and a perfect-fit forgery burned;  
  - 1:50 the pictures-and-voice result in Tamil or Hindi;  
  - 2:05 Kiro specs, hooks and property tests catching a bug;  
  - 2:35 close: "The tally sticks that burned Parliament have come back from the dead."  
- docs/BLOG_DRAFT.md (~1,200 words), stating it was written as part of the Kiroween 2026 hackathon.  
Then run the "Pre-submit audit" hook. Do NOT write my social media post.  
  
## 5. Submission requirements (the "Pre-submit audit" checks these)  
- A working public URL over HTTPS that works offline after the first visit.  
- A public GitHub repo with all source and instructions, and an MIT LICENSE that GitHub shows in the About section.  
- /.kiro at the repo root (specs, steering, hooks), never in .gitignore.  
- A demo video under 3 minutes, public on YouTube, showing the app on a phone, with no copyrighted music.  
- A text description and the "how Kiro was used" write-up, in English. Category: Resurrection.  
- Bonus prizes:  
  - Best Demo: automatic.  
  - Blog: published during the period, saying it is part of Kiroween 2026.  
  - Social Blitz: a post starting with #KiroweenHackathon26, which I write myself.  
  - Only if true: Ghost of Kiroween Past (2025 registration), Startup (founder), Student (whole team).  
  - Kiro Crew App: only as a separate new repo.  
- Deadline 4 Dec 2026, 2:00 pm PT. npm test and npm run build pass from a fresh clone.  
  
## 6. Reference: follow exactly  
  
### 6.1 The story  
- For about 700 years England's Exchequer kept accounts on split tally sticks: notched hazel split lengthwise.  
  The creditor kept the stock, the debtor the foil. A cheat would have to match wood grain nobody can copy.  
- In October 1834 the obsolete sticks were burned in the furnaces under the House of Lords. The chimneys caught  
  fire and the Houses of Parliament burned down.  
- Resurrected: millions of daily cash workers still get no record. Stock & Foil is a paper card cut in two along  
  a one-of-a-kind wavy line. The worker keeps the stock, the employer keeps the foil, both are punched together  
  every day, and on payday any phone verifies the pair and works out the pay. The worker needs no phone and  
  doesn't need to read.  
- Tagline: "The tally sticks that burned Parliament have come back from the dead."  
  
### 6.2 Card data and payload  
    type Role = 'S' | 'F'; // S = stock (worker keeps), F = foil (employer keeps)  
    interface CardSpec {  
      v: 1; id: string /* base32, 8 chars */; year: number; month: number /* 1-12 */;  
      rateMinor: number; advMinor: number /* integer minor units */; currency: string /* ISO 4217 */;  
      worker: string; employer: string /* cleanName: '|' and newlines → space, trim, max 18 */;  
      lang: string /* BCP-47 */; carryMinor: number /* 0 normally; negative = worker owes */;  
      pairing?: { sa: string; sf: string }; halves?: boolean; discs?: boolean; revisedFrom?: string;  
    }  
- Defaults: rate 50000 (₹500.00), advance 10000 (₹100.00), INR, en, carry 0. clampAmount rounds and caps to  
  0…200000 minor units (2,000 major); NaN → 0. A hand-typed carry is capped at ±100,000 major.  
- Base32 alphabet: 0123456789ABCDEFGHJKMNPQRSTVWXYZ (no I, L, O, U).  
- hash53 = cyrb53 (seeded 53-bit string hash); mulberry32 is the PRNG.  
- Card code: parts = [v,id,year,month,rateMinor,advMinor,currency,worker,employer,lang], then push 'c'+carry if  
  carry≠0, 'h2' if halves, 'd3' if discs. Join with |, take toBase32(hash53(s, 0x5f0), 6), and show it as  
  XXX-XXX.  
- Wave seed: hash53('wave:'+id) >>> 0.  
- Payload (fields joined by |):  
    SF1|role|id|yyyymm|rate|adv|cur|lang|code|worker|employer  
    SF2|role|id|yyyymm|rate|adv|cur|lang|carry|code|worker|employer        (when carry ≠ 0)  
  The version gets flags appended in this order: p (paired), h (half-day circles), d (discs), e.g. SF1phd.  
  Paired cards add secret|tag after the code, where secret is THIS half's secret (sa for S, sf for F). In the  
  payload the code has no hyphen.  
- Decode accepts ^SF([12])(p?)(h?)(d?)$, validates the role, yyyymm (month 1–12) and the numbers, and sets  
  codeOk = recomputed code equals the embedded code. The employer name may contain the rest of the fields.  
  
### 6.3 Physical layout (millimetres)  
- A4 portrait 210×297, margin 12. Each half's frame is 186×120. Frame to nominal cut: 12. Wave amplitude ±5.  
- Stock frame at (12,12). Nominal cut at sheet y = 12+120+12. Foil frame at (12, 12+120+24).  
- Fiducials: 7mm squares, inset 3, at the 4 frame corners.  
- QR: x 140, y 14, size 38.  
- Day grid: x 14, y 27, cells 16×11, 7 columns × 6 rows, Monday first. Punch centre = cell centre (+0.6mm in y).  
  With half-day circles: first half at centre −4.1mm in x, second half at +4.1mm.  
- Advance tokens: 10 cells, x = 14+(i−1)×11.2, y 99, size 11.2×11.  
- Hole radius 3mm (standard 6mm office punch). Sampling radius 1.6mm. Three paper reference points inside each  
  cell, near its corners, away from the punch, number and border.  
- Wave: 4 components, f = 1.2 + r·6.5, phase = r·2π, a = 0.4 + r·0.6; raw(x) = Σ a·sin(2π f x / 186 + p).  
  Normalise so the peak over x∈[−14,200] (step 0.5) is exactly 5mm. Stock edge y = 120+12+w(x); foil edge  
  y = w(x)−12.  
  
### 6.4 Pairing (cryptographic)  
- At issue: sa, sf are random 12-character base32 secrets. tag = the first 12 base32 characters of  
  SHA-256("SFPAIR1|id|sa|sf"). Both QRs carry the tag; each carries only its own secret. A valid secret or tag  
  is exactly 12 base32 characters.  
- Verify: hash(stock secret, foil secret) equals the tag and the ids are equal → 'verified'; anything else →  
  'failed'; a card with no pairing → 'legacy' (the cut decides).  
- A synchronous SHA-256 implementation, checked against the NIST vectors.  
- Honest limits: the issuer stored both secrets; anyone can copy their own half's QR. Neither lets someone invent  
  the other half.  
  
### 6.5 Scanner pipeline (per photo)  
1. QR search: jsQR repeated with masking, up to 2 hits. If none: denoise → unsharp → 2× upscale, escalating only  
   as needed. Corners stay in original image coordinates. Non-Stock & Foil QRs go to `foreign`.  
2. Pose: a homography frame-mm → image-px from the QR corners. Then find the corner-square blobs GLOBALLY (not  
   in a fixed window around the QR) and fit all 4 as a set to refine the pose. Report fiducialsFound (0–4),  
   fitError (px) and pxPerMm.  
3. Punch reading: ratio = centre luminance ÷ local paper luminance.  
   - Normal cards: punched when ratio < 0.62; uncertain in [0.48, 0.78].  
   - Disc cards: the intact disc ≈ 0.62 of the paper. Self-calibrate the grey as the median of ratios within  
     ±0.17 of 0.62. A hole when |ratio − grey| > 0.15; uncertain between 0.0825 and 0.15. Hole centres only for  
     holes darker than the grey (threshold = midpoint). If |bgRef/paperRef − grey| < 0.26, set  
     ambiguousSurface: every reading is uncertain, with a warning. On paired disc cards the cut edge is optional.  
   - For punched cells, record the hole centre offset (dx, dy mm), the radius, and `clipped`.  
4. Edge trace: sample the cut edge across the width (NaN where not found); report coverage.  
5. Warnings: partial capture, few fiducials, low contrast, "place on a dark plain surface" (normal cards).  
6. Supported envelope: about ±25° rotation, mild tilt, blur ≲1.3px at ~3.6px/mm, noise, uneven light, the whole  
   half in frame. Outside it, warn rather than guess.  
7. Simulator (scene.ts):  
   - Renders the frame, QR (error correction M), fiducials and circles.  
   - Discs: an intact disc fills the hole circle at 0.54 of paper brightness; printed sheets use grey #9d9d9d.  
   - Holes show the background, then the wavy cut edge with optional jitter.  
   - Applies rotation, perspective, scale, blur, noise, a light gradient and background brightness, all seeded.  
  
### 6.6 Pair verification and pay  
- Checks, in order (each: label, ok = true / false / null for unknown, detail):  
  1 Worker half (stock) found;  
  2 Employer half (foil) found;  
  3 Same card id;  
  4 Card code matches on both halves and equals the recomputed code;  
  5 Pairing code (verified / failed / legacy);  
  6 Wavy cut lines fit: when pairing is verified this is "extra evidence", and a mismatch gives ok = null,  
    never a rejection;  
  7 Every punch is on both halves;  
  8 Holes punched together (alignment);  
  9 Photos sharp and complete enough (the minimum fiducialsFound of the two halves ≥ 3).  
- Edge match:  
  - Use the points where both edges are finite. coverage = n/total; d = stock − foil; rms = std dev of d;  
    c = correlation of stock and foil.  
  - If coverage ≥ 0.4: match when rms ≤ 1.3 and c ≥ 0.8; mismatch when rms > 1.5 or c < 0.75; otherwise  
    inconclusive.  
  - score = clamp((c−0.3)/0.65) × clamp((2.5−rms)/2) × 100.  
- Alignment: pair the hole centres across the halves; with fewer than 4 shared, it is not checked. Otherwise fit a  
  rigid 2D transform (rotation + shift, least squares) LEAVING EACH HOLE OUT, and flag the hole when its residual  
  > 1.2mm (or the calibrated tolerance).  
- Verdict:  
  - pairOk = roles right AND same id AND codes OK AND pairing not failed AND (pairing verified OR edge not a  
    mismatch).  
  - The verdict is the first of these that applies: !poseOk && pairOk → unreliable; !pairOk → pair-mismatch;  
    not consistent → genuine-disputed; any alignment flag → review; edge inconclusive and the cut decides →  
    inconclusive; otherwise → genuine-consistent.  
- Comparison: each cell is both / none / stockOnly / foilOnly. Agreed = both. Consistent = no one-sided cells.  
- Pay:  
  - gross = round(days × rate); advances = count × advMinor; net = gross − advances + carry. Net may be negative  
    (carried forward).  
  - On half-day cards every circle weighs 0.5.  
  - Wage change {fromDay, rateMinor}: gross = round(daysBefore × rate + daysAfter × newRate).  
  - Three views: agreed, worker view (agreed + stock-only), employer view (agreed + foil-only).  
    Disputed = |worker net − employer net|.  
- Cash breakdown: greedy over the note denominations per currency:  
  INR 500/200/100/50/20/10/5/2/1; USD 100/50/20/10/5/1; EUR 200/100/50/20/10/5/2/1; GBP 50/20/10/5/2/1;  
  KES 1000/500/200/100/50/20/10/5/1; NGN 1000/500/200/100/50/20/10/5; BDT 1000/500/200/100/50/20/10/5/2/1;  
  PKR 5000/1000/500/100/50/20/10/5/2/1; NPR 1000/500/100/50/20/10/5/2/1; PHP 1000/500/200/100/50/20/10/5/1;  
  IDR 100000/50000/20000/10000/5000/2000/1000/500/200/100; MXN 1000/500/200/100/50/20/10/5/2/1;  
  BRL 200/100/50/20/10/5/2/1; ZAR 200/100/50/20/10/5/2/1; fallback 100/50/20/10/5/1.  
  Notes + remainder = the amount exactly.  
  
### 6.7 Storage, ledger, settings  
- Settings: { lang:'en', aiProvider:'builtin', aiNote:true,  
  customUrl:'https://openrouter.ai/api/v1/chat/completions',  
  customModel:'meta-llama/llama-3.3-70b-instruct:free', customKey:'', speakRate:0.9, simple:false,  
  calibration:{} }. All storage access is wrapped in try/catch.  
- Receipt: { seq, at, cardId, month 'yyyy-mm', worker, employer, verdict, agreedDays[], stockOnlyDays[],  
  foilOnlyDays[], agreedAdv, netMinor, disputedMinor, currency, rateChange?, halfUnits?, prev, hash }.  
  - hash = SHA-256 hex of the fields + prev. Optional fields go into the hash only when present.  
  - Paid receipts use verdict 'paid'.  
  - receiptDays = halfUnits/2 when present, else agreedDays.length.  
  - verifyChain returns the index of the first broken receipt.  
- Member: { id, name, employer, rateMinor, advMinor, currency, lang, createdAt }. A member owns a card when the  
  names and employers match, ignoring case.  
- Certificate: { v:1, worker, employer, currency, from, to, months:[{m, days, adv, net, h (8 hex), paid?}],  
  totalDays, totalNet, head (16 hex), at }. It counts the verdicts genuine-consistent, genuine-disputed, review  
  and inconclusive, up to 6 months.  
  
### 6.8 Pages and flows  
- Home: hero, buttons, chips, 3D tally card, three steps, phone QR. No picture tiles.  
- New card: form, switches, live preview, save, print, PDF, edit-as-revision.  
- Members: roster, counts, month picker, one-click card, bulk "Create N cards + one PDF".  
- Payday scan: camera or photos, live overlay, automatic capture, result card, breakdown, corrections, actions,  
  slip.  
- Crew: payroll sheet, notes per person, total cash and note mix, CSV, print.  
- Story 🎃 (9 chapters):  
  1 "1834 · The fire";  
  2 "Why a stick? It was split.";  
  3 "It comes back from the dead";  
  4 "The claim" (contractor says 4 days; the worker's half has 5 holes; a real scan proves the pair genuine);  
  5 "The sneaky hole" (an extra hole on one half only is shown and never paid);  
  6 "A sloppy cut? No problem." (the cut doesn't fit but the pairing secret proves the pair);  
  7 "The forgery that fits perfectly" (the cut fits but the secret is wrong: caught, and the forged half burns);  
  8 "Paid once. Only once.";  
  9 "Back from the dead".  
  Short labels: The fire, The split, Resurrection, The claim, Extra hole, Sloppy cut, The forgery, Paid, The end.  
  Narration, embers, voice picker, pace.  
- History: grouped by month, Paid or Yet to pay, totals.  
- Ledger: receipts, saved cards, chain check, tamper demo, export and import.  
- Income proof: certificate and verifier.  
- Punch guide: how to stack and punch daily, with a 3D demo.  
- Demo: scenarios, including the 4-vs-5 days story and "4 · A half day".  
- Test lab: simulator, tampering, stress test, print round-trip.  
- Calibrate: measure real photos, suggest settings, Apply and Reset.  
- About & security: protections and honest limits (§6.12).  
- Settings: Language (whole app), Pictures-and-voice mode, read-aloud speed, AI provider, calibration reset,  
  clear data.  
  
### 6.9 Languages and voice  
- The whole UI in en, hi, bn, ta, es, sw. The Story also has te, mr, fr, pt and ar (with RTL).  
- Packs are flat JSON {"English text": "translation"}; templates use {0}, {1}.  
- Speech:  
  - Sentence chunks of ≤170 characters, split at commas when longer; pauses of 650ms between paragraphs, 280ms  
    between sentences and 160ms after a comma.  
  - Voice scoring: exact language +30; neural, enhanced, premium or natural +40; Google +25; Siri +20; network  
    voices +6; robotic and novelty voices penalised.  
  - Marathi falls back to a Hindi voice. A voice that finishes impossibly fast twice is marked broken.  
  - A watchdog moves on if the engine hangs, and every live utterance is kept referenced (Chrome bug).  
  
### 6.10 Design  
- Light tokens: paper #f4ead2, card #fffaf0, ink #231f1a, line #cdbb8f, red #7a1f1f, green #1f7a4a,  
  amber #b36b00, bad #b3261e, radius 14px.  
- Dark tokens: paper #1b1712, card #2a231c, ink #f1e7d0, line #4a3f2e, red #d4574f, green #4cc38a,  
  amber #f0a43a, bad #ff7b72.  
- Type: serif body ('Iowan Old Style','Palatino Linotype',Palatino,'Noto Serif','Noto Sans Devanagari',Georgia);  
  UI controls and nav in system-ui sans; kickers uppercase, 0.14em tracking, red.  
- Header: dark, warm and calm. The Payday scan button is a red gradient (#e2584a → #b3321f), white text, a soft  
  red glow and a scan-frame icon. Story is orange (#e0832f). The active item has a sliding pill and a red  
  underline.  
- Logo (icon.svg, 96×96): a red rounded square (#7a1f1f, rx 20), a cream card split by a wave (#f4ead2 top,  
  #e6d6ad bottom), and three red punch dots on each half.  
- Motion: 3D card tilt (no blur on hover), stamped verdict, party pops over the result card, count-up, page  
  turns, embers in the Story. All of it respects reduced motion and is lighter on phones.  
- Phone: bottom tab bar, More sheet, 16px side gutters, no sideways scroll, dates never wrap.  
  
### 6.11 Folder layout  
    src/core     prng, card, wave, layout, pairing, wages, cash, members, history, settlement, homography  
    src/vision   image ops, detect (QR, pose, punches, edge), pair (edge match, alignment, verify), calibrate, worker  
    src/render   sheet (SVG), pdf, scene (photo simulator)  
    src/ai       index (providers, anonymised facts, offline explain), speech  
    src/store    index (settings, cards, ledger, crew, members), certificate  
    src/i18n     index (slip, voice and prompt dictionaries), story, dom (translator), uiPack, ui/<lang>.json  
    src/ui       App, ctx, fx, splash, scanAsync, imageIO, sim, components/*, pages/*, styles.css  
    tests        property-based tests, one file per area  
    scripts      extract-ui-strings, extra-strings.json, check-ui-pack, merge-ui-pack  
    public       icon.svg, manifest.webmanifest, sw.js  
    .kiro        specs, steering, hooks (+ settings/mcp.json, agents if used)  
    docs         BUILD_BRIEF.md, KIRO_LOG.md, DEVPOST.md, HOW_KIRO_WAS_USED.md, VIDEO_SCRIPT.md, BLOG_DRAFT.md  
  
### 6.12 Honest limits (show in About and the README)  
- One person holding BOTH halves can punch both. The protocol assumes each side keeps their own half; use a  
  witness for disputes.  
- Pairing proves the halves were issued together. The issuer could reprint either half, and anyone can copy their  
  own half's QR.  
- The 1.2mm punched-together tolerance and the scanner thresholds come from the simulator. Field-test them with  
  real paper, punches and phones (Calibrate exists for this).  
- Translations are AI-drafted and need native-speaker review.  
- The supported capture envelope is §6.5.6. Outside it the app warns instead of guessing.
