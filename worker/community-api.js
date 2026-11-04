import {pushGroupMessage,pushKeys,validateSubscription,sha256Text,PushError} from './push.js';
import {createEmailAuth,normalizeEmail,EmailAuthError} from './email-auth.js';
import {privatePlayApi,PlayError} from './play-api.js';
const apiHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const jsonAnswer=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:apiHeaders});
function nativeIdentity(request){const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');return id&&email&&id.length<=300?{id:'chatgpt:'+id,method:'chatgpt'}:null;}
function cleanText(value,min,max,label){if(typeof value!=='string')throw new ApiError(400,'Enter '+label+'.');const s=value.trim().normalize('NFC');if([...s].length<min||[...s].length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s))throw new ApiError(400,`${label} must be ${min}–${max} characters.`);return s;}
async function bodyJson(request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'Please send this form again.');if(Number(request.headers.get('content-length')||0)>12000)throw new ApiError(413,'This request is too large.');const text=await request.text();if(text.length>12000)throw new ApiError(413,'This request is too large.');try{const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}catch{throw new ApiError(400,'Please check the form and try again.');}}
const uuid=()=>crypto.randomUUID();
function inviteToken(){return Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');}
async function rate(db,user,action,max,seconds){const now=Date.now(),window=Math.floor(now/(seconds*1000)),key=`${action}:${user}:${window}`;const row=await db.prepare('INSERT INTO community_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+seconds*2000).first();if(row.count>max)throw new ApiError(429,'You are going a little fast. Please wait a moment and try again.');if(Math.random()<.01)await db.prepare('DELETE FROM community_limits WHERE expires_at < ?').bind(now).run();}
async function profile(db,id){return db.prepare('SELECT id,name FROM community_profiles WHERE id=?').bind(id).first();}
async function mustProfile(db,id){const p=await profile(db,id);if(!p)throw new ApiError(409,'Choose your display name first.');return p;}
async function membership(db,group,id){const m=await db.prepare('SELECT m.role,g.name,g.owner_id,g.invite_code FROM community_members m JOIN community_groups g ON g.id=m.group_id WHERE m.group_id=? AND m.user_id=?').bind(group,id).first();if(!m)throw new ApiError(403,'You need an invitation to join this group.');return m;}
async function owned(db,group,id){const m=await membership(db,group,id);if(m.role!=='owner')throw new ApiError(403,'Only the group creator can do that.');return m;}
async function communityApi(request,env,ctx={waitUntil(){}},authOptions={}){
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method,db=env.DB;
 const emailAuth=createEmailAuth(request,env,authOptions),answer=(data,status)=>emailAuth.respond(jsonAnswer(data,status));
 const native=nativeIdentity(request);if(native)emailAuth.clearCookies();
 const identity=async()=>native||await emailAuth.identity();
 try{
  if(method!=='GET'&&method!=='HEAD'){
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin)throw new ApiError(403,'Please open Bucketlist and try again.');
   if(request.headers.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'Please open Bucketlist and try again.');
  }
  if(!db)throw new ApiError(503,'Groups are getting ready. Please try again shortly.');
  if(path==='/api/community/health'&&method==='GET'){await db.prepare('SELECT COUNT(*) AS ready FROM community_profiles').first();return answer({ready:true});}
  if(path==='/api/community/me'&&method==='GET'){
   const user=await identity();return answer({signedIn:!!user,user:user?{id:user.id,method:user.method,profile:await profile(db,user.id)}:null,auth:{email:emailAuth.available},signIn:'/signin-with-chatgpt?return_to=%2Fcommunity%2F',signOut:user?.method==='email'?null:'/signout-with-chatgpt?return_to=%2Fcommunity%2F'});
  }
  if(path==='/api/community/auth/email/signout'&&method==='POST'){await emailAuth.signOut();return answer({ok:true});}
  if((path==='/api/community/auth/email/start'||path==='/api/community/auth/email/verify')&&method==='POST'){
   if(!emailAuth.available)throw new ApiError(503,'Email sign-in is not available yet. Please use ChatGPT for now.');
   if(await identity())throw new ApiError(409,'You are already signed in. Sign out first to use another account.');
   const data=await bodyJson(request),email=normalizeEmail(data.email),emailKey=await sha256Text(email),ipKey=await sha256Text(request.headers.get('cf-connecting-ip')||'unknown');
   if(path.endsWith('/start')){
    await rate(db,ipKey,'email-send-ip',20,3600);await rate(db,emailKey,'email-send',5,900);await rate(db,emailKey,'email-cooldown',1,60);
    await emailAuth.sendCode(email);return answer({ok:true,resendAfter:60});
   }
   await rate(db,ipKey,'email-verify-ip',40,600);await rate(db,emailKey,'email-verify',10,600);
   await emailAuth.verifyCode(email,data.code);return answer({ok:true});
  }
  const user=await identity();if(!user)throw new ApiError(401,'Please sign in to continue.');
  if(path==='/api/community/profile'&&method==='POST'){
   await rate(db,user.id,'profile',12,60);const data=await bodyJson(request),name=cleanText(data.name,1,40,'Your name'),now=Date.now();
   await db.prepare('INSERT INTO community_profiles (id,name,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at').bind(user.id,name,now,now).run();return answer({profile:{id:user.id,name}});
  }
  await mustProfile(db,user.id);
  const play=await privatePlayApi(request,env,ctx,user,{answer,bodyJson,rate});if(play)return play;
  if(path==='/api/community/groups'&&method==='GET'){
   const data=await db.prepare(`SELECT g.id,g.name,g.description,g.created_at,g.updated_at,m.role,(SELECT COUNT(*) FROM community_members x WHERE x.group_id=g.id) AS member_count,(SELECT COUNT(*) FROM community_messages x WHERE x.group_id=g.id AND x.seq>m.last_read AND x.user_id<>?) AS unread_count FROM community_groups g JOIN community_members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.updated_at DESC,g.id`).bind(user.id,user.id).all();return answer({groups:data.results});
  }
  if(path==='/api/community/groups'&&method==='POST'){
   await rate(db,user.id,'create',6,3600);const count=await db.prepare('SELECT COUNT(*) AS n FROM community_groups WHERE owner_id=?').bind(user.id).first();if(count.n>=20)throw new ApiError(409,'You have reached the limit of 20 groups.');
   const data=await bodyJson(request),name=cleanText(data.name,1,80,'Group name'),description=cleanText(data.description||'',0,280,'Description'),id=uuid(),code=inviteToken(),now=Date.now();
   await db.batch([db.prepare('INSERT INTO community_groups (id,name,description,owner_id,invite_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(id,name,description,user.id,code,now,now),db.prepare('INSERT INTO community_members (group_id,user_id,role,joined_at,last_read) VALUES (?,?,?,?,0)').bind(id,user.id,'owner',now)]);return answer({group:{id,name,description,role:'owner',invite_code:code}},201);
  }
  const invite=path.match(/^\/api\/community\/invites\/([a-f0-9]{48})$/);
  if(invite&&method==='GET'){const group=await db.prepare('SELECT id,name,description,(SELECT COUNT(*) FROM community_members m WHERE m.group_id=community_groups.id) AS member_count FROM community_groups WHERE invite_code=?').bind(invite[1]).first();if(!group)throw new ApiError(404,'This invitation no longer works. Ask the group creator for a new link.');return answer({group});}
  if(path==='/api/community/join'&&method==='POST'){
   await rate(db,user.id,'join',20,3600);const data=await bodyJson(request);if(typeof data.code!=='string'||!/^([a-f0-9]{48})$/.test(data.code))throw new ApiError(400,'Check your invitation link.');const group=await db.prepare('SELECT id,name FROM community_groups WHERE invite_code=?').bind(data.code).first();if(!group)throw new ApiError(404,'This invitation no longer works. Ask for a new link.');
   const existing=await db.prepare('SELECT role FROM community_members WHERE group_id=? AND user_id=?').bind(group.id,user.id).first();if(!existing){await db.prepare("INSERT INTO community_members (group_id,user_id,role,joined_at,last_read) SELECT ?,?,'member',?,0 WHERE (SELECT COUNT(*) FROM community_members WHERE group_id=?)<50").bind(group.id,user.id,Date.now(),group.id).run();if(!await db.prepare('SELECT role FROM community_members WHERE group_id=? AND user_id=?').bind(group.id,user.id).first())throw new ApiError(409,'This group is full (50 people).');}return answer({group});
  }
  const route=path.match(/^\/api\/community\/groups\/([a-zA-Z0-9-]{36})(?:\/(messages|read|leave|invite|members)(?:\/([^/]{1,990}))?)?$/);
  if(route){
   const groupId=route[1],section=route[2],target=route[3]?decodeURIComponent(route[3]):null,member=await membership(db,groupId,user.id);
   if(!section&&method==='GET'){
    const group=await db.prepare('SELECT id,name,description,created_at FROM community_groups WHERE id=?').bind(groupId).first(),people=await db.prepare('SELECT p.id,p.name,m.role,m.joined_at FROM community_members m JOIN community_profiles p ON p.id=m.user_id WHERE m.group_id=? ORDER BY m.joined_at,p.id').bind(groupId).all();return answer({group:{...group,role:member.role,invite_code:member.role==='owner'?member.invite_code:null},members:people.results});
   }
   if(section==='messages'&&method==='GET'){
    const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(before)||before<1)throw new ApiError(400,'Invalid message page.');const data=await db.prepare('SELECT m.seq,m.id,m.user_id,m.body,m.created_at,p.name FROM community_messages m JOIN community_profiles p ON p.id=m.user_id WHERE m.group_id=? AND m.seq<? ORDER BY m.seq DESC LIMIT 51').bind(groupId,before).all();return answer({messages:data.results.slice(0,50).reverse(),hasMore:data.results.length>50});
   }
   if(section==='messages'&&method==='POST'){
    await rate(db,user.id,'message',30,60);const data=await bodyJson(request),text=cleanText(data.body,1,2000,'Message');if(typeof data.clientId!=='string'||!/^[a-zA-Z0-9-]{8,64}$/.test(data.clientId))throw new ApiError(400,'Please send your message again.');const now=Date.now();
    const inserted=await db.prepare('INSERT OR IGNORE INTO community_messages (id,group_id,user_id,client_id,body,created_at) VALUES (?,?,?,?,?,?)').bind(uuid(),groupId,user.id,data.clientId,text,now).run();
    if(inserted.meta?.changes){await db.prepare('UPDATE community_groups SET updated_at=? WHERE id=?').bind(now,groupId).run();ctx.waitUntil(pushGroupMessage(db,groupId,user.id).catch(()=>{}));}
    const message=await db.prepare('SELECT seq,id,body,created_at FROM community_messages WHERE group_id=? AND user_id=? AND client_id=?').bind(groupId,user.id,data.clientId).first();return answer({message},inserted.meta?.changes?201:200);
   }
   if(section==='read'&&method==='POST'){const data=await bodyJson(request);if(!Number.isSafeInteger(data.seq)||data.seq<0)throw new ApiError(400,'Invalid message.');await db.prepare('UPDATE community_members SET last_read=MAX(last_read,MIN(?,COALESCE((SELECT MAX(seq) FROM community_messages WHERE group_id=?),0))) WHERE group_id=? AND user_id=?').bind(data.seq,groupId,groupId,user.id).run();return answer({ok:true});}
   if(section==='leave'&&method==='POST'){if(member.role==='owner')throw new ApiError(409,'The group creator can delete the group in Group details.');await db.prepare('DELETE FROM community_members WHERE group_id=? AND user_id=?').bind(groupId,user.id).run();return answer({ok:true});}
   if(section==='invite'&&method==='POST'){await owned(db,groupId,user.id);await rate(db,user.id,'invite',10,3600);const code=inviteToken();await db.prepare('UPDATE community_groups SET invite_code=? WHERE id=?').bind(code,groupId).run();return answer({invite_code:code});}
   if(section==='members'&&target&&method==='DELETE'){await owned(db,groupId,user.id);if(target===user.id)throw new ApiError(409,'You are the group creator.');await db.prepare('DELETE FROM community_members WHERE group_id=? AND user_id=?').bind(groupId,target).run();return answer({ok:true});}
   if(!section&&method==='DELETE'){await owned(db,groupId,user.id);await db.prepare('DELETE FROM community_groups WHERE id=?').bind(groupId).run();return answer({ok:true});}
  }
  const deletion=path.match(/^\/api\/community\/messages\/(\d+)$/);
  if(deletion&&method==='DELETE'){const message=await db.prepare('SELECT seq,user_id,group_id FROM community_messages WHERE seq=?').bind(Number(deletion[1])).first();if(!message)throw new ApiError(404,'Message already removed.');const m=await membership(db,message.group_id,user.id);if(message.user_id!==user.id&&m.role!=='owner')throw new ApiError(403,'You can remove only your own messages.');await db.prepare('DELETE FROM community_messages WHERE seq=?').bind(message.seq).run();return answer({ok:true});}
  if(path==='/api/community/push/key'&&method==='GET'){const keys=await pushKeys(db);return answer({publicKey:keys.publicKey});}
  if(path==='/api/community/push'&&method==='POST'){await rate(db,user.id,'subscribe',12,3600);const data=await bodyJson(request),sub=validateSubscription(data),id=await sha256Text(sub.endpoint);const existing=await db.prepare('SELECT user_id FROM community_push WHERE id=?').bind(id).first();if(existing&&existing.user_id!==user.id)throw new ApiError(409,'Turn alerts off, then enable them for this account.');const count=await db.prepare('SELECT COUNT(*) AS n FROM community_push WHERE user_id=?').bind(user.id).first();if(!existing&&count.n>=5)throw new ApiError(409,'Alerts are already enabled on five devices.');await db.prepare('INSERT INTO community_push (id,user_id,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth').bind(id,user.id,sub.endpoint,sub.p256dh,sub.auth,Date.now()).run();return answer({ok:true});}
  if(path==='/api/community/push'&&method==='DELETE'){const data=await bodyJson(request);if(typeof data.endpoint!=='string')throw new ApiError(400,'Choose a device.');await db.prepare('DELETE FROM community_push WHERE endpoint=? AND user_id=?').bind(data.endpoint,user.id).run();return answer({ok:true});}
  throw new ApiError(404,'This page was not found.');
 }catch(error){if(error instanceof PushError)return answer({error:error.message},400);if(error instanceof PlayError)return answer({error:error.message,...error.details},error.status);if(error instanceof ApiError||error instanceof EmailAuthError)return answer({error:error.message},error.status);console.error('Community request failed:',error?.message||'Unknown error');return answer({error:'We could not finish that. Your unsent message is still here. Please try again.'},503);}
}

export {communityApi};
