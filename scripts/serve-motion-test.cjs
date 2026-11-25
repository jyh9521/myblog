// Local static-export test server; no production runtime dependency.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'out');
const assets=new Map();
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');let f=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!f.startsWith(root+path.sep)&&f!==root){res.writeHead(403).end();return;}if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');if(!fs.existsSync(f)){
  // Production serves uploads from a separate R2 Worker, not the static export.
  if(url.pathname.startsWith('/uploads/')){let asset=assets.get(url.pathname);if(!asset){const response=await fetch('https://blog.blfy.cc'+url.pathname);if(!response.ok){res.writeHead(response.status).end();return;}asset={type:response.headers.get('content-type'),body:Buffer.from(await response.arrayBuffer())};assets.set(url.pathname,asset);}res.setHeader('Content-Type',asset.type||'application/octet-stream');res.end(asset.body);return;}
  res.writeHead(404).end();return;
}const ext=path.extname(f);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'})[ext]||'application/octet-stream');fs.createReadStream(f).pipe(res);}catch{res.writeHead(400).end();}}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Static export server ready'));
