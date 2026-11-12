import gamePlatforms from '../../../public/sveltia/game-platforms.js';
import { editionEvidence } from './game-identity.js';
import { combineCandidates } from './game-providers.js';

function releaseViews(game) {
  const catalog = game.sources?.thegamesdb?.versions;
  if (catalog?.length) return catalog.map(({ platform, releaseDate }) => ({ ...game, platforms: [platform], releaseDate }));
  if (Object.keys(game.platformReleaseDates || {}).length) return game.platforms.map(platform => ({
    ...game, platforms: [platform], releaseDate: game.platformReleaseDates[platform] || game.releaseDate,
  }));
  return [game];
}

const editionWords = /\b(?:remaster(?:ed)?|remake|deluxe|premium|collector(?:['’]s)?|definitive|limited|special|memoire)\b/gi;
const editionTags = game => [...new Set((game.originalName || game.title || '').toLowerCase().match(editionWords) || [])]
  .map(tag => tag.replace(/['’]s$/, '').replace(/remastered$/, 'remaster')).sort().join(',');

export function matchesCatalogEdition(base, candidate) {
  // Do not let an alias bridge an explicitly named edition and the base game.
  if (editionTags(base) !== editionTags(candidate)) return false;
  return releaseViews(base).some(a => releaseViews(candidate).some(b => editionEvidence(a, b).strong));
}

const present = value => Array.isArray(value) ? value.length > 0 : Boolean(value);
const listKey = value => value.normalize('NFKC').toLowerCase().trim();

export function supplementCatalog(base, candidate, provider) {
  const merged = { ...base, sources: { ...base.sources, [provider]: candidate.sources[provider] },
    fieldSources: { ...base.fieldSources } };
  const fill = (key, value) => {
    if (!present(merged[key]) && present(value)) {
      merged[key] = value;
      merged.fieldSources[key] = provider;
    }
  };
  for (const key of ['localizedName', 'originalName', 'releaseDate', 'developers', 'publishers', 'cover', 'website']) fill(key, candidate[key]);
  for (const key of ['alternativeNames', 'genres', 'platforms', 'screenshots']) {
    const incoming = key === 'platforms' ? gamePlatforms.normalizePlatformList(candidate[key]) : candidate[key] || [];
    if (!present(merged[key])) { fill(key, incoming); continue; }
    const seen = new Set(merged[key].map(key === 'screenshots' ? value => value : listKey));
    merged[key] = [...merged[key], ...incoming.filter(value => {
      const id = key === 'screenshots' ? value : listKey(value);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })];
  }
  return merged;
}

export function combineDossierSources(catalog, rawg, screen) {
  const supplements = { rawg, screenscraper: screen };
  const used = new Set();
  const merged = catalog.map(base => {
    let result = base;
    for (const [provider, rows] of Object.entries(supplements)) {
      const matches = rows.filter(row => matchesCatalogEdition(base, row));
      if (matches.length !== 1 || catalog.filter(other => matchesCatalogEdition(other, matches[0])).length !== 1) continue;
      used.add(matches[0]);
      result = supplementCatalog(result, matches[0], provider);
    }
    return result;
  });
  return [...merged, ...combineCandidates(rawg.filter(row => !used.has(row)), screen.filter(row => !used.has(row)))];
}
