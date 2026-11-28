import { isSiteSearchIndex, type SiteSearchIndex } from './site-search';

type SearchFetch = (url: string, options: { signal: AbortSignal }) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;

/** Share one in-flight download across quick reopen/page navigation; failures never poison retries. */
export function createSiteSearchLoader(request: SearchFetch, timeout = 15000) {
  let cached: SiteSearchIndex | null = null, pending: Promise<SiteSearchIndex> | null = null;
  return function load(): Promise<SiteSearchIndex> {
    if (cached) return Promise.resolve(cached);
    if (pending) return pending;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    pending = request('/search-index.json', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(`Search index HTTP ${response.status}`);
      const result: unknown = await response.json();
      if (!isSiteSearchIndex(result)) throw new Error('Invalid search index');
      cached = result; return result;
    }).finally(() => { clearTimeout(timer); pending = null; });
    return pending;
  };
}

export const loadSiteSearchIndex = createSiteSearchLoader((url, options) => fetch(url, options));
