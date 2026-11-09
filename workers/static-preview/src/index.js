import accounts from '../../gaming-accounts/src/index.js';
import metadata from '../../ns-counter/src/index.js';
export { IgdbApi } from '../../ns-counter/src/index.js';
import { dispatch } from './router.js';

export default {
  fetch(request, env, ctx) {
    const previewMetadata = { fetch: request => metadata.fetch(request, { ...env,
      GAME_ADMIN: { fetch: probe => accounts.fetch(probe, env, ctx) },
    }, ctx) };
    return dispatch(request, env, ctx, { accounts, metadata: previewMetadata });
  }
};
