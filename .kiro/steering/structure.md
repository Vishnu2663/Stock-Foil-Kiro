---
inclusion: always
---
# Folder layout

    src/core     prng, card, wave, layout, pairing, wages, cash, members, history, settlement, homography
    src/vision   image ops, detect (QR, pose, punches, edge), pair (edge match, alignment, verify), calibrate, worker
    src/render   sheet (SVG), pdf, scene (photo simulator)
    src/ai       index (providers, anonymised facts, offline explain), speech
    src/store    index (settings, cards, ledger, crew, members), certificate
    src/i18n     index (slip, voice and prompt dictionaries), story, dom (translator), uiPack, ui/<lang>.json
    src/ui       App, ctx, fx, splash, scanAsync, imageIO, sim, components/*, pages/*, styles.css
    tests        property-based tests, one file per area
    scripts      extract-ui-strings, extra-strings.json, check-ui-pack, m    scripts      extract-ui-strings, extra-strings.json, check-ui-pack, m    scripts      extract-ui-strings, extra-strings.json, check-ui-pack, m    scripts      extract-ui-stLOG.md, DEVPOST.md, HOW_KIRO_WAS_USED.md, VIDEO_SCRIPT.md, BLOG_DRAFT.md

## Purity rule
Pure logic in src/core and src/vision never imports React and never touches the DOM (no document, window,
localStorage). Vision code works on plain RGBA arrays so it runs in Node tests and in the Web Worker.
