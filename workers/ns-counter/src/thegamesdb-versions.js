import gamePlatforms from '../../../public/sveltia/game-platforms.js';
import { releaseYear } from './game-identity.js';

// Keep subtitles, edition words and numbers; punctuation alone does not
// distinguish a port. Do not group from fuzzy matches or aliases.
const catalogKey = value => value.replace(/[™®©]/gu, '').normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '');

const sourceId = row => row.game.sources.thegamesdb.id;
export const theGamesDBLink = id => `https://thegamesdb.net/game.php?id=${id}`;

// Provider-wide studio identity, not a game-title exception.
const developerAliases = new Map([
  ['id:2984', 'nihonfalcom'], ['id:6010', 'nihonfalcom'],
  ['name:falcom', 'nihonfalcom'], ['name:nihonfalcom', 'nihonfalcom'],
]);
const studio = credit => developerAliases.get(credit) || credit;
const sharesDeveloper = (a, b) => a.credits.some(credit => b.credits.some(other => studio(credit) === studio(other)));
const releaseDistance = (a, b) => Math.abs(Date.parse(a.game.releaseDate) - Date.parse(b.game.releaseDate)) / 86400000;

function compatible(a, b, titleRows) {
  const ap = a.game.platforms[0], bp = b.game.platforms[0];
  if (!ap || !bp) return false;
  const sameDeveloper = sharesDeveloper(a, b);
  if (a.credits.length && b.credits.length && !sameDeveloper) return false;
  const ad = a.game.releaseDate, bd = b.game.releaseDate;
  // Preserve nearby dates as separate source records within a single card
  // only when another platform corroborates the title and studio.
  if (ap === bp) return Boolean(ad && ad === bd) ||
    (sameDeveloper && releaseDistance(a, b) <= 31 && titleRows.some(other =>
      other.game.platforms[0] && other.game.platforms[0] !== ap &&
      sharesDeveloper(a, other) && sharesDeveloper(b, other) &&
      releaseDistance(a, other) <= 366 && releaseDistance(b, other) <= 366));
  const ay = releaseYear(ad), by = releaseYear(bd);
  if (!ay || !by) return sameDeveloper;
  return Math.abs(Number(ay) - Number(by)) <= (sameDeveloper ? 3 : 1);
}

const idOrder = (a, b) => sourceId(a).length - sourceId(b).length || sourceId(a).localeCompare(sourceId(b));

function completeLink(rows, fits) {
  const ordered = [...rows].sort(idOrder);
  const groups = new Map(ordered.map(row => [row, [row]]));
  const pairs = ordered.flatMap((row, i) => ordered.slice(i + 1).filter(other => fits(row, other))
    .map(other => [row, other, releaseDistance(row, other)]));
  for (const pair of pairs) if (!Number.isFinite(pair[2])) pair[2] = Infinity;
  pairs.sort(([a, b, d], [c, e, f]) => d - f || idOrder(a, c) || idOrder(b, e));
  for (const [a, b] of pairs) {
    const left = groups.get(a), right = groups.get(b);
    if (left === right || !left.every(row => right.every(other => fits(row, other)))) continue;
    for (const row of right) groups.set(row, left);
    left.push(...right);
  }
  return [...new Set(groups.values())];
}

function fitsSparseRelease(row, core, titleRows) {
  const platform = row.game.platforms[0], date = row.game.releaseDate;
  if (!platform || !date || !core.every(other => other.game.platforms[0] !== platform || other.game.releaseDate === date)) return false;
  // One exact dated port can corroborate a missing developer even when
  // another already-confirmed platform came out years later.
  return core.some(other => other.game.platforms[0] && other.game.platforms[0] !== platform && other.game.releaseDate === date)
    || core.every(other => compatible(row, other, titleRows));
}

function editionGroups(rows) {
  const credited = rows.filter(row => row.credits.length);
  const sparse = rows.filter(row => !row.credits.length);
  const cores = completeLink(credited, (a, b) => sharesDeveloper(a, b) && compatible(a, b, credited));
  const proposals = new Map(cores.map(core => [core, []]));
  const remainder = [];
  for (const row of sparse) {
    const candidates = cores.filter(core => fitsSparseRelease(row, core, rows));
    if (candidates.length === 1) proposals.get(candidates[0]).push(row);
    else if (candidates.length) remainder.push([row]); // Ambiguous; don't bridge or reassign.
  }
  const eligible = new Set([...proposals.values()].flat().concat(remainder.flat()));
  for (const [core, candidates] of proposals) {
    for (const row of candidates) {
      if (candidates.some(other => other !== row && !compatible(row, other, rows))) remainder.push([row]);
      else core.push(row);
    }
  }
  const order = new Map(rows.map((row, i) => [row, i]));
  return [...cores, ...remainder, ...completeLink(sparse.filter(row => !eligible.has(row)), (a, b) => compatible(a, b, rows))]
    .map(group => group.sort((a, b) => order.get(a) - order.get(b)))
    .sort((a, b) => order.get(a[0]) - order.get(b[0]));
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
