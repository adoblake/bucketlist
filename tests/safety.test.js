import test from 'node:test';
import assert from 'node:assert/strict';
import {communityApi} from '../worker/community-api.js';
import {publicPlayApi} from '../worker/play-api.js';
import {testDatabase} from './helpers/d1-sqlite.js';

function fixture(){
 const DB=testDatabase(),objects=new Map(),tasks=[];
 const env={DB,MODERATOR_IDS:'chatgpt:mod',BUCKET:{async put(k,v){objects.set(k,new Uint8Array(v));},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async delete(k){objects.delete(k);}}};
 async function call(user,path,method='GET',body,headers={}){
  const isPublic=path.startsWith('/public/');
  const req=new Request('https://groups.example.test/api'+(isPublic?path:'/community'+path),{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{}),...headers},...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});
  const r=isPublic?await publicPlayApi(req,env):await communityApi(req,env,{waitUntil(p){tasks.push(p);}});
  return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():null};
 }
 const signup=user=>call(user,'/profile','POST',{name:user[0].toUpperCase()+user.slice(1),acceptTerms:true});
 const group=async(owner,...joiners)=>{const g=(await call(owner,'/groups','POST',{name:'Saturday hoops'})).data.group;for(const j of joiners)await call(j,'/join','POST',{code:g.invite_code});return g;};
 const say=async(user,g,body)=>(await call(user,'/groups/'+g.id+'/messages','POST',{body,clientId:crypto.randomUUID()})).data.message;
 const court=async(user,data={})=>(await call(user,'/play/courts','POST',{parkName:'Encanto Park',city:'Phoenix',name:'North court',lat:33.474,lng:-112.087,placedOnCourt:true,clientId:crypto.randomUUID(),...data})).data.court;
 const game=async(user,c)=>(await call(user,'/play/games','POST',{courtId:c.id,expectedCourtUpdatedAt:c.updatedAt,title:'Saturday run',startsAt:new Date(Date.now()+86400000).toISOString(),duration:60,capacity:6,clientId:crypto.randomUUID()})).data.game;
 const count=(sql,...a)=>DB.sql.prepare(sql).get(...a).n;
 return {DB,env,objects,tasks,call,signup,group,say,court,game,count};
}
const jpeg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0,255,217]);

test('new players must accept the community rules; players on an older version must re-accept before posting',async()=>{
 const f=fixture();
 assert.equal((await f.call('alice','/profile','POST',{name:'Alice'})).status,400);
 await f.signup('alice');await f.signup('bob');const g=await f.group('alice','bob');
 let me=(await f.call('alice','/me')).data;assert.equal(me.user.termsAccepted,true);assert.equal(me.legal.privacy,'/legal/privacy');assert.ok(me.reportReasons.harassment);
 f.DB.sql.prepare("UPDATE community_profiles SET terms_version='2020-01-01' WHERE id='chatgpt:alice'").run();
 me=(await f.call('alice','/me')).data;assert.equal(me.user.termsAccepted,false);
 const blocked=await f.call('alice','/groups/'+g.id+'/messages','POST',{body:'hi',clientId:'needs-terms-1'});assert.equal(blocked.status,428);assert.equal(blocked.data.code,'terms');
 assert.equal((await f.call('alice','/play/courts','POST',{})).status,428);
 // Reading, renaming, blocking and reporting still work without re-accepting.
 assert.equal((await f.call('alice','/groups/'+g.id+'/messages')).status,200);
 assert.equal((await f.call('alice','/profile','POST',{name:'Alice R'})).status,200);
 assert.equal((await f.call('alice','/blocks','POST',{userId:'chatgpt:bob'})).status,201);
 assert.equal((await f.call('alice','/terms','POST',{accept:true,version:'2020-01-01'})).status,400);
 assert.equal((await f.call('alice','/terms','POST',{accept:true,version:me.terms.version})).status,200);
 assert.equal((await f.call('alice','/groups/'+g.id+'/messages','POST',{body:'hi',clientId:'needs-terms-1'})).status,201);
});

