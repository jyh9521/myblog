# Blog publishing and reading experience implementation plan

> **For agentic workers:** Use subagent-driven-development to implement independent tasks; the owner integrates, reviews, verifies and publishes.

**Goal:** Deliver all five user-approved improvements without replacing the current Material 3 identity or existing content.

**Architecture:** Extend the existing static Next.js site and locally hosted Sveltia integration. Keep search build-generated and public-only; reuse native dialogs and existing spring motion. Read existing CMS draft backups rather than introducing another competing autosave mechanism.

**Tech Stack:** Next.js 15, React 18, TypeScript, plain browser JavaScript, IndexedDB, node:test, Playwright.

**Spec:** The approved design is recorded below.

## Approved design and constraints

- Publishing: show local backup, repository commit, primary publication and fallback publication separately. A successful API write is not proof of live deployment. Preserve conflicts and remote errors. Export/import complete local drafts including pending file bytes; never export credentials.
- Search: a single public article/game/timeline index, grouped results, aliases, keyboard shortcut and mobile full-screen presentation. No private article body or unlisted content in the index. Keep existing archive search URLs working.
- Reading: mobile bottom-sheet table of contents, opt-in resume prompt and remembered font/line spacing presets. Existing native Back restoration wins over resume; never jump automatically. Preferences and storage failure must not prevent reading.
- Updates: consistent published/updated dates and authored revision notes. Organize patch articles' actual platform/version/download information without inventing missing metadata or rewriting original content.
- Interaction: reserved image geometry, loading/failure feedback, accessible copy/share/download feedback, dialog focus/scroll restoration and browser Back closes overlays before navigating. No new animation framework or unrelated features.
- Retain red Material 3 design, current homepage latest-covered-article selection, shared-cover forward/reverse transitions, SEO, reduced-motion behavior, touch accessibility and static hosting.
- Do not alter user content or submit an editor draft to production as a test. Live read-back and isolated browser fixtures must be reported distinctly.

## Review focus

1. Protected/unlisted content and draft credentials never enter public search/export.
2. Rapid open/close/Back does not corrupt Next history or steal focus.
3. IndexedDB drafts with Blob/File/Map/typed data round-trip; malformed imports leave existing drafts untouched.
4. A failing fallback or stale success never appears as a fresh primary deployment success.
5. Reduced motion, unavailable storage, narrow mobile and failed network remain usable.

## Tasks

- [ ] **Baseline:** archive HEAD and record hashes; run the complete current test suite.
- [ ] **Publishing / draft safety:** own `public/sveltia/publishing-*`, integration tags and focused tests; inspect existing hooks first, add failing tests, implement, rerun. Preserve fixed CMS build and existing article save contract.
- [ ] **Unified search:** own `app/search/*`, `lib/site-search*`, `app/site-search-*`, scoped styles and tests; integrate one header trigger and preserve archive route. Test public filtering, aliases, grouped results and keyboard/mobile use.
- [ ] **Reading:** own `app/posts/reading-*`, `lib/reading-*`, post-content integration and tests. Test clamped preferences, resume opt-in, URL anchors/history, and mobile TOC.
- [ ] **Updates / interactions:** owner implements shared revision display, patch resource summary using existing metadata, image loading states, share fallback feedback and overlay history utility. Add focused regression tests before implementation.
- [ ] **Integration:** typecheck, full tests, content validation, static build. Run Playwright on Chromium/Firefox/WebKit, desktop/mobile/reduced motion and real CDP profiling; review screenshots and regression traces.
- [ ] **Review / rollback:** independent source review, modified archive/diff, baseline and rollback-copy checks. Reopen every evidence artifact.
- [ ] **Release:** commit/push without force, follow Actions, verify primary release SHA and changed static resources. Record fallback status separately. Update user documentation and verification with observed results only.

## Execution notes

- Existing isolated checkout: `codex/motion-release`, baseline `eaf2e400128fd869bd7ba8ba2dfa60ee7ac5c9ca`.
- Evidence and rollback files live under ignored `reports/experience-20261128/`; this plan and the user guide are committed.
- User approved all proposed changes and continuous execution; no additional design approval gate.

- Remote main advanced with two user game-entry saves; fast-forwarded to `ab9bcbd847bc26aa44b29fd60501a6b83f252ca5` without conflicts. Release rollback baseline includes these content edits.
- User correction: remove the duplicate homepage search form; keep one global header search. Search and theme controls share the brand row on mobile, with navigation on the next row.
