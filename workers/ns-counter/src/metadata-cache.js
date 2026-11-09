export async function readMetadataCache(env, key) {
  try {
    const row = await env.DB.prepare('SELECT payload, cached_at FROM game_metadata_cache WHERE cache_key = ?').bind(key).first();
    return row ? { value: JSON.parse(row.payload), cachedAt: Number(row.cached_at) } : null;
  } catch { return null; }
}

export async function writeMetadataCache(env, key, value) {
  try {
    await env.DB.prepare('INSERT INTO game_metadata_cache (cache_key, payload, cached_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at')
      .bind(key, JSON.stringify(value), Date.now()).run();
  } catch { /* The upstream still works if the optional cache is unavailable. */ }
}

export async function cachedMetadata(env, key, ttlMs, producer, force = false) {
  const cached = await readMetadataCache(env, key);
  const ttl = cached && typeof ttlMs === 'function' ? ttlMs(cached.value) : ttlMs;
  if (!force && cached && Date.now() - cached.cachedAt < ttl) return { value: cached.value, cached: true, stale: false };
  try {
    const value = await producer();
    await writeMetadataCache(env, key, value);
    return { value, cached: false, stale: false };
  } catch (error) {
    if (cached) return { value: cached.value, cached: true, stale: true, warning: error instanceof Error ? error.message : '上游数据源暂不可用' };
    throw error;
  }
}
