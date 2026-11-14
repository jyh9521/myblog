import gamePlatforms from '../../../public/sveltia/game-platforms.js';
import { developerKey, releaseYear } from './game-identity.js';

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
const synopsisKey = row => (row.game.description || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function sharesSynopsis(a, b) {
  const key = synopsisKey(a);
  return key.length >= 120 && key === synopsisKey(b);
}

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
  if (sharesSynopsis(a, b) && (sameDeveloper || releaseDistance(a, b) <= 366 * 3)) return true;
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
  return core.some(other => other.game.platforms[0] && other.game.platforms[0] !== platform &&
    (other.game.releaseDate === date || (releaseDistance(row, other) <= 366 * 3 && sharesSynopsis(row, other))))
    || core.every(other => compatible(row, other, titleRows));
}

function editionGroups(rows) {
  const credited = rows.filter(row => row.credits.length);
  const sparse = rows.filter(row => !row.credits.length);
  const cores = completeLink(credited, (a, b) => sharesDeveloper(a, b) && compatible(a, b, credited));
  const proposals = new Map(cores.map(core => [core, []]));
  const remainder = [];
  for (const row of sparse) {
    const possible = cores.filter(core => fitsSparseRelease(row, core, rows));
    const bySynopsis = possible.filter(core => core.some(other => row.game.platforms[0] !== other.game.platforms[0] &&
      releaseDistance(row, other) <= 366 * 3 && sharesSynopsis(row, other)));
    const candidates = bySynopsis.length ? bySynopsis : possible;
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
  // Without studio credits, dates alone do not identify a work. Keep
  // uncorroborated namesakes separate rather than joining sparse clusters.
  return [...cores, ...remainder, ...completeLink(sparse.filter(row => !eligible.has(row)),
    (a, b) => sharesSynopsis(a, b) && compatible(a, b, rows))]
    .map(group => group.sort((a, b) => order.get(a) - order.get(b)))
    .sort((a, b) => order.get(a[0]) - order.get(b[0]));
}

// Verified catalog relationships, not title-wide overrides. The IDs, platforms,
// and release dates must all match; additional editions are never admitted.
// Sources: https://finji.co/games/tunic/ and the platform release announcements.
// Bit Kid confirms these ports belong to one game. The dates below are
// TheGamesDB record fingerprints, not official launch dates.
// https://bitkidgames.com/?p=3819 and https://bitkidgames.com/?cat=5
export const chasmCatalogRows = new Map([
  ['61219', ['PC', '2018-07-21']], ['73935', ['Xbox One', '2018-11-09']],
  ['62691', ['Nintendo Switch', '2020-10-09']], ['62294', ['PlayStation 4', '2018-07-31']],
  ['75725', ['PS Vita', '2018-07-31']],
]);
const verifiedPorts = new Map([
  ['chasm', chasmCatalogRows],
  ['tunic', new Map([
    ['66459', ['PC', '2022-03-16']],
    ['99191', ['Xbox One', '2022-03-16']],
    ['104354', ['Xbox Series X|S', '2022-03-16']],
    ['104890', ['Nintendo Switch', '2022-09-27']],
  ])],
]);

function reviewedEditionGroups(key, rows) {
  const groups = editionGroups(rows);
  const review = verifiedPorts.get(key);
  if (!review) return groups;
  const verified = rows.filter(row => {
    const expected = review.get(sourceId(row));
    return expected && row.game.platforms[0] === expected[0] && row.game.releaseDate === expected[1];
  });
  if (!verified.length || verified.some(row => row.credits.length && verified.some(other =>
    other.credits.length && !sharesDeveloper(row, other)))) return groups;
  // Do not rerun inference without these rows: removing an anchor could make
  // another same-title edition appear unambiguous when it is not.
  const members = new Set(verified);
  const order = new Map(rows.map((row, i) => [row, i]));
  return [verified, ...groups.map(group => group.filter(row => !members.has(row))).filter(group => group.length)]
    .sort((a, b) => order.get(a[0]) - order.get(b[0]));
}

function compoundStudios(row) {
  return (row.game.developers || []).flatMap(value => {
    // Do not mistake comma-separated corporate suffixes for another studio.
    const pieces = value.replace(/,\s*(?:incorporated|inc|corporation|corp|co|limited|ltd|llc|plc|gmbh)\.?(?=\s*,|\s*$)/giu, '')
      .split(/,\s+/u).map(developerKey).filter(Boolean);
    return pieces.length >= 2 ? pieces : [];
  });
}

// Require a unique exact-day anchor for an unresolved port, not a broad year match.
// Compound credits must independently corroborate the target studio.
function attachSameDayPorts(groups, rows) {
  const proposals = new Map();
  const publisherKeys = row => (row.game.publishers || []).map(name => name.normalize('NFKC').trim().toLowerCase());
  for (const [row, ...rest] of groups) {
    const platform = row.game.platforms[0], date = row.game.releaseDate;
    const compound = compoundStudios(row);
    if (rest.length || (row.credits.length && !compound.length) || !platform || !date) continue;
    const studioFits = other => sharesDeveloper(row, other) || (other.game.developers || [])
      .some(name => compound.includes(developerKey(name)));
    const matching = groups.map(group => ({group, anchors: group.filter(other =>
      other.credits.length && other.game.platforms[0] && other.game.platforms[0] !== platform &&
      other.game.releaseDate === date && (!compound.length || studioFits(other)))})).filter(({anchors}) => anchors.length);
    if (matching.length !== 1) continue;
    const {group, anchors} = matching[0];
    if (group.some(other => other.game.platforms[0] === platform)) continue;
    if (compound.length && group.some(other => other.credits.length && !studioFits(other))) continue;
    const pubs = compound.length ? [] : publisherKeys(row);
    if (pubs.length && anchors.some(anchor => {
      const known = publisherKeys(anchor);
      return known.length && !known.some(name => pubs.includes(name));
    })) continue;
    if (!proposals.has(group)) proposals.set(group, []);
    proposals.get(group).push(row);
  }
  const attached = new Set();
  const order = new Map(rows.map((row, i) => [row, i]));
  const expanded = groups.map(group => {
    const candidates = proposals.get(group) || [];
    const unique = candidates.filter(row => !candidates.some(other =>
      other !== row && other.game.platforms[0] === row.game.platforms[0]));
    unique.forEach(row => attached.add(row));
    return [...group, ...unique].sort((a, b) => order.get(a) - order.get(b));
  });
  return expanded.filter(group => group.length > 1 || !attached.has(group[0]))
    .sort((a, b) => order.get(a[0]) - order.get(b[0]));
}

export function groupTheGamesDBVersions(rows, primaryId = '') {
  const titles = new Map();
  for (const row of rows) {
    const key = catalogKey(row.game.title) || '#' + sourceId(row);
    if (!titles.has(key)) titles.set(key, []);
    titles.get(key).push(row);
  }
  return [...titles].flatMap(([key, matches]) => attachSameDayPorts(reviewedEditionGroups(key, matches), matches)).map(members => {
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
