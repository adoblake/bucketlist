import test from 'node:test';
import assert from 'node:assert/strict';
import {communityApi} from '../worker/community-api.js';
import {testDatabase} from './helpers/d1-sqlite.js';
import {mockEmailProvider} from './helpers/email-provider.js';

const EMAIL='player@example.test';
function fixture(extraEnv={}){
 const DB=testDatabase(),provider=mockEmailProvider(),env={DB,EMAIL_AUTH_ENABLED:'true',SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_mock_public_key_for_tests',...extraEnv};
 const jar=new Map();
 async function request(path,method='GET',body,{cookies=jar,native,headers={}}={}){
  const h={'Content-Type':'application/json',Cookie:[...cookies].map(([name,value])=>name+'='+value).join('; '),...(native?{'oai-authenticated-user-id':native,'oai-authenticated-user-email':EMAIL}:{}),...headers};
  const response=await communityApi(new Request('https://groups.example.test/api/community'+path,{method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{waitUntil(p){p.catch(()=>{});}},{fetch:provider.fetch});
  const setCookies=response.headers.getSetCookie();for(const c of setCookies){const pair=c.split(';')[0],i=pair.indexOf('='),name=pair.slice(0,i),value=pair.slice(i+1);if(value)cookies.set(name,value);else cookies.delete(name);}
  return {status:response.status,data:await response.json(),headers:response.headers,setCookies};
 }
 const start=(email=EMAIL)=>request('/auth/email/start','POST',{email});
 const verify=(code='123456',email=EMAIL)=>request('/auth/email/verify','POST',{email,code});
 const signIn=async()=>{assert.equal((await start()).status,200);assert.equal((await verify()).status,200);return request('/me');};
 return {DB,env,provider,jar,request,start,verify,signIn};
}

test('email is available only with enabled, safe provider configuration; native sign-in keeps working',async()=>{
 for(const vars of [{EMAIL_AUTH_ENABLED:'false'},{SUPABASE_PUBLISHABLE_KEY:''},{SUPABASE_URL:'http://auth.example.test'},{SUPABASE_PUBLISHABLE_KEY:'sb_secret_do_not_use_admin_keys'}]){
  const f=fixture(vars);assert.equal((await f.request('/me')).data.auth.email,false);assert.equal((await f.start()).status,503);assert.equal(f.provider.calls.length,0);
  const native=await f.request('/me','GET',undefined,{native:'existing-player'});assert.equal(native.data.user.id,'chatgpt:existing-player');assert.equal(native.data.user.method,'chatgpt');
 }
});

test('email signup and returning login share the same code flow without creating a public profile',async()=>{
 const f=fixture(),sent=await f.start('  Player@Example.Test  ');assert.equal(sent.status,200);assert.deepEqual(sent.data,{ok:true,resendAfter:60});assert.equal(f.provider.calls[0].body.email,EMAIL);assert.equal(f.provider.calls[0].body.create_user,true);
 assert.equal((await f.request('/me')).data.signedIn,false);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM community_profiles').get().n,0);
 assert.doesNotMatch(JSON.stringify(f.DB.sql.prepare('SELECT key FROM community_limits').all()),/player@example/);
 assert.equal((await f.start()).status,429,'rapid resend blocked before provider call');assert.equal(f.provider.calls.length,1);
 assert.equal((await f.start('invalid email')).status,400);
});

test('incorrect, expired, and already-used codes cannot establish a session',async()=>{
 const f=fixture();await f.start();assert.equal((await f.verify('654321')).status,400);assert.equal((await f.request('/groups')).status,401);assert.equal((await f.verify('bad')).status,400);
 await f.verify();const saved=new Map(f.jar);f.jar.clear();assert.equal((await f.verify()).status,400);assert.equal((await f.request('/me')).data.signedIn,false);assert.ok(saved.size>0);
});

test('verified email sessions stay in secure server cookies and can share a group with native accounts',async()=>{
 const f=fixture(),signedIn=await f.signIn();const id=signedIn.data.user.id;assert.match(id,/^email:/);assert.equal(signedIn.data.user.method,'email');assert.equal(signedIn.data.user.profile,null);assert.equal(signedIn.data.signOut,null);
 assert.doesNotMatch(JSON.stringify(signedIn.data),/access_token|refresh_token|player@example/);
 assert.equal((await f.request('/groups')).status,409,'display name required');
 await f.request('/profile','POST',{name:'Email player'});const g=(await f.request('/groups','POST',{name:'Email and ChatGPT crew'})).data.group;
 const nativeCookies=new Map();await f.request('/profile','POST',{name:'ChatGPT player'},{native:'friend',cookies:nativeCookies});await f.request('/join','POST',{code:g.invite_code},{native:'friend',cookies:nativeCookies});
 await f.request('/groups/'+g.id+'/messages','POST',{body:'See you at the court.',clientId:'email-message-1'});
 const received=await f.request('/groups/'+g.id+'/messages','GET',undefined,{native:'friend',cookies:nativeCookies});assert.equal(received.data.messages[0].user_id,id);assert.equal(received.data.messages[0].body,'See you at the court.');
 const outsider=await f.request('/groups/'+g.id+'/messages','GET',undefined,{native:'outsider',cookies:new Map()});assert.equal(outsider.status,409);
 const cookies=[...f.jar];assert.ok(cookies.some(([name])=>name.startsWith('__Host-bucketlist-email')));
 const newSession=fixture();await newSession.start();const verified=await newSession.verify();assert.ok(verified.setCookies.length);for(const cookie of verified.setCookies){assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/Path=\//);assert.doesNotMatch(cookie,/Domain=/);}
 assert.match(verified.headers.get('cache-control'),/no-store/);
});

test('unconfirmed users and forged cookie claims never authorize private data',async()=>{
 const unconfirmed=fixture();unconfirmed.provider.confirmed=false;await unconfirmed.start();assert.equal((await unconfirmed.verify()).status,400);assert.equal((await unconfirmed.request('/me')).data.signedIn,false);
 const forged=fixture();forged.jar.set('__Host-bucketlist-email','base64-'+Buffer.from(JSON.stringify({access_token:'forged-token',refresh_token:'forged-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:crypto.randomUUID(),email:EMAIL,email_confirmed_at:'forged'}})).toString('base64url'));
 assert.equal((await forged.request('/me')).data.signedIn,false);assert.equal((await forged.request('/groups')).status,401);assert.equal(forged.jar.size,0);
});

test('session refresh reaches the browser and revocation is checked by the auth service',async()=>{
 const f=fixture();await f.signIn();
 const [name,value]=[...f.jar][0],session=JSON.parse(Buffer.from(value.replace(/^base64-/,''),'base64url'));session.expires_at=1;f.jar.set(name,'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'));
 const refreshed=await f.request('/me');assert.equal(refreshed.data.signedIn,true);assert.ok(f.provider.calls.some(c=>c.path==='/auth/v1/token'));assert.ok(refreshed.setCookies.length);assert.match(refreshed.headers.get('cache-control'),/no-store/);
 f.provider.access.clear();f.provider.refresh.clear();assert.equal((await f.request('/groups')).status,401);assert.equal(f.jar.size,0);
});

test('email signout clears the current session and does not merge or replace a native account',async()=>{
 const f=fixture();const emailId=(await f.signIn()).data.user.id;await f.request('/profile','POST',{name:'Email identity'});const saved=new Map(f.jar);
 assert.equal((await f.request('/auth/email/signout','POST',{})).status,200);assert.equal(f.jar.size,0);assert.equal((await f.request('/me')).data.signedIn,false);assert.equal((await f.request('/me','GET',undefined,{cookies:saved})).data.signedIn,false);
 const native=await f.request('/me','GET',undefined,{native:'same-person'});assert.equal(native.data.user.id,'chatgpt:same-person');assert.notEqual(native.data.user.id,emailId);assert.equal(native.data.user.profile,null);
});

test('native identity wins over leftover email cookies and expires those cookies without an external request',async()=>{
 const f=fixture();await f.signIn();const count=f.provider.calls.length;const native=await f.request('/me','GET',undefined,{native:'original-account'});assert.equal(native.data.user.id,'chatgpt:original-account');assert.equal(f.provider.calls.length,count);assert.equal(f.jar.size,0);
 assert.equal((await f.request('/auth/email/start','POST',{email:EMAIL},{native:'original-account'})).status,409);
});

test('cross-origin requests, repeated code guesses, and provider failures have safe outcomes',async()=>{
 const f=fixture();assert.equal((await f.request('/auth/email/start','POST',{email:EMAIL},{headers:{Origin:'https://unrelated.example'}})).status,403);assert.equal(f.provider.calls.length,0);await f.start();
 for(let i=0;i<10;i++)assert.equal((await f.verify('654321')).status,400);assert.equal((await f.verify()).status,429);
 const failing=fixture();failing.provider.sendError={status:400,code:'email_address_not_authorized'};const result=await failing.start();assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result.data),/not_authorized|exists|registered/);
 const outage=fixture();await outage.signIn();outage.provider.outage=true;assert.equal((await outage.request('/me')).status,503);assert.ok(outage.jar.size>0,'a service outage must not destroy the saved session');
});
