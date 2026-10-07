const fs = require('node:fs/promises');
const path = require('node:path');
const { EXOPHASE_USERNAME, EXOPHASE_URL, embeddedJson, resolvePlayerId, normalizeProfile, parseGamingProfile } = require('./gaming-profile-module.cjs');
const destination = path.join(__dirname, '../public/data/exophase.json');
class SourceUnavailableError extends Error {}
async function request(url, fetcher = fetch) {
  let response;
  try { response = await fetcher(url, { signal: AbortSignal.timeout(30000), headers: {
    Accept: 'application/json, text/html;q=0.9', 'User-Agent': 'BLFY-Gaming-Profile/1.0 (+https://blog.blfy.cc/games/)',
  } }); } catch (error) {
    if (error.name === 'TimeoutError' || error.cause?.code && ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET'].includes(error.cause.code)) {
      throw new SourceUnavailableError('Exophase request temporarily unavailable');
    }
    throw error;
  }
  if ([403, 429, 502, 503, 504].includes(response.status)) throw new SourceUnavailableError(`Exophase HTTP ${response.status}`);
  if (!response.ok) throw new Error(`Exophase HTTP ${response.status}`);
  return response;
}
async function collect(fetcher = fetch) {
  const html = await (await request(EXOPHASE_URL, fetcher)).text();
  const playerId = resolvePlayerId(html);
  const summary = embeddedJson(html, 'currentPlayerSummary');
  let games;
  try {
    games = await (await request(`https://api.exophase.com/public/player/${playerId}/games?page=1`, fetcher)).json();
    // Validate the API response before accepting it over the public page payload.
    normalizeProfile(summary, games, new Date().toISOString());
  } catch {
    games = embeddedJson(html, 'playerGames');
    console.log('Using game data embedded in the public profile.');
  }
  return parseGamingProfile(normalizeProfile(summary, games, new Date().toISOString()));
}
function sameData(previous, next) {
  return JSON.stringify({ ...previous, updatedAt: '' }) === JSON.stringify({ ...next, updatedAt: '' });
}
async function save(profile, file = destination) {
  const normalized = parseGamingProfile(profile);
  try {
    const previous = parseGamingProfile(JSON.parse(await fs.readFile(file, 'utf8')));
    if (sameData(previous, normalized)) return false;
  } catch (error) {
    if (error.code !== 'ENOENT') console.log('Replacing invalid existing cache after successful collection.');
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`);
  await fs.rename(temporary, file);
  return true;
}
async function refresh({ fetcher = fetch, file = destination } = {}) {
  // Collection must finish before any filesystem writes: failures preserve cache.
  let profile;
  try { profile = await collect(fetcher); } catch (error) {
    if (!(error instanceof SourceUnavailableError)) throw error;
    // A temporary source outage is tolerable only when a valid cache exists.
    const cached = parseGamingProfile(JSON.parse(await fs.readFile(file, 'utf8')));
    return { status: 'retained', updatedAt: cached.updatedAt, reason: error.message };
  }
  return { status: await save(profile, file) ? 'updated' : 'unchanged', updatedAt: profile.updatedAt };
}
async function main() {
  const result = await refresh();
  let message;
  if (result.status === 'retained') {
    message = `Existing snapshot retained (${result.reason}); no new data fetched. Snapshot: ${result.updatedAt}`;
    console.log(process.env.GITHUB_ACTIONS === 'true' ? `::warning title=Exophase refresh skipped::${message}` : message);
  } else {
    message = result.status === 'updated' ? `Updated ${EXOPHASE_USERNAME} gaming profile.` : 'Gaming profile unchanged; no write.';
    console.log(message);
  }
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## Gaming profile refresh\n\nOutcome: **${result.status}**\n\n${message}\n`);
}
if (require.main === module) main().catch(error => {
  console.error(`Refresh failed; existing cache retained: ${error.message}`);
  process.exitCode = 1;
});
module.exports = { collect, save, sameData, refresh };
