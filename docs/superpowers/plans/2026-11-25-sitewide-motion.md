# Sitewide and touch motion implementation plan

**Goal:** Extend the existing continuous M3 feedback to every public page family,
especially disclosures and chronology dialogs which still use instantaneous native
open/close. Preserve design, content, native semantics and static HTML.

**Architecture:** Reuse the analytic spring and existing delegated input runtime.
Add a reusable native-details disclosure and a native modal dialog adapter, with
independent effect/spatial states and velocity-preserving reversal. Keep browser
native selects/audio, reading text and decorative cards free of gratuitous motion.
No production dependency. Existing Next static export, React, CSS and Playwright.

**Spec:** User requests a full public-site and phone review, continuous page/menu/
card/dialog feedback, then direct deployment. This is an extension of the approved
motion vocabulary in `docs/motion-system.md`, not a layout redesign.

## Tasks
- [x] Inventory all nine route templates and exercise representative actual pages
  at desktop and 390px touch, plus narrow-width layout checks. Record baseline
  frame samples for native details, chronology dialog and touch target sizes.
- [x] Make details expansion interruptible without removing server-rendered content
  or native no-JS toggle behavior. Measure content only on changes; bound layout
  work to the one expanding container. Preserve focus and controlled-open updates.
- [x] Give chronology native dialogs retained physical entry/exit, native modal
  focus containment, Escape/backdrop closing, trigger focus restoration and live
  reduced-motion cancellation. Reuse the same spatial/effects constants.
- [x] Audit touch scrolling/cancellation, lightbox swipe intent, game/card state
  layers and mobile hit targets. Fix only observed gaps; retain native pickers.
- [x] Run three browser engines, all route families, existing regression/audio
  checks, full tests/typecheck/export and a real Performance trace. Review the diff.
- [x] Preserve original hashes, changed bundle/patch and test rollback on a separate
  copy. Clean only this task's disposable files and prepare the validated release.

**Release handoff:** The user authorizes commit, push and deployment directly.
The observed remote deployment and live verification status belongs in the release
evidence, not a prediction in this plan.

## Review focus
- Rapid disclosure reversal must use current height and velocity, not restart.
- Closed/closing content must not remain keyboard-focusable; native no-JS works.
- Dialog close must retain content through exit without leaking body scroll lock.
- Touch scrolling must cancel press feedback and never activate hover elevation.
- History navigation, live reduced motion, dynamic images and viewport changes
  must not leave fixed heights, stale animations or horizontal document overflow.

## Execution record
- Baseline: `b47b504`; worktree clean. Existing chronology details toggle instantly
  and its dialog unmounts immediately. Native select/audio controls stay native.
- Native and synthetic touch checks confirmed diagonal/cancelled image gestures
  advanced incorrectly. Native details hit target measured 19px; coarse target is
  now at least 44px. Actual mobile screenshots caught the reserved gutter strip.
- Review resolved reduced-motion resize, find-in-page eligibility and Chromium's
  queued native-close event after unmount. No production dependency was added.
- A separate touch history test reproduced an exact -12px return-position drift;
  history arrival now fades without displacement. All three engines measure 0px.
- 481 unit/integration tests, type check, content validation and 358-page export
  pass. Nine route templates, four non-home card families, menu/dialog semantics,
  no-JS, reduced motion and touch gestures have real-engine coverage.
