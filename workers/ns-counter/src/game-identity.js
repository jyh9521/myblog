
import gamePlatforms from '../../../public/sveltia/game-platforms.js';

const text = value => typeof value === 'string' ? value.trim() : '';
// Keep edition markers, numbers and subtitles. Punctuation is not evidence.
const key = value => text(value).normalize('NFKC').toLowerCase()
  .replace(/[™®©]/gu, '').replace(/[^\p{L}\p{N}]+/gu, '');
const aliasKey = value => key(value).replace(/バイオハザード|biohazard/g, 'residentevil');
const aliases = game => [game?.title, game?.originalName, game?.localizedName, ...(game?.alternativeNames || [])].map(aliasKey).filter(Boolean);
export const releaseYear = value => text(value).match(/(?:19|20)\d{2}/)?.[0] || '';
const overlap = (a, b) => a.some(item => b.includes(item));
const compare = (a, b) => !a.length || !b.length ? 0 : overlap(a, b) ? 1 : -1;
const platformKeys = value => gamePlatforms.normalizePlatformList(value).map(key);
export function developerKey(value) {
  const original = text(value).normalize('NFKC').trim();
  let name = original, previous;
  // Store and catalog credits can include different legal suffixes
  // ("Valve" vs. "Valve Corporation"). Keep studio/branch qualifiers.
  do {
    previous = name;
    name = name.replace(/[\s,]+(?:company|co|corporation|corp|incorporated|inc|limited|ltd|llc|plc|gmbh)\.?$/iu, '').trim();
  } while (name !== previous);
  return key(name || original);
}
const developerKeys = values => (Array.isArray(values) ? values : []).map(developerKey).filter(Boolean);

export function editionEvidence(reference, candidate) {
  const yearA = releaseYear(reference?.releaseDate), yearB = releaseYear(candidate?.releaseDate);
  const evidence = {
    title: compare(aliases(reference), aliases(candidate)),
    year: compare(yearA ? [yearA] : [], yearB ? [yearB] : []),
    platform: compare(platformKeys(reference?.platforms), platformKeys(candidate?.platforms)),
    developer: compare(developerKeys(reference?.developers), developerKeys(candidate?.developers)),
  };
  const independent = [evidence.year, evidence.platform, evidence.developer].filter(result => result === 1).length;
  const conflict = Object.values(evidence).includes(-1);
  return { ...evidence, independent, conflict, strong: !conflict && evidence.title === 1 && independent >= 2 };
}

export function rankEditions(candidates, hints) {
  const ranked = candidates.map((candidate, index) => {
    const { title, year, platform, developer, independent, strong } = editionEvidence(hints, candidate);
    // A search term may be an abbreviation. Treat its mismatch as weak name
    // evidence, not a factual conflict like an explicitly selected platform.
    const conflict = [year, platform, developer].includes(-1);
    const score = (title === 1 ? 2 : 0) + independent * 3 - [year, platform, developer].filter(value => value === -1).length * 8;
    return { ...candidate, index, score, strong, match: {
      confidence: conflict ? 'conflict' : 'review',
      matched: Object.keys({ title, year, platform, developer }).filter(key => ({ title, year, platform, developer })[key] === 1),
      conflicts: Object.keys({ year, platform, developer }).filter(key => ({ year, platform, developer })[key] === -1),
    } };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const strongCount = ranked.filter(candidate => candidate.strong).length;
  return ranked.map(({ index, score, strong, ...candidate }) => ({
    ...candidate, match: { ...candidate.match, confidence: strong && strongCount === 1 ? 'high' : candidate.match.confidence },
  }));
}
