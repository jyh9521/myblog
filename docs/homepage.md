# Content-first homepage

The homepage puts content before the welcome slogan. It remains statically
rendered, retains the red Material 3 palette, and adds no runtime dependency.

## Automatic selection, not editorial promotion

- The leading card is the latest **published**, public article with a configured
  usable cover. `updatedAt`, pinning and file order do not promote an older article
  into that position. Invalid publication dates do not claim newest status.
- The next three articles use the later valid `updatedAt`/`date`; remaining articles
  form the feed. Each slug appears once across these three sections.
- Unlisted posts are excluded. Password-protected listings remain discoverable but
  cannot become the leading card, and their summaries never read private content.
- Summaries use authored update notes or descriptions, strip Markdown quote
  prefixes and collapse whitespace; missing metadata receives a neutral fallback.
- Empty, small and coverless datasets are supported. There is no curated homepage
  config, synthetic update timestamp, rotating promotion or random daily picker.

Selection lives in `lib/home-content.ts`, server rendering in `app/page.tsx`, and
responsive presentation in `app/home.css`. The game/timeline previews resolve real
existing records; they are not decorative placeholder widgets.

## Interaction and accessibility

The visible GET search submits `q` to the existing article archive. Query and tag
edits preserve Next's history state; clearing filters also clears the URL. The
archive search requires JavaScript, while article and category links, the initial
home content, and no-JS article navigation remain available.

All homepage cover images retain `data-motion-cover`. Shared entry and reverse
cover transitions, history scroll settlement and reduced-motion behavior continue
through the existing controller. Search/category controls reuse its physics and
opacity state layers rather than introducing a second animation engine. New
surface colors follow theme transitions; compact content does not shrink touch
targets below 44px.

## Verification

Run `node --test scripts/home-content.test.cjs scripts/home.test.cjs` for selection
and SSR contracts; `node scripts/homepage-browser.cjs` for actual desktop/mobile,
360px, dark, reduced-motion and no-JS scenarios, search/clear/reload and cover Back.
The existing article-return and physical control tests have updated selectors, not
weaker interaction assertions. `node scripts/homepage-profile.cjs` records actual
CDP performance evidence; headless timing is not physical phone acceptance.

Target viewports are 1440×900 (leading article + all three recent updates visible)
and 390×844 (complete first title/summary plus the next article choice). Screenshots,
baseline failures, traces, source hashes and independent-copy rollback evidence are
kept in the ignored `reports/home-content-20261126/` task folder.
