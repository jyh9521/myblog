type ShareServices = { share?: (data: { title: string; url: string }) => Promise<void>; clipboard?: { writeText: (text: string) => Promise<void> } };
export async function copyText(text: string, services: ShareServices): Promise<'copied' | 'failed'> {
  try { if (!services.clipboard) return 'failed'; await services.clipboard.writeText(text); return 'copied'; }
  catch { return 'failed'; }
}
export async function shareLink(title: string, url: string, services: ShareServices): Promise<'shared' | 'cancelled' | 'copied' | 'failed'> {
  if (services.share) {
    try { await services.share({ title, url }); return 'shared'; }
    catch (error) { if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'cancelled'; }
  }
  return copyText(url, services);
}
export function downloadState(status: number) {
  return status >= 200 && status < 300 ? 'ready' : status === 405 || status === 501 ? 'unchecked' : 'failed';
}
