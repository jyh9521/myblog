import gamePlatforms from '../../../public/sveltia/game-platforms.js';
import { developerKey, editionEvidence } from './game-identity.js';
import { combineCandidates } from './game-providers.js';
import { reviewedCrossCatalogPorts } from './reviewed-cross-catalog-ports.js';

function releaseViews(game) {
  const catalog = game.sources?.thegamesdb?.versions;
  if (catalog?.length) return catalog.map(({ platform, releaseDate }) => ({ ...game, platforms: [platform], releaseDate }));
  if (Object.keys(game.platformReleaseDates || {}).length) return game.platforms.map(platform => ({
    ...game, platforms: [platform], releaseDate: game.platformReleaseDates[platform] || game.releaseDate,
  }));
  return [game];
}

const editionWords = /\b(?:remaster(?:ed)?|remake|deluxe|premium|collector(?:['’]s)?|definitive|limited|special|memoire|ultimate|pact|steelbook)\b/gi;
const editionTags = game => [...new Set((game.originalName || game.title || '').toLowerCase().match(editionWords) || [])]
  .map(tag => tag.replace(/['’]s$/, '').replace(/remastered$/, 'remaster')).sort().join(',');

const exactTitle = game => (game.originalName || game.title || '').normalize('NFKC')
  .toLowerCase().replace(/[™®©]/gu, '').replace(/[^\p{L}\p{N}]+/gu, '');

function reviewedPortMatches(base, candidate, reviews) {
  const source = base.sources?.thegamesdb;
  if (!source) return false;
  const catalogRows = source.versions || [{ id: source.id, platform: base.platforms?.[0], releaseDate: base.releaseDate }];
  return reviews.some(({ title, anchor, port }) => {
    const reference = candidate.sources?.[port.provider];
    if (reference?.id !== port.id || (port.systemId && reference.systemId !== port.systemId)) return false;
    const titleKey = exactTitle({ title });
    if (exactTitle(base) !== titleKey || exactTitle(candidate) !== titleKey) return false;
    if (candidate.platforms?.length !== 1 || candidate.platforms[0] !== port.platform) return false;
    if (!catalogRows.some(row => row.id === anchor.id && row.platform === anchor.platform && row.releaseDate === anchor.releaseDate)) return false;
    if (catalogRows.some(row => row.platform === port.platform)) return false;
    if (candidate.releaseDate && !port.releaseDates.includes(candidate.releaseDate)) return false;
    return ['developers', 'publishers'].every(field => !(candidate[field] || []).length ||
      candidate[field].some(name => port[field].map(developerKey).includes(developerKey(name))));
  });
}

export function matchesCatalogEdition(base, candidate, reviews = reviewedCrossCatalogPorts) {
  // Do not let an alias bridge an explicitly named edition and the base game.
  if (editionTags(base) !== editionTags(candidate)) return false;
  return reviewedPortMatches(base, candidate, reviews) || releaseViews(base).some(a => releaseViews(candidate).some(b => editionEvidence(a, b).strong));
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
