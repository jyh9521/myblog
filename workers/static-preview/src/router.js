// Explicit dispatch keeps preview writes in its own backend/database.
export function backendFor(path) {
  if (path === '/ns/api/accounts/public') return 'public-accounts';
  if (path === '/ns/api/accounts' || path.startsWith('/ns/api/accounts/') ||
      path.startsWith('/ns/api/posts/') || path.startsWith('/api/auth/')) return 'accounts';
  if (path.startsWith('/ns/api/')) return 'metadata';
  return 'assets';
}

export async function dispatch(request, env, ctx, backends) {
  const target = backendFor(new URL(request.url).pathname);
  let response;
  if (target === 'public-accounts') {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response = Response.json({error:'METHOD_NOT_ALLOWED'}, {status:405});
    } else {
      // Never forward preview cookies or credentials into production.
      response = await env.PUBLIC_ACCOUNTS.fetch(new Request(
        'https://blog.blfy.cc/ns/api/accounts/public', {method:'GET'}));
    }
  } else if (target === 'assets') {
    response = await env.ASSETS.fetch(request);
  } else {
    response = await backends[target].fetch(request, env, ctx);
  }
  const result = new Response(request.method === 'HEAD' ? null : response.body, response);
  result.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return result;
}
