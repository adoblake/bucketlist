// One command for the whole suite: unit tests, builds, local servers, and every browser check.
//   npm run test:all                 run everything
//   npm run test:all -- safety play  run only browser suites whose names contain these words
// Set BROWSER_EXECUTABLE to use a system Chromium. Screenshots go to $QA_OUT (default: <tmp>/bucketlist-qa).
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PUBLIC_APP_URL} from '../public/site-config.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const filters=process.argv.slice(2);
const base=Number(process.env.TEST_PORT_BASE||4100);
const ports={map:base,phone:base+1,community:base+20,play:base+40};
const map=`http://127.0.0.1:${ports.map}`,phone=`http://127.0.0.1:${ports.phone}${new URL(PUBLIC_APP_URL).pathname}`;
const community=`http://127.0.0.1:${ports.community}/community/`,playOrigin=`http://127.0.0.1:${ports.play}`;
const standalone='file://'+root+'BucketList.html';

const suites=[
 ['browser',{APP_URL:map}],['game-plan-browser',{APP_URL:map}],['appearance-notices',{APP_URL:map}],['location',{APP_URL:map}],
 ['calendar',{APP_URL:map}],['courts',{APP_URL:map}],['showcase',{APP_URL:map}],['arizona-browser',{APP_URL:map}],
 ['court-photos',{APP_URL:standalone}],['phone',{PHONE_URL:phone}],['app-updates',{APP_URL:phone}],
 ['community-browser',{COMMUNITY_URL:community}],['email-auth-browser',{COMMUNITY_URL:community}],['safety-browser',{COMMUNITY_URL:community}],
 ['play-browser',{COMMUNITY_ORIGIN:playOrigin,APP_URL:map}],
].filter(([name])=>!filters.length||filters.some(f=>name.includes(f)));

const run=(cmd,args,env={})=>new Promise(resolve=>{const child=spawn(cmd,args,{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);child.on('close',code=>resolve({code,out}));});
const servers=[];
function serve(script,port,env={}){const child=spawn(process.execPath,[script],{cwd:root,env:{...process.env,PORT:String(port),...env},stdio:'ignore'});servers.push(child);return child;}
async function ready(url){for(let i=0;i<100;i++){try{const r=await fetch(url,{redirect:'manual'});if(r.status<500)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server did not start: '+url);}
const stopAll=()=>{for(const s of servers)s.kill();};
process.on('SIGINT',()=>{stopAll();process.exit(130);});

const results=[];const started=Date.now();
const step=async(label,promise)=>{const t=Date.now();const {code,out}=await promise;const ok=code===0;const last=out.trim().split('\n').filter(Boolean).pop()||'';results.push({label,ok,seconds:((Date.now()-t)/1000).toFixed(1),detail:ok?last.slice(0,110):out.trim().split('\n').slice(0,12).join('\n')});console.log(`${ok?'✓':'✗'} ${label} (${results.at(-1).seconds}s)${ok?'':'\n'+results.at(-1).detail.replace(/^/gm,'    ')}`);return ok;};

try{
 if(!filters.length)await step('unit tests (npm test)',run('npm',['test']));
 const built=await step('build web + standalone',run('npm',['run','build:web']))&await step('build community worker',run('npm',['run','build:community']));
 if(!built)throw Error('Build failed; browser suites skipped.');
 serve('server.js',ports.map);serve('scripts/preview-web.mjs',ports.phone);
 serve('scripts/community-local.mjs',ports.community,{MODERATOR_IDS:'chatgpt:local-mod'});serve('scripts/community-local.mjs',ports.play);
 await Promise.all([ready(map),ready(phone),ready(community),ready(playOrigin+'/play/')]);
 for(const [name,env] of suites)await step(name,run(process.execPath,['tests/'+name+'.cjs'],env));
}catch(error){console.error(error.message);}
finally{stopAll();}
const failed=results.filter(r=>!r.ok);
console.log(`\n${results.length-failed.length}/${results.length} passed in ${((Date.now()-started)/1000).toFixed(0)}s${failed.length?' · failed: '+failed.map(f=>f.label).join(', '):''}`);
process.exitCode=failed.length||!results.length?1:0;
