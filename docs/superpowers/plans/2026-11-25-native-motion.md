# Continuous interaction motion implementation plan

**Goal:** Make feedback visibly develop and settle across the existing site instead
of equating tiny fast color fades with native-like interaction quality.

**Architecture:** Keep the existing analytic M3 oscillator and delegated runtime.
Give hover and press independent spatial and effects states; preserve all velocities
when intent changes. Compose them into lift, scale, tint and soft elevation. Use
the same spatial family for route arrival and dialog panels, retaining their existing
navigation, interruption, focus and reduced-motion handling. No new runtime dependency.

**Design:** Controls lift 2px and expand 1.2% on deliberate mouse hover; press
compresses 3.5% and suppresses hover lift/elevation. Card hover lifts 4px without
enlarging text. A soft neutral shadow fades in, never a solid red extrusion.
Hover uses default spatial/slow effects; press uses fast spatial/fast effects.
Keyboard focus stays clearly outlined. Touch never acquires hover. Reading text,
inputs, native media controls and persistent header layout remain stationary.
The physical model stays M3; amplitudes are project choices, not official Pixel/iOS values.

**Sources:** https://m3.material.io/styles/motion and
https://developer.android.com/develop/ui/compose/animation/quick-guide?hl=en

## Tasks and acceptance

- [x] Add pure coupled-interaction tests: response at 60/120/144 Hz, momentum on
  reversal, press while hovered, bounded effects, return to hover/idle.
- [x] Replace the single ambiguous press state in `app/motion-runtime.ts` with
  independent channels, one active-only RAF, bounded lifecycle cleanup, disabled
  controls and semantic keyboard behavior. Include all existing card/control families.
- [x] Unify state/elevation surfaces in `app/motion.css`; remove competing hover
  targets for owned transforms. Preserve shape, palette, layout and focus. Ensure
  native CSS/no-JS and reduced-motion fallbacks stay usable.
- [x] Separate dialog spatial/effects springs and distinguish route motion from
  live theme color interpolation. Keep shared-cover and rapid-navigation cancellation tests.
- [x] Record comparable baseline/modified videos and real frame samples. Run
  Chromium/Firefox/WebKit, existing route/media regression, full tests/build and
  a DevTools trace. A video remains an acceptance aid, not proof of personal taste
  or physical high-refresh-device performance. Document measured results honestly.
- [x] Preserve hashes, patch, modified bundle and test rollback on a separate copy.
  Release status is recorded separately in the verification evidence, not inferred from local tests.

## Review focus

Hover-to-press-to-hover must not restart from zero. Nested buttons must not
overwrite parent card state. Touch cancellation/blur/disabled changes must not
leave a scaled element. Reduced motion must clear both unsettled and settled
hover states. Native links/Space/Enter and text selection must retain semantics.
