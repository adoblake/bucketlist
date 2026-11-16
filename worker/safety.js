// Account deletion, reporting, blocking, community-rules acceptance, and moderation.
// Required by Google Play's account-deletion and user-generated-content policies.
import {PlayError,alertGame} from './play-api.js';

export const TERMS_VERSION='2026-11-16';
export const DELETED_ID='system:deleted';
export const REPORT_REASONS={spam:'Spam or scam',harassment:'Harassment or bullying',hate:'Hate speech',sexual:'Sexual content',violence:'Violence or threats','self-harm':'Self-harm','personal-info':'Sharing private information',impersonation:'Impersonation',misleading:'Fake or misleading listing',other:'Something else'};
const REPORT_KINDS=['message','user','court','photo','game'];
const fail=(status,message,details)=>{throw new PlayError(status,message,details);};
const S=(db,sql,...args)=>db.prepare(sql).bind(...args);

export function isModerator(env,user){return !!user&&String(env.MODERATOR_IDS||'').split(',').map(v=>v.trim()).filter(Boolean).includes(user.id);}
export const termsAccepted=profile=>profile?.terms_version===TERMS_VERSION;

// Routes that must keep working for suspended accounts and for people who have not yet accepted the
// current rules: leaving, deleting your own content, blocking, reporting, and turning alerts off.
const ALWAYS_ALLOWED=[
 ['*',/^\/api\/community\/(account|terms|reports|blocks)(\/[^/]+)?$/],
 ['*',/^\/api\/community\/moderation\//],
 ['POST',/^\/api\/community\/groups\/[^/]+\/(leave|read)$/],
 ['DELETE',/^\/api\/community\/messages\/\d+$/],
 ['DELETE',/^\/api\/community\/push$/],
 ['POST',/^\/api\/community\/play\/games\/[^/]+\/(leave|cancel)$/],
 ['DELETE',/^\/api\/community\/play\/courts\/[^/]+$/],
];
export function writeGate(path,method,profile){
 if(method==='GET'||method==='HEAD'||ALWAYS_ALLOWED.some(([m,r])=>(m==='*'||m===method)&&r.test(path)))return;
 if(profile.suspended_at)fail(403,'This account is suspended for breaking the Bucketlist community rules. You can still delete your account or your own content.',{code:'suspended'});
 if(!termsAccepted(profile))fail(428,'Please review and accept the Bucketlist community rules to continue.',{code:'terms',termsVersion:TERMS_VERSION});
}

export async function deleteAccount(db,env,ctx,userId){
 const now=Date.now();
 if(!await db.prepare('SELECT 1 FROM community_profiles WHERE id=?').bind(userId).first())return {deleted:false};
 const owned=(await S(db,'SELECT g.id,(SELECT m.user_id FROM community_members m WHERE m.group_id=g.id AND m.user_id<>? ORDER BY m.joined_at,m.user_id LIMIT 1) AS heir FROM community_groups g WHERE g.owner_id=?',userId,userId).all()).results;
 const photos=(await S(db,'SELECT photo_key FROM play_courts WHERE created_by=? AND photo_key IS NOT NULL',userId).all()).results.map(r=>r.photo_key);
 const cancelled=(await S(db,"SELECT id FROM play_games WHERE host_id=? AND status='scheduled' AND ends_at>?",userId,now).all()).results.map(r=>r.id);
 const statements=[S(db,"INSERT OR IGNORE INTO community_profiles (id,name,created_at,updated_at) VALUES (?,'Former player',?,?)",DELETED_ID,now,now)];
 for(const g of owned){
  // Hand a shared group to its longest-standing member so other people keep their conversation.
  if(g.heir)statements.push(S(db,"UPDATE community_members SET role='owner' WHERE group_id=? AND user_id=?",g.id,g.heir),S(db,'UPDATE community_groups SET owner_id=?,updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM community_members WHERE group_id=? AND user_id=?)',g.heir,now,g.id,g.id,g.heir));
  else statements.push(S(db,'DELETE FROM community_groups WHERE id=?',g.id));
 }
 statements.push(
  S(db,'DELETE FROM community_messages WHERE user_id=?',userId),
  S(db,"UPDATE play_games SET status='cancelled',cancel_reason='The host deleted their Bucketlist account.',updated_at=? WHERE host_id=? AND status='scheduled' AND ends_at>?",now,userId,now),
  S(db,'UPDATE play_games SET host_id=? WHERE host_id=?',DELETED_ID,userId),
  S(db,'DELETE FROM play_players WHERE user_id=?',userId),
  S(db,'DELETE FROM play_confirmations WHERE user_id=?',userId),
  S(db,'DELETE FROM play_corrections WHERE user_id=?',userId),
  // Court pins describe public places and other players' games depend on them, so they stay, anonymised. Photos are personal uploads and are removed.
  S(db,'UPDATE play_courts SET created_by=?,photo_key=NULL,photo_type=NULL,updated_at=MAX(updated_at+1,?) WHERE created_by=?',DELETED_ID,now,userId),
  S(db,'DELETE FROM community_profiles WHERE id=?',userId)
 );
 await db.batch(statements);
 if(env.BUCKET)for(const key of photos)ctx.waitUntil(env.BUCKET.delete(key).catch(()=>{}));
 for(const id of cancelled)ctx.waitUntil(alertGame(db,id,userId).catch(()=>{}));
 return {deleted:true,groupsTransferred:owned.filter(g=>g.heir).length,groupsDeleted:owned.filter(g=>!g.heir).length,gamesCancelled:cancelled.length};
}

async function reportTarget(db,user,kind,targetId,membership){
 if(kind==='message'){
  const seq=Number(targetId);if(!Number.isSafeInteger(seq)||seq<1)fail(400,'Choose a message to report.');
  const m=await S(db,'SELECT m.seq,m.body,m.user_id,m.group_id,p.name,g.name AS group_name FROM community_messages m JOIN community_profiles p ON p.id=m.user_id JOIN community_groups g ON g.id=m.group_id WHERE m.seq=?',seq).first();if(!m)fail(404,'This message was already removed.');
  await membership(db,m.group_id,user.id);return {id:String(m.seq),owner:m.user_id,snapshot:{author:m.name,body:m.body,group:m.group_name,groupId:m.group_id}};
 }
 if(kind==='user'){const p=await S(db,'SELECT id,name FROM community_profiles WHERE id=? AND id<>?',targetId,DELETED_ID).first();if(!p)fail(404,'This player was not found.');return {id:p.id,owner:p.id,snapshot:{name:p.name}};}
 if(kind==='court'||kind==='photo'){
  const c=await S(db,'SELECT c.id,c.name,c.notes,c.created_by,c.photo_key,c.lat,c.lng,p.name AS park,p.city FROM play_courts c JOIN play_parks p ON p.id=c.park_id WHERE c.id=? AND c.hidden=0',targetId).first();if(!c)fail(404,'This court listing is no longer available.');
  if(kind==='photo'&&!c.photo_key)fail(404,'This court has no photo.');
  return {id:kind==='photo'?c.photo_key:c.id,owner:c.created_by,snapshot:{courtId:c.id,court:c.name,park:c.park,city:c.city,notes:c.notes,lat:c.lat,lng:c.lng,...(kind==='photo'?{photoUrl:'/api/public/courts/'+c.id+'/photo'}:{})}};
 }
 if(kind==='game'){const g=await S(db,'SELECT id,title,notes,host_id,court_id,starts_at FROM play_games WHERE id=?',targetId).first();if(!g)fail(404,'This game was not found.');return {id:g.id,owner:g.host_id,snapshot:{title:g.title,notes:g.notes,courtId:g.court_id,startsAt:g.starts_at}};}
 fail(400,'Choose what you are reporting.');
}

async function removeContent(db,env,ctx,report,moderatorId){
 const now=Date.now(),snap=JSON.parse(report.snapshot);
 if(report.kind==='message'){await S(db,'DELETE FROM community_messages WHERE seq=?',Number(report.target_id)).run();return;}
 if(report.kind==='photo'){const r=await S(db,'UPDATE play_courts SET photo_key=NULL,photo_type=NULL,updated_at=MAX(updated_at+1,?) WHERE id=? AND photo_key=?',now,snap.courtId,report.target_id).run();if(r.meta?.changes&&env.BUCKET)ctx.waitUntil(env.BUCKET.delete(report.target_id).catch(()=>{}));return;}
 if(report.kind==='game'){const r=await S(db,"UPDATE play_games SET status='cancelled',cancel_reason='Removed by Bucketlist moderators.',updated_at=? WHERE id=? AND status='scheduled'",now,report.target_id).run();if(r.meta?.changes)ctx.waitUntil(alertGame(db,report.target_id,moderatorId).catch(()=>{}));return;}
 if(report.kind==='court'){
  const games=(await S(db,"SELECT id FROM play_games WHERE court_id=? AND status='scheduled' AND ends_at>?",report.target_id,now).all()).results;
  const photo=await S(db,'SELECT photo_key FROM play_courts WHERE id=?',report.target_id).first();
  await db.batch([S(db,"UPDATE play_games SET status='cancelled',cancel_reason='This court listing was removed by Bucketlist moderators.',updated_at=? WHERE court_id=? AND status='scheduled' AND ends_at>?",now,report.target_id,now),S(db,'UPDATE play_courts SET hidden=1,photo_key=NULL,photo_type=NULL,updated_at=MAX(updated_at+1,?) WHERE id=?',now,report.target_id)]);
  if(photo?.photo_key&&env.BUCKET)ctx.waitUntil(env.BUCKET.delete(photo.photo_key).catch(()=>{}));
  for(const g of games)ctx.waitUntil(alertGame(db,g.id,moderatorId).catch(()=>{}));return;
 }
 fail(400,'Choose Suspend for a reported player. There is no single item to remove.');
}

// Returns a Response for safety routes, or null when the path belongs elsewhere.
export async function safetyApi(request,env,ctx,user,{answer,bodyJson,rate,membership}){
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method,db=env.DB,now=Date.now();
 if(path==='/api/community/reports'&&method==='POST'){
  await rate(db,user.id,'report',20,3600);const d=await bodyJson(request);
  if(!REPORT_KINDS.includes(d.kind))fail(400,'Choose what you are reporting.');if(!Object.hasOwn(REPORT_REASONS,d.reason))fail(400,'Choose a reason for your report.');
  if(typeof d.targetId!=='string'&&typeof d.targetId!=='number')fail(400,'Choose what you are reporting.');const targetId=String(d.targetId).slice(0,200);
  const note=typeof d.note==='string'?d.note.trim().normalize('NFC').slice(0,500):'';
  const target=await reportTarget(db,user,d.kind,targetId,membership);if(target.owner===user.id)fail(409,'You can’t report your own content. You can delete it instead.');
  await S(db,'INSERT OR IGNORE INTO community_reports (id,reporter_id,kind,target_id,target_user_id,reason,note,snapshot,created_at) VALUES (?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),user.id,d.kind,target.id,target.owner,d.reason,note,JSON.stringify(target.snapshot),now).run();
  return answer({ok:true},201);
 }
 if(path==='/api/community/blocks'&&method==='GET'){const rows=(await S(db,'SELECT b.blocked_id AS id,p.name,b.created_at FROM community_blocks b JOIN community_profiles p ON p.id=b.blocked_id WHERE b.user_id=? ORDER BY b.created_at DESC',user.id).all()).results;return answer({blocked:rows});}
 if(path==='/api/community/blocks'&&method==='POST'){
  await rate(db,user.id,'block',30,3600);const d=await bodyJson(request);if(typeof d.userId!=='string'||d.userId===user.id||d.userId===DELETED_ID)fail(400,'Choose another player to block.');
  if(!await S(db,'SELECT 1 FROM community_profiles WHERE id=?',d.userId).first())fail(404,'This player was not found.');
  await S(db,'INSERT OR IGNORE INTO community_blocks (user_id,blocked_id,created_at) VALUES (?,?,?)',user.id,d.userId,now).run();return answer({ok:true},201);
 }
 const unblock=path.match(/^\/api\/community\/blocks\/([^/]{1,320})$/);
 if(unblock&&method==='DELETE'){await S(db,'DELETE FROM community_blocks WHERE user_id=? AND blocked_id=?',user.id,decodeURIComponent(unblock[1])).run();return answer({ok:true});}

 if(!path.startsWith('/api/community/moderation/'))return null;
 if(!isModerator(env,user))fail(403,'Only Bucketlist moderators can open this page.');
 if(path==='/api/community/moderation/reports'&&method==='GET'){
  const status=url.searchParams.get('status')==='resolved'?'resolved':'open';
  const rows=(await S(db,`SELECT r.*,p.name AS reporter_name,t.name AS target_user_name,t.suspended_at AS target_suspended_at,(SELECT COUNT(*) FROM community_reports x WHERE x.kind=r.kind AND x.target_id=r.target_id) AS report_count FROM community_reports r LEFT JOIN community_profiles p ON p.id=r.reporter_id LEFT JOIN community_profiles t ON t.id=r.target_user_id WHERE ${status==='open'?"r.status='open'":"r.status<>'open'"} ORDER BY ${status==='open'?'r.created_at ASC':'r.resolved_at DESC'} LIMIT 200`).all()).results;
  return answer({reports:rows.map(r=>({id:r.id,kind:r.kind,targetId:r.target_id,targetUserId:r.target_user_id,targetUserName:r.target_user_name,targetSuspended:!!r.target_suspended_at,reason:r.reason,reasonLabel:REPORT_REASONS[r.reason]||r.reason,note:r.note,snapshot:JSON.parse(r.snapshot),status:r.status,action:r.action,reporterName:r.reporter_name||'Deleted account',reportCount:r.report_count,createdAt:r.created_at,resolvedAt:r.resolved_at}))});
 }
 const act=path.match(/^\/api\/community\/moderation\/reports\/([a-f0-9-]{36})$/);
 if(act&&method==='POST'){
  const d=await bodyJson(request),action=d.action;if(!['dismiss','remove','suspend','remove_and_suspend'].includes(action))fail(400,'Choose a moderation action.');
  const report=await S(db,'SELECT * FROM community_reports WHERE id=?',act[1]).first();if(!report)fail(404,'This report was not found.');
  if(action==='remove'||action==='remove_and_suspend')await removeContent(db,env,ctx,report,user.id);
  if(action==='suspend'||action==='remove_and_suspend'){if(!report.target_user_id||report.target_user_id===DELETED_ID)fail(409,'This account was already deleted.');if(report.target_user_id===user.id)fail(409,'You can’t suspend your own account.');await S(db,'UPDATE community_profiles SET suspended_at=COALESCE(suspended_at,?) WHERE id=?',now,report.target_user_id).run();}
  await S(db,"UPDATE community_reports SET status=?,action=?,resolved_at=?,resolved_by=? WHERE kind=? AND target_id=? AND status='open'",action==='dismiss'?'dismissed':'actioned',action,now,user.id,report.kind,report.target_id).run();
  return answer({ok:true});
 }
 const person=path.match(/^\/api\/community\/moderation\/users\/([^/]{1,320})$/);
 if(person&&method==='DELETE'){const d=await bodyJson(request),id=decodeURIComponent(person[1]);if(d.confirm!=='DELETE')fail(400,'Type DELETE to confirm.');if(id===user.id||id===DELETED_ID)fail(409,'Use Account → Delete my account for your own account.');const result=await deleteAccount(db,env,ctx,id);if(!result.deleted)fail(404,'This player was not found.');return answer(result);}
 if(person&&method==='POST'){const d=await bodyJson(request);if(typeof d.suspended!=='boolean')fail(400,'Choose suspend or restore.');const id=decodeURIComponent(person[1]);if(id===user.id)fail(409,'You can’t change your own account.');const r=await S(db,'UPDATE community_profiles SET suspended_at=? WHERE id=?',d.suspended?now:null,id).run();if(!r.meta?.changes)fail(404,'This player was not found.');return answer({ok:true});}
 fail(404,'This page was not found.');
}
