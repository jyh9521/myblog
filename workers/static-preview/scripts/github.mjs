import {execFileSync} from 'node:child_process';
// Read an existing credential without persisting it or printing it to logs.
export function githubToken() {
  const credential=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},timeout:15000});
  const token=credential.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
  if(!token)throw Error('Existing GitHub credential not found');
  return token;
}
export async function github(path,options={}) {
  const r=await fetch('https://api.github.com'+path,{...options,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+githubToken(),'X-GitHub-Api-Version':'2022-11-28',...options.headers}});
  if(!r.ok)throw Error('GitHub request '+path+' HTTP '+r.status);
  return r.status===204?null:r.json();
}
if(process.argv[2]==='init-branch') {
  const branch='codex/static-assets-preview';
  const main=await github('/repos/jyh9521/myblog/git/ref/heads/main');
  const token=githubToken();
  const existing=await fetch('https://api.github.com/repos/jyh9521/myblog/git/ref/heads/'+branch,{headers:{Authorization:'Bearer '+token}});
  if(existing.status===404)await github('/repos/jyh9521/myblog/git/refs',{method:'POST',body:JSON.stringify({ref:'refs/heads/'+branch,sha:main.object.sha})});
  else if(!existing.ok)throw Error('Branch lookup HTTP '+existing.status);
  console.log('PREVIEW_CMS_BRANCH '+branch+' main='+main.object.sha+' production ref unchanged');
}
