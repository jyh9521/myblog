# NS audio lifecycle

## Regression and cause (2026-11-25)

After the move to same-document route transitions, navigating from the homepage to
`/ns/` could produce three playing HTMLAudioElements: two detached speculative
React host nodes and one committed visible player. Native `autoPlay` started all
three. The visible pause control correctly paused its own element but left the
two detached instances playing, including after navigating to another page.

This was reproduced on the production site with real Chromium media playback,
native control clicks and retained references to every created audio element.
It was not a broken pause button or a global click-to-resume handler.

## Fix

`app/ns/ns-audio.tsx` renders normal native controls and the existing source, but
does not set the HTML autoplay attribute. A client effect attempts playback once,
only after the node is committed and connected. Autoplay denial leaves the native
play control usable; there is no retry, gesture listener or theme-triggered restart.
Rerenders do not override a user's pause.
An existing native play/pause interaction before hydration is also respected.

Cleanup explicitly pauses, removes the source and calls load to abort pending
playback/loading and release the media resource. React effect replay and return
navigation restore the source in the next committed setup. The existing intended
automatic-play attempt on a fresh visit is preserved; manual playback remains
available without JavaScript. No music file, styling or global motion behavior changes.

## Validation

```sh
node --test scripts/ns-audio-lifecycle.test.cjs scripts/ns-autoplay-and-cover.test.cjs
node scripts/ns-audio-browser.cjs
```

The browser regression enables Chromium's autoplay permission deliberately so that
a blocked autoplay policy cannot hide detached playback. It inspects actual paused
states and advancing currentTime, not just the visible DOM count. `NS_AUDIO_ORIGIN`
selects the production or local static site; `NS_AUDIO_OUTPUT` selects the report
directory. Playwright is provided by the development environment, not production.

The regression covers the native pause button, repeated route entry/exit, changing
theme while paused, and browser back/forward. The original production capture had
three active instances on entry and two still active after pause/exit. Expected
fixed behavior is exactly one on entry and zero after pause or exit.

After deployment, fully reload any tab already exhibiting ghost playback: those
detached instances were created by the previous page runtime and are discarded
when that document closes. The patch prevents their creation in the new runtime.
