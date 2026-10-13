import {servePublicResource,resourceAdminRoute} from '../../static-preview/src/public-resources.js';
export default {
  async fetch(request,env,ctx) {
    try {
      const path=new URL(request.url).pathname;
      if(path.startsWith('/uploads/'))return await servePublicResource(request,env);
      if(path==='/ns/api/resources'||path.startsWith('/ns/api/resources/'))return await resourceAdminRoute(request,env,ctx,{fetch:r=>env.GAMING_ACCOUNTS.fetch(r)});
      return new Response('Not found',{status:404});
    }catch{return Response.json({error:'RESOURCE_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});}
  }
};
