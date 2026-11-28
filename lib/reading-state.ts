export type ReadingPreferences = { fontSize: number; lineSpacing: number; rememberPosition: boolean };
export type ReadingPosition = { version: 1; path: string; heading: string; scrollY: number; progress: number; updatedAt: number };
type ReadingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const READING_PREFERENCES_KEY = 'blog:reading-preferences:v1';
const positionKey = (path: string) => `blog:reading-position:v1:${encodeURIComponent(path)}`;
const defaultPreferences: ReadingPreferences = { fontSize: 0, lineSpacing: 1, rememberPosition: false };
// The head runs this before layout/history restoration, independently of hydration.
// Keep this static and storage-only: it never reads or writes an article position.
export const readingPreferencesBootstrap = `try{var p=JSON.parse(localStorage.getItem('blog:reading-preferences:v1')||'null')||{};var preset=function(n,d){return typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(2,Math.round(n))):d};document.documentElement.style.setProperty('--reading-font-size',[17,19,21][preset(p.fontSize,0)]+'px');document.documentElement.style.setProperty('--reading-line-spacing',String([1.7,1.95,2.2][preset(p.lineSpacing,1)]))}catch(e){}`;

export function clampReadingPreferences(value: unknown): ReadingPreferences {
  const input = value && typeof value === 'object' ? value as Partial<ReadingPreferences> : {};
  const preset = (n: unknown, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(2, Math.round(n))) : fallback;
  return { fontSize: preset(input.fontSize, 0), lineSpacing: preset(input.lineSpacing, 1), rememberPosition: input.rememberPosition === true };
}

export function readReadingPreferences(storage: ReadingStorage | null): ReadingPreferences {
  try { return clampReadingPreferences(JSON.parse(storage?.getItem(READING_PREFERENCES_KEY) || 'null')); }
  catch { return { ...defaultPreferences }; }
}

export function writeReadingPreferences(storage: ReadingStorage | null, value: unknown): boolean {
  try { if (!storage) return false; storage.setItem(READING_PREFERENCES_KEY, JSON.stringify(clampReadingPreferences(value))); return true; }
  catch { return false; }
}

function validPosition(value: unknown): ReadingPosition | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as ReadingPosition;
  if (p.version !== 1 || typeof p.path !== 'string' || !/^\/posts\/[^/?#]+\/$/.test(p.path) ||
    typeof p.heading !== 'string' || p.heading.length > 512 || !Number.isFinite(p.scrollY) || p.scrollY < 0 || p.scrollY > 10000000 ||
    !Number.isFinite(p.progress) || p.progress < 0 || p.progress > 1 || !Number.isFinite(p.updatedAt) || p.updatedAt < 0) return null;
  // Intentionally reconstruct the record: never serialize article bodies, titles or extras.
  return { version: 1, path: p.path, heading: p.heading, scrollY: p.scrollY, progress: p.progress, updatedAt: p.updatedAt };
}

export function readReadingPosition(storage: ReadingStorage | null, path: string, now = Date.now()): ReadingPosition | null {
  try {
    const record = validPosition(JSON.parse(storage?.getItem(positionKey(path)) || 'null'));
    return record && record.path === path && record.updatedAt <= now && now - record.updatedAt < 30 * 86400000 ? record : null;
  } catch { return null; }
}

export function writeReadingPosition(storage: ReadingStorage | null, value: unknown): boolean {
  const record = validPosition(value);
  try { if (!record || !storage) return false; storage.setItem(positionKey(record.path), JSON.stringify(record)); return true; }
  catch { return false; }
}

export function removeReadingPosition(storage: ReadingStorage | null, path: string): boolean {
  try { if (!storage) return false; storage.removeItem(positionKey(path)); return true; }
  catch { return false; }
}

export function shouldOfferReadingResume({ position, path, hash, navigationType, historyRestored, longArticle, enabled, scrollY }: {
  position: ReadingPosition | null; path: string; hash: string; navigationType: string; historyRestored: boolean; longArticle: boolean; enabled: boolean; scrollY: number;
}): boolean {
  return Boolean(enabled && longArticle && position && position.path === path && position.scrollY > 200 && position.progress < .98 &&
    !hash && navigationType !== 'back_forward' && !historyRestored && scrollY <= 80);
}
