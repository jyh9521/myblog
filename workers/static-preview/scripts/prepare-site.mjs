import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync, cpSync, existsSync, readdirSync, statSync, renameSync, lstatSync} from 'node:fs';
import {resolve, dirname, join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {fixturePdf} from './fixture-pdf.mjs';

const worker=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repo=resolve(worker,'../..');
const ref=process.argv[2] || 'HEAD';
const r2=process.argv.includes('--r2');
const sourceCommit=execFileSync('git',['rev-parse',ref+'^{commit}'],{cwd:repo,encoding:'utf8'}).trim();
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const build=join(worker,'.wrangler','build-'+stamp);
mkdirSync(build,{recursive:true});
const archive=join(build,'source.zip');
execFileSync('git',['archive','--format=zip','--output',archive,sourceCommit],{cwd:repo});
execFileSync('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath '${archive.replaceAll("'","''")}' -DestinationPath '${build.replaceAll("'","''")}'`]);
execFileSync('powershell.exe',['-NoProfile','-Command',`New-Item -ItemType Junction -Path '${join(build,'node_modules').replaceAll("'","''")}' -Target '${join(repo,'node_modules').replaceAll("'","''")}' | Out-Null`]);
// Fixtures are confined to the exported build, not the source repository.
writeFileSync(join(build,'content/posts/preview-protected-check.md'),`---\ntitle: 预览站密码文章验证\ndate: 2026-10-13\ntags: []\naccess:\n  mode: password\n  privateId: 0123456789abcdef0123456789abcdef\n---\n<!-- blfy-access:password:0123456789abcdef0123456789abcdef -->\n`);
writeFileSync(join(build,'public/uploads/预览 验证.pdf'),fixturePdf());
if(!existsSync(join(build,'content/posts/preview-public-check.md')))writeFileSync(join(build,'content/posts/preview-public-check.md'),`---\ntitle: 预览站公开文章验证\ndate: 2026-10-13\ntags: []\naccess:\n  mode: unlisted\n---\n\n## 中文资源与 PDF\n\n![中文文件名](/uploads/chinesetranslationpatch/bloodrayne/主菜单.png)\n\n[预览测试 PDF](/uploads/预览%20验证.pdf "pdf-embed")\n`);
let config=readFileSync(join(build,'public/sveltia/config.yml'),'utf8');
config=config.replace('branch: main','branch: codex/static-assets-preview');
if(r2) {
  config=config.replace(/^media_folder:.*\r?\n/m,'');
  config=config.replace(/widget: image\b/g,'widget: r2-image').replace(/widget: file\b/g,'widget: r2-file').replace('[code-block, image,','[code-block, r2-image,');
  writeFileSync(join(build,'resources.config.json'),JSON.stringify({enabled:true,catalogUrl:'https://blog-static-preview.342433419.workers.dev/ns/api/resources/catalog'}));
  const index=join(build,'public/sveltia/index.html');
  let html=readFileSync(index,'utf8');if(!html.includes('/sveltia/r2-media.js'))html=html.replace('<script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>','<script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script><script src="/sveltia/r2-media.js"></script>');writeFileSync(index,html);
  const customFile=join(build,'public/sveltia/custom.js');
  writeFileSync(customFile,readFileSync(customFile,'utf8').replace(/widget: 'image'/g,"widget: 'r2-image'").replace(/widget: 'file'/g,"widget: 'r2-file'"));
}
writeFileSync(join(build,'public/sveltia/config.yml'),config);
const run=cmd=>execFileSync('cmd.exe',['/d','/s','/c',cmd],{cwd:build,stdio:'inherit'});
run('npm run validate');
run('npm run build');
const out=join(build,'out');
writeFileSync(join(out,'_headers'),'/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n');
writeFileSync(join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
// The existing maintenance UI targets main. Preview must not expose its write controls.
writeFileSync(join(out,'sveltia/maintenance.js'),`document.body.replaceChildren(Object.assign(document.createElement('p'),{textContent:'独立静态托管预览站。CMS 保存到 codex/static-assets-preview；重新构建和部署后生效。本预览不执行资源清理，也不显示正式站发布状态。'}));`);
writeFileSync(join(out,'sveltia/asset-delete.js'),`window.BlogAssetDelete={deleteAssets:async()=>{throw Error('预览站不执行资源清理');}};`);
const files=[];
function scan(dir,prefix='') {for(const name of readdirSync(dir)){const p=join(dir,name),key=prefix+name;if(statSync(p).isDirectory())scan(p,key+'/');else{const bytes=readFileSync(p);if(bytes.length>25*1024*1024)throw Error('Asset exceeds 25 MiB: '+key);files.push({path:key,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
scan(out);
// Keep each prepared output independent, then publish an exact copy.
const site=join(worker,'.wrangler/site');
const staged=join(worker,'.wrangler/site-next-'+stamp),backup=join(worker,'.wrangler/site-backup-'+stamp);
for(const target of [site,staged,backup])if(!resolve(target).startsWith(worker+sep))throw Error('Output escaped preview workspace');
cpSync(out,staged,{recursive:true});
if(existsSync(site)) {
  if(lstatSync(site).isSymbolicLink())throw Error('Preview output must not be a junction');
  renameSync(site,backup);
}
renameSync(staged,site);
writeFileSync(join(worker,'.wrangler/asset-manifest.json'),JSON.stringify({ref,sourceCommit,build,files},null,2));
console.log('PREVIEW_ASSETS files='+files.length+' source='+sourceCommit+' site='+site);
