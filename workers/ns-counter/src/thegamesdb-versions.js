import gamePlatforms from '../../../public/sveltia/game-platforms.js';
import { releaseYear } from './game-identity.js';

// Keep subtitles, edition words and numbers; punctuation alone does not
// distinguish a port. Do not group from fuzzy matches or aliases.
export const catalogKey = value => value.replace(/[™®©]/gu, '').normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '');

const sourceId = row => row.game.sources.thegamesdb.id;
export const theGamesDBLink = id => `https://thegamesdb.net/game.php?id=${id}`;

function compatible(a, b) {
  const ap = a.game.platforms[0], bp = b.game.platforms[0];
  if (!ap || !bp) return false;
  const sameDeveloper = a.credits.some(credit => b.credits.includes(credit));
  if (a.credits.length && b.credits.length && !sameDeveloper) return false;
  const ad = a.game.releaseDate, bd = b.game.releaseDate;
  // Same-platform duplicates may have multiple IDs. Keep them only when the
  // date agrees exactly; a different date may be a different release.
  if (ap === bp) return Boolean(ad && ad === bd);
  const ay = releaseYear(ad), by = releaseYear(bd);
  if (!ay || !by) return sameDeveloper;
  return Math.abs(Number(ay) - Number(by)) <= (sameDeveloper ? 3 : 1);
}

function editionGroups(rows) {
  const seen = new Set();
  return rows.flatMap((_, index) => {
    if (seen.has(index)) return [];
    const component = [index];
    seen.add(index);
    for (const i of component) rows.forEach((row, j) => {
      if (!seen.has(j) && compatible(rows[i], row)) { component.push(j); seen.add(j); }
    });
    const members = component.sort((a, b) => a - b).map(i => rows[i]);
    // An uncertain row must not act as a bridge between incompatible games.
    return members.every((row, i) => members.slice(i + 1).every(other => compatible(row, other)))
      ? [members] : members.map(row => [row]);
  });
}

export function groupTheGamesDBVersions(rows, primaryId = '') {
  const titles = new Map();
  for (const row of rows) {
    const key = catalogKey(row.game.title) || '#' + sourceId(row);
    if (!titles.has(key)) titles.set(key, []);
    titles.get(key).push(row);
  }
  return [...titles.values()].flatMap(editionGroups).map(members => {
    const { game } = members.find(row => sourceId(row) === primaryId) || members[0];
    if (members.length === 1) return game;
    const versions = members.map(row => ({
      id: sourceId(row), platform: row.game.platforms[0], releaseDate: row.game.releaseDate,
    })).sort((a, b) => a.platform.localeCompare(b.platform, 'en') || a.releaseDate.localeCompare(b.releaseDate)
      || a.id.length - b.id.length || a.id.localeCompare(b.id));
    return { ...game, platforms: gamePlatforms.normalizePlatformList(versions.map(version => version.platform)),
      sources: { thegamesdb: { ...game.sources.thegamesdb, versions } } };
  });
}

// Apply search hints after reading the cache so another platform can become
// the primary source without dropping the rest of the group.
export function preferTheGamesDBVersion(game, hints) {
  const source = game.sources?.thegamesdb;
  if (!source?.versions) return game;
  const platform = gamePlatforms.normalizePlatform(hints.platforms?.[0]);
  const forPlatform = platform ? source.versions.filter(version => version.platform === platform) : [];
  const candidates = forPlatform.length ? forPlatform : source.versions;
  const preferred = candidates.find(version => hints.releaseDate && releaseYear(version.releaseDate) === hints.releaseDate)
    || forPlatform[0];
  if (!preferred || preferred.id === source.id) return game;
  return { ...game, id: `thegamesdb:${preferred.id}`, releaseDate: preferred.releaseDate,
    sources: { ...game.sources, thegamesdb: { ...source, id: preferred.id, url: theGamesDBLink(preferred.id) } } };
}
