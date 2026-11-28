const fs=require('node:fs'),path=require('node:path'),matter=require('gray-matter'),{execFileSync}=require('node:child_process');
const {resourceFor}=require('./resource-catalog.cjs');
async function buildHealth(root=process.cwd()) {
  const {unified}=await import('unified'),{default:parse}=await import('remark-parse');
  const issues=[],read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch{return fallback;}},audit=read('reports/link-audit.json',null);
  const remote=new Map((Array.isArray(audit)?audit:[]).map(item=>[item.url,item]));
  const add=(kind,title,href,message,edit)=>issues.push({kind,title,href,message,edit});
  const records=folder=>fs.existsSync(path.join(root,folder))?fs.readdirSync(path.join(root,folder)).filter(file=>/^[a-z0-9-]+\.md$/.test(file)).map(file=>({slug:file.slice(0,-3),...matter(fs.readFileSync(path.join(root,folder,file),'utf8'))})):[];
  for(const post of records('content/posts')) {
    if((post.data.access?.mode&&post.data.access.mode!=='public')||/^\s*<!--\s*blfy-access:/i.test(post.content))continue;
    const title=String(post.data.title||post.slug),href=`/posts/${post.slug}/`,edit=`/sveltia/#/collections/post/entries/${post.slug}`;
    const tree=unified().use(parse).parse(post.content),nodes=node=>[node,...(node.children||[]).flatMap(nodes)],all=nodes(tree);
    const definitions=new Map(all.filter(node=>node.type==='definition').map(node=>[node.identifier,node.url]));
    const values=[post.data.cover,post.data.audio,post.data.video,post.data.attachment,...all.flatMap(node=>{
      if(['link','image'].includes(node.type))return[node.url];
      if(['linkReference','imageReference'].includes(node.type))return[definitions.get(node.identifier)];
      if(node.type==='html')return[...node.value.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match=>match[1]);
      if(node.type==='text')return[...node.value.matchAll(/\[compare\]([^|\]]+)\|([^|\]]+)/g)].flatMap(match=>[match[1],match[2]]);
      return[];
    })].filter(value=>typeof value==='string');
    for(const url of new Set(values)) {
      if(url.startsWith('/uploads/')) {
        let decoded;try{decoded=decodeURIComponent(url.split(/[?#]/)[0]);}catch{continue;}
        if(decoded.includes('..')||decoded.includes('\\'))continue;
        if(!fs.existsSync(path.join(root,'public',decoded.slice(1)))&&!resourceFor(url,root)) {
          const config=read('resources.config.json',{}),catalogKnown=fs.existsSync(path.join(root,'public/sveltia/r2-assets.json'));
          add(config.enabled&&!catalogKnown?'asset-unconfirmed':'missing-asset',title,href,`${config.enabled&&!catalogKnown?'资源清单未同步，待核对':'引用文件缺失'}：${url}`,edit);
        }
      }
      if(remote.get(url)?.state==='broken')add('broken-link',title,href,`外链返回 ${remote.get(url).status}：${url}`,edit);
    }
  }
  for(const game of records('content/games')) {
    const data=game.data,metadata=data.gameMetadata||{},missing=[];
    if(!metadata.cover&&!data.cover)missing.push('封面');
    if(!metadata.releaseDate&&!data.releaseDate)missing.push('发行日期');
    if(!data.platforms?.length&&!metadata.platforms?.length)missing.push('平台');
    if(missing.length)add('game-fields',String(data.title||metadata.title||game.slug),`/games/${game.slug}/`,'可补充：'+missing.join('、'),`/sveltia/#/collections/games/entries/${game.slug}`);
  }
  let revision='unknown';try{revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
  return {version:1,generatedAt:new Date().toISOString(),revision,issues,linkAudit:{available:Array.isArray(audit),checkedAt:Array.isArray(audit)?fs.statSync(path.join(root,'reports/link-audit.json')).mtime.toISOString():null,unconfirmed:(audit||[]).filter(item=>item.state==='unknown').length},backup:{state:'unverified',message:'尚未登记生产 Git / R2 / D1 的完整恢复演练。浏览器草稿备份与资源回收区不等同于完整备份。'}};
}
module.exports={buildHealth};
if(require.main===module)buildHealth().then(report=>{fs.mkdirSync('public/sveltia',{recursive:true});fs.writeFileSync('public/sveltia/health.json',JSON.stringify(report,null,2));console.log(`MAINTENANCE ${report.issues.length} public-content items; production recovery unverified`);}).catch(error=>{console.error(error);process.exitCode=1;});
