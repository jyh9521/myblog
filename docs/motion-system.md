# Expressive Motion System

## Scope and architecture

The site retains Next.js static export, React 18, its existing Material 3 Expressive palette, layout, content and data features. No production dependency was added. `lib/motion.ts` is the single token/physics source; `scripts/build-motion-tokens.cjs` emits `app/motion-tokens.css`. Run the generator after changing tokens and `--check` in validation. Do not hand-edit generated CSS.

Three layers share the same intent:

1. Exact damped oscillator integration in a single requestAnimationFrame loop for pointer and keyboard press/release, and card hover. Retargeting retains position and velocity, including reversals; the loop stops when idle and writes individual scale/translate properties, not layout.
2. Compositor-owned WAAPI samples of that oscillator for one-shot viewport entry. IntersectionObserver watches newly inserted card subtrees, never article paragraphs. Batch delays are bounded, and `fill: backwards` prevents a visible-before-delay flash. Server HTML is visible before hydration and with JavaScript disabled.
3. Native same-document View Transitions around Next router commits. A persistent coordinator owns pending snapshots, timeout, rapid navigation generations, focus and cleanup. Only the selected cover is named, avoiding duplicate featured/grid names. Theme changes share the same snapshot owner. Browser back/forward and engines without the API use a short content entrance, without blocking navigation.

## Tokens

The physics values follow [AndroidX ExpressiveMotionTokens v0_14_0](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExpressiveMotionTokens.kt). These are damping **ratios**, not damping coefficients; mass is 1, so coefficient `c = 2 × ratio × sqrt(stiffness)`.

| Family | Fast | Default | Slow |
| --- | --- | --- | --- |
| Spatial stiffness | 800 | 380 | 200 |
| Spatial damping ratio | 0.6 | 0.8 | 0.8 |
| Effects stiffness | 3800 | 1600 | 800 |
| Effects damping ratio | 1 | 1 | 1 |

Spatial motion can overshoot; opacity/effects are critically damped. Generic CSS fallback durations are 120/220/360ms, standard easing `cubic-bezier(.2,0,0,1)`, exit easing `cubic-bezier(.3,0,1,1)`. Spring samples cover 600ms; the live physical loop settles by displacement < .001 and velocity < .01. These web duration/stagger choices are project adaptations, not claimed official Android tokens. Stagger is 35ms, capped at 140ms. Controls compress 3.5%; cards lift 3px; reveals translate 12px. There are no infinite decorative loops or `transition: all` additions.

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

## Validation results (2026-11-25)

- Full local suite: 458 tests pass (275 source/CMS, 61 counter, 93 gaming accounts, 29 static preview). Baseline: 454 tests. Type check, content validation and production export pass; 237 static pages in this local content snapshot. Shared first-load JS remains 103kB; the homepage first-load total changes from 108kB to 110kB.
- Playwright: Chromium 159, Firefox 153 and WebKit 26.5 pass desktop/mobile touch, snapshot pairing, live reduced-motion, reversal, focus, search, route and no-JS checks. WebKit required explicit trigger-based focus restoration because pointer activation does not necessarily focus a button.
- Same-host sequential production profiling, 1440×1000, same article, 2.4s RAF scroll: LayoutCount **269 → 1**, layout time **41.4 → 0.682ms**, script time **176.5 → 70.6ms**, task time **613.6 → 320.1ms**. These are one controlled run, not universal device guarantees.
- Whole scenario including six animated theme toggles: layouts **297 → 46**, P95 frame interval **8.5 → 8.5ms**, CLS **0 → 0**. Theme snapshot animation adds rendering work: paint events **458 → 885**, style time **113.9 → 135.6ms**, total task time **818.3 → 856.8ms**. This is an explicit cost of the new theme crossfade, not a claimed across-the-board performance improvement. There is no ongoing idle loop after settlement.
- Independent review reproduced and drove fixes for stagger-delay flashing, live reduced-motion cancellation and React commit focus restoration. Each was rerun in actual browsers. Final traces are `baseline-final-trace.json` and `modified-final-trace.json` in the external evidence directory.

## Rollback

Revert the dedicated motion commit, not unrelated content/editor commits. The task evidence additionally contains original SHA256 hashes, a changed-file bundle, unified diff and executable rollback script. That script restores only enumerated changed files in a caller-selected copy after verifying their modified hashes; it never resets the repository or cleans user files.
