# Content-first home — approved direction A

**Goal:** Replace the oversized welcome hero with a compact identity line, one
latest covered article, three recent updates, a non-duplicating article feed and real
game/timeline previews. Preserve red Material 3 identity and existing motion.

**Architecture:** Static/server-rendered Next page and a pure tested content selector.
Per the user's correction, the lead is the latest published public article with
a configured cover, never an editorial pick; updates do not change that choice.
Home-only stylesheet; reuse existing card
and cover hooks. Article search reuses the archive via a GET query, not a second
search engine. No new production dependencies or new navigation framework.

**Acceptance:** 1440×900 shows one feature plus three updates; 390×844 shows a
complete first title/description and the next content choice. 360px has no
horizontal overflow. Light/dark, no JS, keyboard, reduced motion and cover
navigation remain functional. No duplicated articles across home sections;
password/unlisted content never becomes a hero or leaks private text.

## Work / evidence
1. Preserve originals, capture current fold metrics and failing browser/data tests.
2. Implement independently tested automatic cover selection, layout
   and home-only responsive styling. Keep source markers on navigable covers.
3. Update selector-sensitive existing motion checks, not their contracts. Test
   actual browser input, home search, archive return and fast history traversal.
4. Inspect desktop/mobile screenshots and actual CDP metrics; run unit/type/build/
   content checks and independent review. Adjust density without shrinking hit areas.
5. Package hashes/diff/independent rollback, remove own disposable fixtures, commit,
   push, wait for deployment and verify the live release and interactions.

## Review focus
- Very long titles, small/empty content sets and absent eligible cover.
- Updates sort by genuine dates; no random recommendation presented as new work.
- Article-search URL preserves Next history metadata and tag state.
- Feature image crops and reverse transition map to the actual visible frame.
- Home-only CSS must not change archive cards, article covers or unrelated routes.
