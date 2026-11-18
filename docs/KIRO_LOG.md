# Kiro log

A running record of how Kiro was used to build Stock & Foil. Each phase adds a dated entry: what was built, the Kiro
features used, the bugs the property tests caught, and screenshots.

## Specs

Phases 1 to 12 each get a spec in `.kiro/specs/<phase-name>/` (requirements.md, design.md, tasks.md).

## Steering

- Always: product.md, tech.md, structure.md
- fileMatch: testing.md (src/core, src/vision, tests), i18n.md (src/ui, src/i18n), design.md (src/ui)
- Manual: kiroween.md

## Hooks

- Property tests on save (src/core, src/vision)
- i18n sync (src/ui)
- Guard .kiro (.gitignore)
- Kiro log (after a spec's tasks finish)
- Pre-submit audit (manual)

## MCP

Planned: Playwright (screenshots at 1280px and 375px), GitHub read-only (Actions and Pages status), fetch (library docs).
See Phase 0 entry for what is enabled.

## Property-based tests

fast-check with the SF_RUNS env var (default 15). Bugs found by the properties are recorded here with shrunk counterexamples.

## Custom agents

- scanner-reviewer
- translator

## Powers

None installed yet.

## Spec vs vibe

Phase 0 is vibe mode (setup and scaffold). Phases 1 to 12 are spec-driven.

---

## 2026-11-18 · Phase 0 · Kiro setup and scaffold (Vibe mode)

- Built: docs/BUILD_BRIEF.md (the full brief), 7 steering files, 5 hooks, 2 custom agents, scaffold (Vite, React,
  strict TypeScript, Vitest, fast-check), LICENSE, README stub, icon.svg.
- Kiro features used: steering (always, fileMatch, manual), agent hooks, custom agents, vibe mode.
- Property tests: only a smoke test that checks SF_RUNS wiring. No bugs yet.
- Screenshots: none (no real screens until Phase 1).
- Open item: `.kiro/settings/mcp.json` could not be written by the agent (blocked by a permission rule). The intended
  config is in docs/mcp.proposed.json.
