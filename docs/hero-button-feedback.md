# CTA feedback history

The flat-opacity revision below records the first fix, not the current motion
contract. It removed the abrupt legacy shadows but the user found its response
too subtle. The current [continuous interaction system](motion-system.md#continuous-native-style-interaction-revision)
uses coupled hover/press spatial and effects springs, 10% hover/14% press tint,
soft neutral elevation and a perceptible 2px/1.2% control hover response. Both
browser scripts now validate physical intermediate frames; CSS opacity transitions
are only the no-JavaScript fallback.

## First flat-opacity revision

The homepage CTA retained a legacy `:hover` rule with an 11px solid red shadow and
a second large blurred shadow. The motion layer removed `box-shadow` from the
transition list but did not remove that old target, making the extrusion appear
immediately on hover. This was reproduced on production in Chromium.

Remove the legacy base and hover shadows at their source. Keep the existing
palette, dimensions, labels and navigation. Use a current-color state layer with
8% hover, 10% keyboard focus and 12% fine-pointer press opacity. Only opacity
transitions, using the existing short duration and effects easing. Hover is
fine-pointer only. Touch uses the existing pointerup/pointercancel-aware press
spring, not CSS `:active`, which Firefox can retain after a completed tap.
The existing physical press spring is unchanged; the CTA no longer morphs its
capsule into a 14px rectangle on press. Focus outlines remain outside the button,
the state layer does not intercept input, and reduced motion disables transitions.

Regression command: `node scripts/hero-button-browser.cjs` with Playwright available
through `NODE_PATH`. `HERO_ORIGIN` selects a local production export or the deployed
site; `HERO_OUTPUT` sets evidence location; `HERO_ENGINES` defaults to
`chromium,firefox,webkit`. Checks cover actual computed shadows, intermediate
opacity frames, press shape/scale, rapid reversal, stable layout, dark theme,
keyboard focus, reduced motion, touch and the no-JavaScript fallback.

## Homepage quick entries

The three `.m3-quick a` links had the same transition ownership issue: a 48px
inset gray shadow appeared immediately on hover. They now share the CTA state
layer, with the original pink palette, padding, dimensions and routes preserved.
Their press feedback keeps the capsule radius instead of morphing to 14px.
Run `node scripts/quick-button-browser.cjs` with the same environment variables.
It checks each of the three links independently, including intermediate opacity,
rapid reversal, press, dark theme, focus, reduced motion, touch, no-JS fallback
and actual navigation to articles, games and timelines. Test-only click prevention
is limited to press-state checks and is released before the navigation checks.
