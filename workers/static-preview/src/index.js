import accounts from '../../gaming-accounts/src/index.js';
import metadata from '../../ns-counter/src/index.js';
export { IgdbApi } from '../../ns-counter/src/index.js';
import { dispatch } from './router.js';

export default {
  fetch(request, env, ctx) {
    return dispatch(request, env, ctx, {accounts, metadata});
  }
};
