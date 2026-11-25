# Expressive Motion System

## Scope and architecture

The site retains Next.js static export, React 18, its existing Material 3 Expressive palette, layout, content and data features. No production dependency was added. `lib/motion.ts` is the single token/physics source; `scripts/build-motion-tokens.cjs` emits `app/motion-tokens.css`. Run the generator after changing tokens and `--check` in validation. Do not hand-edit generated CSS.

Three layers share the same intent:

1. Exact damped oscillator integration in a single requestAnimationFrame loop for pointer and keyboard press/release, and card hover. Retargeting retains position and velocity, including reversals; the loop stops when idle and writes individual scale/translate properties, not layout.
2. Compositor-owned WAAPI samples of that oscillator for one-shot viewport entry. IntersectionObserver watches newly inserted card subtrees, never article paragraphs. Batch delays are bounded, and `fill: backwards` prevents a visible-before-delay flash. Server HTML is visible before hydration and with JavaScript disabled.
3. Native same-document View Transitions only for the selected shared cover around Next router commits. Root and header never participate in snapshots. A persistent coordinator owns the optional capture, a 180ms commit budget, rapid navigation generations, focus and cleanup. Slow captures are skipped while routing continues. Ordinary routes, browser history and API-less engines use live WAAPI content arrival; theme changes use live palette transitions rather than input-blocking snapshots.

## Tokens

The physics values follow [AndroidX ExpressiveMotionTokens v0_14_0](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExpressiveMotionTokens.kt). These are damping **ratios**, not damping coefficients; mass is 1, so coefficient `c = 2 × ratio × sqrt(stiffness)`.

| Family | Fast | Default | Slow |
| --- | --- | --- | --- |
| Spatial stiffness | 800 | 380 | 200 |
| Spatial damping ratio | 0.6 | 0.8 | 0.8 |
| Effects stiffness | 3800 | 1600 | 800 |
| Effects damping ratio | 1 | 1 | 1 |

Spatial motion can overshoot; opacity/effects are critically damped. Generic CSS fallback durations are 160/260/420ms, standard easing `cubic-bezier(.2,0,0,1)`, exit easing `cubic-bezier(.3,0,1,1)`. Spring samples cover 600ms; the live physical loop settles by displacement < .001 and velocity < .01. These web duration/stagger choices are project adaptations, not claimed official Android tokens. Stagger is 35ms, capped at 140ms. Controls lift 2px/expand 1.2% on fine-pointer hover and compress 3.5% on press; cards lift 4px and compress .8%; reveals translate 12px. There are no infinite decorative loops or `transition: all` additions.

## Existing implementation and reference audit

The original blog combined scattered .18–.38s transitions, an approximate hand-authored `linear()` spring, document-only page transition CSS and mixed anchor/Next Link navigation. Reading progress updated React state and width on every scroll; the cover combined a RAF transform writer, CSS transition and permanent will-change.

