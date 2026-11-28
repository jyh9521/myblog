# Content experience completion

**Goal:** Complete the five requested improvements without duplicating the latest main branch's search, reading tools or publishing recovery UI.

**Architecture:** Keep Next.js static export and existing Cloudflare deployment. Public indexes use explicit field allowlists. Editorial topics live in versioned JSON. Maintenance output contains public content findings and aggregate backup status only; backup files remain local/private.

**Constraints:** Preserve the original checkout and its uncommitted edits. No new reader accounts. No automatic scroll restoration. Spoiler events require explicit opt-in. Never expose protected/unlisted articles in new public indexes. Do not automatically modify or delete cloud data.

## Tasks
- [x] Search: test linked-game aliases on articles; add separately downloaded opt-in event index and anchored results, with query URL state and error recovery; spoiler consent is not inherited from links.
- [x] Topics: validate explicit ordered article/game/timeline references; render index/details; seed useful topics from existing content; expose CMS editing and navigation.
- [x] Reading: retain existing preferences/resume/mobile TOC/revision code; add copy links for individual paragraphs; test stable IDs and browser behavior.
- [x] Maintenance: generate public-content issue report with article-level links, show actionable dashboard alongside existing deployment status; add versioned Git/R2/D1 snapshot manifest and verified empty-directory restore, corruption/traversal tests and a synthetic full recovery drill.
- [x] Regression: pin browser test dependency, run real CMS Markdown/rich-text/save/reopen against an isolated local backend; exercise existing auth/conflict/upload failure tests and existing reading/search/publishing browser suites; wire deterministic browser tests into CI.

## Review focus
- Protected article titles/bodies and spoiler text must not leak through default search or public reports.
- Incorrect editorial references must fail validation rather than silently disappear.
- Copy controls must not nest buttons inside links or interfere with images/custom cards.
- A partial backup is not a verified full production backup; changed checksums must stop restore before writing.
- Browser fixtures must never send writes to GitHub or production storage.

## Evidence
Run npm test, npm run check, npm run validate, npm run build, browser regression and rollback in a separate copy. Commit/push only the isolated development branch; fast-forward main after rechecking remote state, then verify Actions and live release hashes.

## Execution ledger
- Baseline: origin/main b37c793 already supplies search, reading preferences, resume, mobile TOC, revision labels and local CMS draft recovery; these are retained and tested rather than rebuilt.
- Isolation: independent clone, not a shared checkout; original working edits remain untouched.

- Review: independent reviewer found event-keyboard navigation and reference/attachment health coverage gaps; both received reproducing tests and fixes.
- Integration: event anchors now reuse the actual chronology-prefixed DOM IDs; the browser test follows a real event into its timeline.
- Recovery: fixture Git bundle clone, R2 byte equality and SQLite SQL import/query passed. Production cloud backup completeness and business recovery remain unverified and are visibly distinguished.
- Delivery: follow established blog workflow (commit, push, deploy, live hashes); no extra publishing confirmation requested.
