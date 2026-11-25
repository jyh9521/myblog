# Article return continuity

**Goal:** Preserve the working list scroll restoration and forward cover transition;
repair the abrupt reverse transition on browser Back, desktop and touch.

**Architecture:** Keep Next navigation/history ownership and the existing native
forward View Transition. Capture only the outgoing visible cover before the
history commit, then use a pointer-transparent compositor overlay and the existing
M3 spring to reunite it with the matching list cover after restoration settles.
No new dependency, history-state metadata, scroll writes, or full-page snapshot.

**Implementation / verification sequence**
- [x] Reproduce with a real exported build: correct list position, zero reverse moving frames.
- [x] Isolate the cover bridge in `app/article-return-motion.ts`; connect only history returns in `app/motion-provider.tsx`.
- [ ] Test cancellation, crop aspect ratio, missing/offscreen covers, reduced motion and native gesture ownership.
- [ ] Check desktop/touch Chromium, Firefox and WebKit, existing forward capture and game-shelf position tests.
- [ ] Inspect an actual CDP trace and recorded mobile return; run build/content/unit validation and review.
- [ ] Package hashes/diff/independent-copy rollback evidence, commit, push, deploy and verify live.

The user's corrected report explicitly excludes scroll restoration from the bug.
The implementation must not change link destinations, archive filters or saved positions.
