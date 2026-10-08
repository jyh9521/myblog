export type PlayTime = { hours: number; minutes: number; totalMinutes: number };
export type CompletionTimes = { url: string; main?: number; extras?: number; completionist?: number };

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function number(value: unknown): number | undefined {
  if ((typeof value === 'string' && !value.trim()) || value === null || value === undefined || typeof value === 'boolean') return undefined;
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  return Number.isFinite(result) && result >= 0 ? result : undefined;
}
export function normalizePlayTime(value: unknown): PlayTime | null {
  const input = record(value);
  const hours = number(input.hours), minutes = number(input.minutes);
  if (hours === undefined && minutes === undefined) return null;
  const supplied = (value: unknown) => value !== undefined && value !== null && !(typeof value === 'string' && !value.trim());
  if ((supplied(input.hours) && hours === undefined) || (supplied(input.minutes) && minutes === undefined)) return null;
  if (!Number.isSafeInteger(hours ?? 0) || !Number.isSafeInteger(minutes ?? 0) || (minutes ?? 0) > 59) return null;
  const totalMinutes = (hours ?? 0) * 60 + (minutes ?? 0);
  if (!Number.isSafeInteger(totalMinutes)) return null;
  return { hours: hours ?? 0, minutes: minutes ?? 0, totalMinutes };
}
export function formatPlayHours(totalMinutes: number): string {
  return (totalMinutes / 60).toFixed(1);
}
export function normalizeCompletionTimes(value: unknown): CompletionTimes | null {
  const input = record(value);
  try {
    const url = new URL(typeof input.url === 'string' ? input.url.trim() : '');
    if (url.protocol !== 'https:' || !['howlongtobeat.com', 'www.howlongtobeat.com'].includes(url.hostname) || url.username || url.password || url.port) return null;
    const id = url.pathname.match(/^\/game\/(\d+)\/?$/)?.[1] || (url.pathname === '/game.php' ? url.searchParams.get('id') : null);
    if (!id || !/^[1-9]\d*$/.test(id)) return null;
    const result: CompletionTimes = { url: `https://howlongtobeat.com/game/${id}` };
    for (const key of ['main', 'extras', 'completionist'] as const) {
      const hours = number(input[key]);
      if (hours !== undefined && hours > 0) result[key] = hours;
    }
    return result;
  } catch { return null; }
}
