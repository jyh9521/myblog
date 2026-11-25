# Expressive Motion implementation plan

**Goal:** Preserve the current M3 layout, palette, content and static export while making interactions continuous, interruptible and accessible.
**Architecture:** A small dependency-free analytic spring core, generated CSS tokens, a persistent client motion coordinator, native View Transitions with normal Next routing fallback. Server-rendered content is never initially hidden.
**Tech Stack:** Next 15 App Router / React 18 / TypeScript / CSS / WAAPI / Playwright / Chromium CDP profiler.

## Decisions and audit
- Reference production page: CSS keyframes, `.reveal` IntersectionObserver (threshold .12, 36px, .9s, delay), RAF mouse coordinates; no spring library identified in the page chunk. Do not transplant its long hero delays or infinite decoration loops.
- Existing blog: static export; mixed Next Links and document anchors; scattered .18–.38s transitions, approximate `linear()` spring, React state + width updates on scroll, cover RAF competing with CSS transition and permanent will-change.
- Use AndroidX ExpressiveMotionTokens v0_14_0: spatial fast/default/slow stiffness 800/380/200, damping ratio .6/.8/.8; effects 3800/1600/800 at ratio 1. Mass 1. Effects must not overshoot.
- Alternatives: Motion would simplify React lifecycle but adds a second engine; GSAP is unnecessarily broad; native-only easing cannot preserve velocity on reversal. Choose exact spring integration + CSS/WAAPI, no production dependency.
- Keep ordinary navigation, downloads, modified clicks, hashes, search query state, focus and SEO. Never intercept admin/backend destinations. No autoplay decorative motion in article text.
- Work on codex/motion-system in place; preserve unrelated editor changes. Original files and SHA256 are outside the repo. User explicitly requested autonomous execution, so no approval pauses.

## Tasks
- [x] 1. Tests first: convergence, critical damping, 60/120/144Hz equivalence, reversal velocity, bounded stagger. Implement spring core and CSS token generator.
- [x] 2. Integrate persistent coordinator: delegated press/hover/keyboard spring, one-shot viewport reveals with bounded batch stagger, named selected cover / page transitions, live reduced-motion cleanup and no-API fallback.
- [x] 3. Integrate theme, progress, back-to-top, cover, TOC/panels and controls. Preserve layouts; no transition:all, no per-frame layout reads.
- [x] 4. Production build and browser evidence: Chromium, Firefox, WebKit, mobile/touch, reduced-motion and rapid interaction. Record CDP trace and comparable baseline/modified metrics; test rollback copy and reopen artifacts.
- [ ] 5. Independent review, full suite, docs, focused commit, push, deployment and live verification.

## Review focus
Rapid route changes must resolve stale snapshot promises; dynamic media preference must cancel active motion; duplicate featured/list cover must never duplicate a transition name; visibility must remain intact without JS; failed navigation and popstate must not freeze input. Browser tests exercise these paths. Headless RAF evidence does not prove physical 120/144Hz hardware or Safari-on-iOS acceptance.

## Sources
- https://kcglms-plus.vercel.app/ (live JS/CSS + REA observation, 2026-11-25)
- https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExpressiveMotionTokens.kt
- https://developer.android.com/develop/ui/views/animations/spring-animation

## Execution ledger
- Baseline npm test passes outside sandbox; restricted baseline Worker runtime failed before changes. Baseline prebuild needs network for existing mandatory resource sync.