The [reference site](https://kcglms-plus.vercel.app/) was inspected in Chromium, including its actual served page JavaScript, stylesheet and active animations, rather than inferred from screenshots. Its page chunk `app/page-26c396a3016f6878.js` implements `.reveal` with IntersectionObserver threshold .12, then disconnects. CSS uses a 36px translate, .9s transition and `--delay`. A mousemove handler batches CSS `--mx`/`--my` writes through RAF. Active keyframes include fade-up, draw, rise/fall, spin, marquee and sway, with some multi-second hero delays and indefinite loops. No spring engine was identified in that page chunk. The blog adopts hierarchy and bounded sequencing, not those decorative loops or the reference palette.

REA observation identity: `ev_2497cdbaf6c3424d8448923d409b7bce01906a5735960f3ea026489bb22697ef`; raw reference analysis and screenshots are retained in the task evidence directory outside this repository.

## Component policy

- Navigation: preserve modified clicks, download attributes, external links, hashes and query-driven filters. Admin/backend destinations are never intercepted. Persistent header remains still; selected navigation is marked with aria-current.
- Cards and covers: one shared cover from card/featured image to article and back. No parallax on reading text. Card hover is fine-pointer-only; touch gets press feedback without sticky hover zoom.
- Search, tags, buttons and game controls: shared color/shape timings; real spring press/release; clear focus-visible rings.
- Article directory: this site has a mobile TOC disclosure, not a separate global drawer. Its icon/opacity/translation animate; the single bounded grid-row transition intentionally reflows following text, with no JS height measurements. Desktop layout remains unchanged.
- Dialogs: article and compact game-timeline galleries retain content through a critically damped exit, accept quick reopen, trap Tab and restore the opener after React commit focus restoration. Closing dialogs are inert and aria-hidden immediately.
- Reading: progress uses transform scaleX with geometry cached by ResizeObserver/resize; scroll events coalesce into one RAF. Back-to-top stays mounted and fades/slides without an entrance layout shift. Existing simultaneous CSS/JS cover parallax was removed.
- Theme: pre-paint preference bootstrap prevents the saved-theme flash; generation checks make rapid toggles latest-intent wins. Storage exceptions do not break controls.

## Accessibility and lifecycle

`prefers-reduced-motion` is checked before snapshots/animations and observed at runtime. A change cancels active pointer, reveal, route and presence motion. CSS disables transitions and transforms where needed, while keeping reading progress informative and content visible. No forced smooth scroll under reduced motion. Focus states remain visible. No per-element permanent will-change promotion is added.

## Reproducing verification

```sh
node --test scripts/motion.test.cjs
node scripts/build-motion-tokens.cjs --check
npm test
npm run check
npm run validate
npm run build
node scripts/serve-motion-test.cjs
# A separately installed Playwright supplies the browsers; no runtime dependency.
node scripts/motion-browser.cjs
node scripts/motion-profile.cjs modified
```

Set `NODE_PATH` to the Playwright installation if it is not installed in the project; optionally set `CHROMIUM_PATH` and `PLAYWRIGHT_BROWSERS_PATH`. `MOTION_ORIGIN`, `MOTION_OUTPUT` and `MOTION_ENGINES` configure browser checks. The local static server mirrors the existing separate public `/uploads/` route with a read-only proxy; missing R2 media must not be treated as a passing cover transition. The profiler emits a real CDP trace loadable in DevTools Performance, plus layout/style/script/paint/RAF/CLS measurements.

Browser tests cover shared snapshots, route focus, search and tags, quick theme toggles, rapid routes/back, live reduced motion, no View Transition API, touch TOC, gallery reversal/focus and no-JavaScript content. Mathematical tests compare identical elapsed time at 60/120/144Hz. WebKit on Windows is Safari-engine coverage, not physical Safari/iOS acceptance; headless RAF numbers are host measurements, not proof of hardware refresh-rate performance.

## Maintenance prompt

```text
Extend this component using lib/motion.ts and app/motion.css. Preserve server HTML,
layout and existing semantics. Choose spatial vs effects deliberately; avoid a
second animation engine and transition:all. Prove retargeting, runtime reduced
motion and keyboard/touch behavior in scripts/motion-browser.cjs, and compare a
production CDP trace before and after changing scroll or page transition paths.
```

## Initial rollout results (historical, 2026-11-25)

- Full local suite: 458 tests pass (275 source/CMS, 61 counter, 93 gaming accounts, 29 static preview). Baseline: 454 tests. Type check, content validation and production export pass; 237 static pages in this local content snapshot. Shared first-load JS remains 103kB; the homepage first-load total changes from 108kB to 110kB.
- Playwright: Chromium 159, Firefox 153 and WebKit 26.5 pass desktop/mobile touch, snapshot pairing, live reduced-motion, reversal, focus, search, route and no-JS checks. WebKit required explicit trigger-based focus restoration because pointer activation does not necessarily focus a button.
- Same-host sequential production profiling, 1440×1000, same article, 2.4s RAF scroll: LayoutCount **269 → 1**, layout time **41.4 → 0.682ms**, script time **176.5 → 70.6ms**, task time **613.6 → 320.1ms**. These are one controlled run, not universal device guarantees.
- Whole scenario including six animated theme toggles: layouts **297 → 46**, P95 frame interval **8.5 → 8.5ms**, CLS **0 → 0**. Theme snapshot animation adds rendering work: paint events **458 → 885**, style time **113.9 → 135.6ms**, total task time **818.3 → 856.8ms**. This is an explicit cost of the new theme crossfade, not a claimed across-the-board performance improvement. There is no ongoing idle loop after settlement.
- Independent review reproduced and drove fixes for stagger-delay flashing, live reduced-motion cancellation and React commit focus restoration. Each was rerun in actual browsers. Final traces are `baseline-final-trace.json` and `modified-final-trace.json` in the external evidence directory.

## Rollback

Revert the dedicated motion commit, not unrelated content/editor commits. The task evidence additionally contains original SHA256 hashes, a changed-file bundle, unified diff and executable rollback script. That script restores only enumerated changed files in a caller-selected copy after verifying their modified hashes; it never resets the repository or cleans user files.

## Continuous native-style interaction revision

The earlier quick-button fix removed abrupt legacy shadows but only provided a
small, fast tint fade. That did not satisfy the user's perceptual goal. The revised
model coordinates spatial response, tint and soft elevation rather than claiming
that endpoint assertions or absence of reflow prove a native-quality feel.

- `createInteraction`, `stepInteraction`, `interactionVisuals` and
  `interactionSettled` in `lib/motion.ts` model four independent channels: hover
  spatial, press spatial, hover effects and press effects. Their velocities persist
  through retargeting. Hover uses default spatial/slow effects, while press uses
  fast spatial/fast effects. Press suppresses hover lift and elevation; release
  returns to the still-active hover target instead of restarting from rest.
- Controls use one tint and one constant-geometry shadow pseudo-layer. Ready-state
  opacity is driven by the effects channels, with no competing CSS tween. Each
  control/card initializes its own variables so parent hover cannot leak into a
  nested or disabled button. Cards use a bounded neutral shadow alpha; this may
  repaint the hovered card, unlike compositor-only control opacity. It is not
  advertised as paint-free.
- The runtime handles mouse, primary touch, pointer cancellation, window blur,
  disabled/ARIA-disabled changes, DOM removal and live reduced-motion changes.
  Space on an anchor retains its native scroll semantics. Text and native inputs
  do not get blanket displacement. No perpetual RAF remains after settlement.
- Existing layout transforms are preserved. In particular, the lightbox arrows'
  `translateY(-50%)` must never be replaced by a blanket button hover override.
- Routes have a distinct 12px spring arrival while the live header stays still.
  During a shared-cover transition, the surrounding text only fades so its parent
  transform cannot disturb the cover's destination geometry. Ordinary routes and
  API-less engines retain SPA navigation. Theme colors interpolate on live surfaces,
  not in a whole-document snapshot that suppresses pointer hit testing.
  Dialogs separately animate opacity and a 4%/20px panel arrival, retaining the
  existing inert exit, focus trap, focus restoration and interruption handling.
- Reading progress marks its range dirty in ResizeObserver, then measures once
  in the next RAF before painting. Reading scrollHeight inside observer delivery
  caused a reproducible WebKit resize-loop error during shared-cover navigation.
  Scrolling alone still reuses the cached range rather than forcing layout.

Verification additionally runs `node scripts/native-motion-browser.cjs`, which
records real interaction video and frame samples. `--capture-only` skips final
perceptual assertions for recording a comparison build. Blue pointer markers and
the nested-control fixture exist only in the test recording, not the site. The
regular three-engine `motion-browser.cjs`, hero/quick regressions and production
profiler remain required. These checks are evidence of implemented behavior;
Pixel/iPhone hardware equivalence and personal visual acceptance are not asserted.

The profiler now uses six fixed-hit-point mouse clicks with 70ms spacing, verifies
that all six actually reach the theme control, and records the interaction elapsed
time. `locator.click()` silently waits for stable animated bounds and therefore
cannot be used to compare a fixed-rate input scenario across motion models. The
old full-document capture dropped physical clicks even though programmatic
`button.click()` checks passed. The capture behavior is specified in
[CSS View Transitions hit testing](https://www.w3.org/TR/css-view-transitions-1/#lifecycle).

Sources: [Material motion](https://m3.material.io/styles/motion),
[Android interruptible spring guidance](https://developer.android.com/develop/ui/compose/animation/quick-guide?hl=en).

### Revision validation (2026-11-25)

- 480 automated tests pass (297 source, 61 counter, 93 gaming accounts, 29
  static preview); type check, content validation and 358-page production export
  pass. No new runtime dependency; shared first-load JavaScript remains 102 kB.
- Chromium, Firefox and WebKit pass the full route/shared-cover, native rapid
  input, dialog, reduced-motion, touch and no-JavaScript suite. All three also
  pass the focused hero and three quick-link frame-sampling checks. NS audio
  pause, repeat navigation and history lifecycle checks pass.
- The native-motion recording exercises actual hover, press, release, rapid
  reversal and settlement. Independent review also verified the delayed capture
  deadline/navigation regression and the deferred reading-progress measurement.
- CDP traces and the visible demo are retained in the local revision evidence.
  The previous live snapshot implementation delivered only 2 of 6 rapid theme
  clicks; the revision delivers all 6. Total scenario CPU time is not an equal-work
  comparison when the old version discards four interactions. Scroll frame
  intervals are host samples, not an iPhone/Pixel or high-refresh-device guarantee.

## Public-route and touch follow-up

The route matrix covers all nine public templates: home, post directory, article,
game directory, game dossier, timeline directory, chronology, about and NS. Browser
checks visit a real representative of each template rather than claiming all 358
generated URLs have individually received visual acceptance. Content validation and
the production export still cover the complete static corpus.

The audit found instant native chronology disclosures/dialogs and unintended image
changes from diagonal/cancelled touch gestures. Existing card springs, SPA routes,
shared covers, mobile TOC, game selectors and NS media behavior are retained, not
replaced with another engine. Native select/audio UI remains browser-owned.

- `MotionDetails` preserves real `details`/`summary`, SSR content and no-JS behavior.
  One height/effects spring preserves momentum on reversal. Natural content is
  observed only while expanded; size reads happen on changes, not every frame.
  Height changes intentionally reflow that disclosure and following content. The
  clip returns to automatic height when settled. Closed native content is not inert:
  browser find-in-page must still find and open it. Only the closing interval is inert.
  Dynamic resizing also snaps under reduced motion. Pre-hydration native opening
  is respected rather than overwritten by a default prop.
- `MotionDialog` retains native top-layer modality, focus containment and scrolling
  lock through entry/exit. A node-identity close token handles Chromium's queued
  close event after unmount; counters can swallow a later real native close. Escape,
  explicit close, native close, interruption and removal restore scrolling/focus.
  The backdrop follows the same effects channel. Touch dialogs use the full viewport
  without a reserved desktop scrollbar strip; desktop gutter stays stable.
- Coarse-pointer summaries have 44px minimum hit height (the audited original was
  19px). Article gallery swipes require more than 48px movement and a horizontal
  component greater than 1.25 times the vertical component. Cancellation, multitouch
  and gestures originating on controls do not advance the image.
- History arrivals retain the fade but omit the 12px spatial arrival. In the
  audited touch game-shelf flow that parent transform was included in saved-scroll
  correction, leaving the card 12px above its original position after settling.
  `scripts/motion-history-browser.cjs` measures the actual before/after card position.

Verification commands: `node scripts/sitewide-motion-browser.cjs`,
`node scripts/sitewide-motion-profile.cjs`, `node scripts/sitewide-motion-demo.cjs`.
The browser matrix additionally checks 360px layouts, real cross-page SPA links,
disclosure reversal/dynamic height/search eligibility, native dialog entry/exit/
close/focus, touch-scroll press cancellation and no-JS disclosure. The existing
three-engine motion regression and NS audio checks remain required. The CDP trace
explicitly reports active layout cost separately from idle work; adding a visible
height animation is not advertised as reducing layout count.

Follow-up verification: 481 automated tests pass; 358 static pages export and the
shared first-load bundle remains 102 kB. All nine templates pass desktop/touch
checks in Chromium, Firefox and WebKit, including narrow 360px layouts. Separate
real-input checks pass for post/game/timeline/social cards. The saved game-card
position changes from a measured -12px drift to 0px in all three engines.
The 390px disclosure CDP sample reports 8.5ms P95 both before and after; active
layouts increase from 6 instantaneous toggles to 181 animated layouts, with zero
idle layouts or style recalculations after settlement. This measures the headless
host, not physical mobile hardware.

## Article history return continuity (2026-11-25)

The reported defect is the **reverse animation**, not the restored list position.
Forward native `article-cover` transitions, link destinations, archive filters and
browser/Next history ownership are retained. `popstate` previously cancelled the
forward transition but never created its reverse counterpart.

`article-return-motion.ts` captures only a decoded, visible article image before
Next commits history traversal. A pointer-transparent, aria-hidden fixed cover
bridges to the visible matching list occurrence with the existing 380/.8 spring.
The source uses the actual image box (not its taller aspect-ratio placeholder);
the destination uses the card's clipping box and corners. The inner inverse scale
preserves the artwork's aspect ratio while changing its crop. Home's featured and
latest cards can share a slug; the visible destination wins after restoration.
The selected card does not simultaneously run a separate reveal animation.

There are no scroll-position or history-state writes. While the bridge is alive,
the existing global smooth-scroll rule is temporarily overridden with `auto` so
the browser's **same saved position** is restored before the cover lands. The
previous inline value is restored on every cleanup path. This avoids two competing
animations on mobile Chromium/Firefox without changing where Back returns.
Hover zoom is neutralized only on the hidden destination image, then its existing
CSS transition resumes at handoff instead of jumping to a magnified crop.

New navigation, wheel/touch/key input, resize, reduced-motion changes, missing
destinations, timeouts and unmount release the overlay and original visibility.
An offscreen/undecoded source retains the existing non-shared fallback rather than
inventing a flying cover or scrolling an article to its heading. Native visual
history gestures are not animated twice: see
[PopStateEvent.hasUAVisualTransition](https://developer.mozilla.org/en-US/docs/Web/API/PopStateEvent/hasUAVisualTransition).

Regression commands:
- `node --test scripts/article-return.test.cjs scripts/motion-navigation.test.cjs`
- `node scripts/article-return-browser.cjs` (three engines, desktop/hover/touch,
  duplicate home cover, no View Transition API, reduced motion, interrupted return,
  rapid Back/Forward and deep-reading fallback).
- `node scripts/motion-browser.cjs` and `node scripts/motion-history-browser.cjs`
  retain the original forward-capture and unrelated history-position contracts.
- `node scripts/article-return-profile.cjs` records CDP Performance metrics and a
  DevTools timeline trace without per-frame DOM instrumentation.

Initial CDP samples (390×844 headless Chromium): P95 8.5ms baseline / 8.6ms modified;
active layouts 11 / 6, paints 41 / 148, idle layouts and style recalculations 0 / 0.
The animated crop/corners add bounded paint work; this is not a claim that animation
reduces all rendering cost. Baseline used the pre-release live site and modified
used the local export. These are host samples, not physical Pixel/iPhone or
120Hz-device acceptance. Reproducible logs, traces, hashes and rollback evidence
are retained in the task's ignored `reports/return-motion-20261125/` directory.
