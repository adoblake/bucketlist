export class PushError extends Error{}
const encoder=new TextEncoder();
const bytes=value=>typeof value==='string'?encoder.encode(value):value;
const concat=(...items)=>{const all=items.map(bytes),out=new Uint8Array(all.reduce((n,a)=>n+a.length,0));let at=0;for(const a of all){out.set(a,at);at+=a.length;}return out;};
export function b64url(value){return btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function unbase64(value){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]+$/.test(value))throw new PushError('Invalid notification keys.');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));}
export async function sha256Text(value){return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));}
export function validateSubscription(value){
 let u;try{u=new URL(value?.endpoint);}catch{throw new PushError('Your browser did not provide a valid notification address.');}
 const host=u.hostname,allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!allowed||u.href.length>3000)throw new PushError('This notification service is not supported.');
 const p=value.keys?.p256dh,a=value.keys?.auth;try{if(unbase64(p).length!==65||unbase64(a).length!==16)throw Error();}catch{throw new PushError('Your browser did not provide valid notification keys.');}
 return {endpoint:u.href,p256dh:p,auth:a};
}
export async function pushKeys(db){
 let saved=await db.prepare("SELECT value FROM community_settings WHERE key='webpush-v1'").first();if(saved)return JSON.parse(saved.value);
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const pair={publicKey:b64url(new Uint8Array(await crypto.subtle.exportKey('raw',keys.publicKey))),privateKey:await crypto.subtle.exportKey('jwk',keys.privateKey)};
 await db.prepare("INSERT OR IGNORE INTO community_settings (key,value) VALUES ('webpush-v1',?)").bind(JSON.stringify(pair)).run();
 saved=await db.prepare("SELECT value FROM community_settings WHERE key='webpush-v1'").first();return JSON.parse(saved.value);
}
async function hmac(key,data){const imported=await crypto.subtle.importKey('raw',bytes(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',imported,bytes(data)));}
async function expand(key,info,length){return (await hmac(key,concat(info,new Uint8Array([1])))).slice(0,length);}
export async function encryptPush(subscription,payload){
 const recipient=unbase64(subscription.p256dh),auth=unbase64(subscription.auth),salt=crypto.getRandomValues(new Uint8Array(16));
 const sender=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const publicKey=new Uint8Array(await crypto.subtle.exportKey('raw',sender.publicKey));
 const ua=await crypto.subtle.importKey('raw',recipient,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:ua},sender.privateKey,256));
 const keyPrk=await hmac(auth,shared),ikm=await expand(keyPrk,concat('WebPush: info\0',recipient,publicKey),32),prk=await hmac(salt,ikm);
 const cek=await expand(prk,'Content-Encoding: aes128gcm\0',16),nonce=await expand(prk,'Content-Encoding: nonce\0',12);
 const aes=await crypto.subtle.importKey('raw',cek,{name:'AES-GCM'},false,['encrypt']);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,tagLength:128},aes,concat(JSON.stringify(payload),new Uint8Array([2]))));
 const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,4096);
 return concat(salt,size,new Uint8Array([65]),publicKey,cipher);
}
export async function pushRequest(subscription,keys,payload,fetcher=fetch){
 const header=b64url(encoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=b64url(encoder.encode(JSON.stringify({aud:new URL(subscription.endpoint).origin,exp:Math.floor(Date.now()/1000)+3600*6,sub:'https://adoblake.github.io/bucketlist/'})));
 const text=header+'.'+claims,key=await crypto.subtle.importKey('jwk',keys.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=b64url(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(text))));
 return fetcher(subscription.endpoint,{method:'POST',redirect:'error',headers:{Authorization:`vapid t=${text}.${signature}, k=${keys.publicKey}`,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'3600',Urgency:'normal'},body:await encryptPush(subscription,payload)});
}
export async function pushGroupMessage(db,groupId,senderId){
 const rows=await db.prepare('SELECT s.id,s.endpoint,s.p256dh,s.auth FROM community_push s JOIN community_members m ON m.user_id=s.user_id WHERE m.group_id=? AND s.user_id<>? LIMIT 250').bind(groupId,senderId).all();if(!rows.results.length)return;
 const keys=await pushKeys(db),payload={title:'New Bucketlist message',body:'Someone in your group sent a message. Open Bucketlist to read it.',url:'/community/#group='+groupId,tag:'group-'+groupId};
 for(let i=0;i<rows.results.length;i+=5)await Promise.all(rows.results.slice(i,i+5).map(async row=>{try{const response=await pushRequest(row,keys,payload);if(response.status===404||response.status===410)await db.prepare('DELETE FROM community_push WHERE id=?').bind(row.id).run();}catch{}}));
}
