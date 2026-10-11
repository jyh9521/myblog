export type PostVisibility = 'public' | 'password' | 'unlisted';
export function parsePostAccess(value: string): { visibility: PostVisibility; body: string; privateId: string } {
  const match = value.match(/^\s*<!-- blfy-access:(unlisted|password)(?::([a-f0-9]{32}))? -->\s*/);
  if (!match) {
    if (/^\s*<!--\s*blfy-access:/i.test(value)) throw new Error('Invalid article access marker');
    return { visibility: 'public', body: value, privateId: '' };
  }
  if (match[1] === 'password') {
    if (!match[2] || value.slice(match[0].length).trim()) throw new Error('Protected article must contain only a private reference');
    return { visibility: 'password', body: '', privateId: match[2] };
  }
  if (match[2]) throw new Error('Invalid unlisted article marker');
  return { visibility: 'unlisted', body: value.slice(match[0].length), privateId: '' };
}