test('blocking hides a player’s messages and unread counts for the blocker only, and can be undone',async()=>{
 const f=fixture();for(const u of ['alice','bob','casey'])await f.signup(u);const g=await f.group('alice','bob','casey');
 await f.say('alice',g,'From Alice');await f.say('casey',g,'From Casey');
 assert.equal((await f.call('bob','/blocks','POST',{userId:'chatgpt:bob'})).status,400,'cannot block yourself');
 assert.equal((await f.call('bob','/blocks','POST',{userId:'chatgpt:nobody'})).status,404);
 assert.equal((await f.call('bob','/blocks','POST',{userId:'chatgpt:alice'})).status,201);
 assert.equal((await f.call('bob','/blocks','POST',{userId:'chatgpt:alice'})).status,201,'idempotent');
 const forBob=(await f.call('bob','/groups/'+g.id+'/messages')).data.messages.map(m=>m.body);assert.deepEqual(forBob,['From Casey']);
 const forCasey=(await f.call('casey','/groups/'+g.id+'/messages')).data.messages.map(m=>m.body);assert.deepEqual(forCasey,['From Alice','From Casey']);
 assert.equal((await f.call('bob','/groups')).data.groups[0].unread_count,1);
 const members=(await f.call('bob','/groups/'+g.id)).data.members;assert.equal(members.find(m=>m.id==='chatgpt:alice').blocked,true);assert.equal(members.find(m=>m.id==='chatgpt:casey').blocked,false);
 assert.deepEqual((await f.call('bob','/blocks')).data.blocked.map(b=>b.name),['Alice']);
 assert.equal((await f.call('bob','/blocks/'+encodeURIComponent('chatgpt:alice'),'DELETE')).status,200);
 assert.equal((await f.call('bob','/groups/'+g.id+'/messages')).data.messages.length,2);
});

test('reports require visibility of the content, reject self-reports, de-duplicate, and keep a snapshot',async()=>{
 const f=fixture();for(const u of ['alice','bob','eve'])await f.signup(u);const g=await f.group('alice','bob');const m=await f.say('alice',g,'Rude message');
 const report=body=>f.call('bob','/reports','POST',body);
 assert.equal((await report({kind:'message',targetId:m.seq,reason:'nope'})).status,400);
 assert.equal((await report({kind:'nope',targetId:m.seq,reason:'spam'})).status,400);
 assert.equal((await f.call('eve','/reports','POST',{kind:'message',targetId:m.seq,reason:'harassment'})).status,403,'non-members cannot see the message');
 assert.equal((await f.call('alice','/reports','POST',{kind:'message',targetId:m.seq,reason:'harassment'})).status,409,'no self-reports');
 assert.equal((await report({kind:'message',targetId:m.seq,reason:'harassment',note:'Keeps doing this'})).status,201);
 assert.equal((await report({kind:'message',targetId:m.seq,reason:'harassment'})).status,201);
 assert.equal(f.count('SELECT COUNT(*) AS n FROM community_reports'),1);
 const row=f.DB.sql.prepare('SELECT * FROM community_reports').get();assert.equal(row.target_user_id,'chatgpt:alice');assert.deepEqual(JSON.parse(row.snapshot),{author:'Alice',body:'Rude message',group:'Saturday hoops',groupId:g.id});
 const c=await f.court('alice');const gm=await f.game('alice',c);
 assert.equal((await report({kind:'court',targetId:c.id,reason:'misleading'})).status,201);
 assert.equal((await report({kind:'photo',targetId:c.id,reason:'sexual'})).status,404,'no photo yet');
 assert.equal((await report({kind:'game',targetId:gm.id,reason:'spam'})).status,201);
 assert.equal((await report({kind:'user',targetId:'chatgpt:alice',reason:'impersonation'})).status,201);
 assert.equal(f.count('SELECT COUNT(*) AS n FROM community_reports'),4);
});

