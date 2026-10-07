# About: Exophase gaming profile

The About page reads `/data/exophase.json`, a compact public-data cache. No
Exophase credentials, cookies, proxy, or backend are involved. Only this section
loads the JSON and its six lazy cover images.

## Public sources

- Profile: `https://www.exophase.com/user/jyh9521/`. Resolve
  `window.playerProfileId` on every refresh; do not persist a fixed player ID.
- Games: `https://api.exophase.com/public/player/<resolved-id>/games?page=1`.
- The public profile also embeds `currentPlayerSummary` and `playerGames`. The
  updater uses the embedded games when the games API fails or changes shape.
  JavaScript is never evaluated. Summary fields are whitelisted; complete
  upstream responses, linked account identifiers and unrelated fields are not saved.

`playtime` in the summary is hours, `gamesplayed` is game count, `total_awards`
is achievements/trophies, and `progress` is the upstream completion percentage.
Platform counts use **services.gamesplayed**, not `awardTotals` (achievements).
Recent games use `lastplayed_utc`, `playtimeUnits`, `supports.awards`,
`earned_awards`, `total_awards`, `percent`, `meta.platforms`,
`meta.featured_image`/`resource_standard` and `meta.endpoint_overview`.
Unsupported statistics remain absent, including Nintendo achievements. Platform
labels retain explicitly returned Switch/ Switch 2 information without inference.

## Refresh and deployment

Run `node scripts/update-exophase.cjs`, or dispatch **Update gaming profile** in
GitHub Actions. It also runs at minute 17 every six hours (UTC). HTTP errors,
Cloudflare challenges and unexpected payloads fail before writing anything; the
previous cache remains intact. Unchanged semantic data does not change updatedAt
or generate commits: updatedAt means the time this snapshot last changed, not a
refresh heartbeat. Successful changed snapshots are written atomically.

The workflow grants its repository token contents/actions write to commit the
single cache file and dispatch the existing Pages workflow, because commits made
using GITHUB_TOKEN do not themselves trigger push workflows. Repository Actions
must allow write permissions. No new Pages environment or secrets are required.
Concurrent CMS edits are preserved through rebase; a conflict fails instead of
force-pushing. A failed API refresh is visible as a failed workflow but does not
remove the published profile.

During initial integration, ordinary HTTP requests to both profile/API returned
Cloudflare 403 with no Access-Control-Allow-Origin for the blog origin. This
does not establish the CORS headers of a successful API response. Browser access
to the public profile succeeded; its public embedded JSON supplied the initial
snapshot. Unattended refreshing still depends on Exophase allowing requests from
GitHub-hosted runners; challenges are not bypassed.

## UI and localization

The section follows existing CSS variables/light-dark theme. Desktop uses
platform and three-column recent-game grids; mobile uses two platform columns
and a horizontally scrollable recent list. Broken covers retain a fixed-ratio
placeholder. Loading/error/empty states affect only this section. Older caches
remain displayed with a note after 48 hours.

The site currently has Chinese text and no global i18n/language switcher. This
feature's strings are centralized in `lib/gaming-profile-i18n.ts`, supporting
`zh-CN` and `ja` through its locale prop without changing unrelated site UI.