test('only moderators can review reports; removal and suspension take effect and resolve every report on the target',async()=>{
 const f=fixture();for(const u of ['alice','bob','casey','mod'])await f.signup(u);const g=await f.group('alice','bob','casey');const m=await f.say('alice',g,'Rude message');
 await f.call('bob','/reports','POST',{kind:'message',targetId:m.seq,reason:'harassment'});await f.call('casey','/reports','POST',{kind:'message',targetId:m.seq,reason:'hate'});
 assert.equal((await f.call('bob','/moderation/reports')).status,403);
 assert.equal((await f.call('mod','/me')).data.user.moderator,true);assert.equal((await f.call('bob','/me')).data.user.moderator,false);
 const open=(await f.call('mod','/moderation/reports')).data.reports;assert.equal(open.length,2);assert.equal(open[0].reportCount,2);assert.equal(open[0].snapshot.body,'Rude message');assert.equal(open[0].reasonLabel,'Harassment or bullying');
 assert.equal((await f.call('mod','/moderation/reports/'+open[0].id,'POST',{action:'remove_and_suspend'})).status,200);
 assert.equal(f.count('SELECT COUNT(*) AS n FROM community_messages'),0);
 assert.equal((await f.call('mod','/moderation/reports')).data.reports.length,0,'both reports on the message were resolved');
 assert.equal((await f.call('mod','/moderation/reports?status=resolved')).data.reports[0].action,'remove_and_suspend');
 // A suspended player can read and delete their account but cannot post.
 assert.equal((await f.call('alice','/me')).data.user.suspended,true);
 const post=await f.call('alice','/groups/'+g.id+'/messages','POST',{body:'again',clientId:'suspended-1'});assert.equal(post.status,403);assert.equal(post.data.code,'suspended');
 assert.equal((await f.call('alice','/groups/'+g.id+'/messages')).status,200);
 assert.equal((await f.call('alice','/profile','POST',{name:'Offensive name'})).status,403,'suspended players cannot rename');
 assert.equal((await f.call('mod','/moderation/users/'+encodeURIComponent('chatgpt:alice'),'POST',{suspended:false})).status,200);
 assert.equal((await f.call('alice','/groups/'+g.id+'/messages','POST',{body:'sorry',clientId:'restored-1'})).status,201);
});

test('moderators can remove a court listing (cancelling its games) or just its photo',async()=>{
 const f=fixture();for(const u of ['alice','bob','mod'])await f.signup(u);
 const c=await f.court('alice');assert.equal((await f.call('alice','/play/courts/'+c.id+'/photo','POST',jpeg,{'Content-Type':'image/jpeg','X-Court-Version':String(c.updatedAt)})).status,200);
 const key=f.DB.sql.prepare('SELECT photo_key FROM play_courts WHERE id=?').get(c.id).photo_key;assert.ok(f.objects.has(key));
 await f.call('bob','/reports','POST',{kind:'photo',targetId:c.id,reason:'sexual'});
 let r=(await f.call('mod','/moderation/reports')).data.reports[0];assert.equal(r.snapshot.photoUrl,'/api/public/courts/'+c.id+'/photo');
 await f.call('mod','/moderation/reports/'+r.id,'POST',{action:'remove'});await Promise.all(f.tasks);
 assert.equal(f.objects.has(key),false);assert.equal((await f.call(null,'/public/courts/'+c.id)).data.court.photo,false);
 const fresh=(await f.call(null,'/public/courts/'+c.id)).data.court,gm=await f.game('alice',fresh);await f.call('bob','/play/games/'+gm.id+'/join','POST',{});
 await f.call('bob','/reports','POST',{kind:'court',targetId:c.id,reason:'misleading'});r=(await f.call('mod','/moderation/reports')).data.reports[0];
 await f.call('mod','/moderation/reports/'+r.id,'POST',{action:'remove'});
 assert.equal((await f.call(null,'/public/courts/'+c.id)).status,404);
 const after=(await f.call('bob','/play/games/'+gm.id)).data.game;assert.equal(after.status,'cancelled');assert.match(after.cancelReason,/moderators/);
});

test('account deletion removes personal data, hands shared groups on, cancels hosted games, and anonymises court pins',async()=>{
 const f=fixture();for(const u of ['alice','bob','casey'])await f.signup(u);
 const shared=await f.group('alice','bob','casey'),solo=await f.group('alice');await f.say('alice',shared,'Alice message');await f.say('bob',shared,'Bob message');
 const c=await f.court('alice');await f.call('alice','/play/courts/'+c.id+'/photo','POST',jpeg,{'Content-Type':'image/jpeg','X-Court-Version':String(c.updatedAt)});const key=f.DB.sql.prepare('SELECT photo_key FROM play_courts WHERE id=?').get(c.id).photo_key;
 const fresh=(await f.call(null,'/public/courts/'+c.id)).data.court,hosted=await f.game('alice',fresh);await f.call('bob','/play/games/'+hosted.id+'/join','POST',{});
 const other=await f.court('bob',{lat:33.48,lng:-112.09,parkName:'Other park'}),bobGame=await f.game('bob',other);await f.call('alice','/play/games/'+bobGame.id+'/join','POST',{});
 await f.call('alice','/play/courts/'+other.id+'/confirm','POST',{expectedCourtUpdatedAt:other.updatedAt});
 await f.call('alice','/reports','POST',{kind:'game',targetId:bobGame.id,reason:'spam'});await f.call('alice','/blocks','POST',{userId:'chatgpt:casey'});await f.call('casey','/blocks','POST',{userId:'chatgpt:alice'});
 assert.equal((await f.call('alice','/account','DELETE',{})).status,400,'confirmation required');
 const del=await f.call('alice','/account','DELETE',{confirm:'DELETE'});assert.equal(del.status,200);await Promise.all(f.tasks);
 assert.deepEqual({t:del.data.groupsTransferred,d:del.data.groupsDeleted,c:del.data.gamesCancelled},{t:1,d:1,c:1});assert.match(del.data.signOut,/signout/);
 const id='chatgpt:alice';
 for(const [table,col] of [['community_profiles','id'],['community_members','user_id'],['community_messages','user_id'],['community_blocks','user_id'],['community_blocks','blocked_id'],['play_players','user_id'],['play_confirmations','user_id'],['play_games','host_id'],['play_courts','created_by']])assert.equal(f.count(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col}=?`,id),0,table+'.'+col);
 assert.equal(f.count('SELECT COUNT(*) AS n FROM community_groups WHERE id=?',solo.id),0);
 const g=(await f.call('bob','/groups/'+shared.id)).data;assert.equal(g.group.role,'owner');assert.deepEqual(g.members.map(m=>m.name),['Bob','Casey']);
 assert.deepEqual((await f.call('bob','/groups/'+shared.id+'/messages')).data.messages.map(m=>m.body),['Bob message']);
 const cancelled=(await f.call('bob','/play/games/'+hosted.id)).data.game;assert.equal(cancelled.status,'cancelled');assert.match(cancelled.cancelReason,/deleted/);
 const pin=(await f.call(null,'/public/courts/'+c.id)).data.court;assert.equal(pin.photo,false);assert.equal(f.objects.has(key),false);
 assert.equal(f.DB.sql.prepare('SELECT reporter_id FROM community_reports').get().reporter_id,null,'reports survive without the reporter');
 const me=(await f.call('alice','/me')).data;assert.equal(me.user.profile,null);
 assert.equal((await f.call('alice','/account','DELETE',{confirm:'DELETE'})).data.deleted,false,'repeat deletion is harmless');
 assert.equal((await f.call('bob','/blocks','POST',{userId:'system:deleted'})).status,400);
});

test('moderators can delete an account on a verified email request; nobody else can',async()=>{
 const f=fixture();for(const u of ['alice','bob','mod'])await f.signup(u);const g=await f.group('alice','bob');await f.say('alice',g,'Hello');
 const path='/moderation/users/'+encodeURIComponent('chatgpt:alice');
 assert.equal((await f.call('bob',path,'DELETE',{confirm:'DELETE'})).status,403);
 assert.equal((await f.call('mod',path,'DELETE',{})).status,400);
 assert.equal((await f.call('mod','/moderation/users/'+encodeURIComponent('chatgpt:mod'),'DELETE',{confirm:'DELETE'})).status,409);
 const r=await f.call('mod',path,'DELETE',{confirm:'DELETE'});assert.equal(r.status,200);assert.equal(r.data.groupsTransferred,1);
 assert.equal(f.count('SELECT COUNT(*) AS n FROM community_profiles WHERE id=?','chatgpt:alice'),0);assert.equal(f.count('SELECT COUNT(*) AS n FROM community_messages'),0);
 assert.equal((await f.call('mod',path,'DELETE',{confirm:'DELETE'})).status,404);
});
