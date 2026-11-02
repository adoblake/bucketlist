import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';

// Managed email verification and sessions. No passwords or signing keys live in Bucketlist.
export class EmailAuthError extends Error {
 constructor(status,message){super(message);this.status=status;}
}

export function normalizeEmail(value){
 if(typeof value!=='string')throw new EmailAuthError(400,'Enter your email address.');
 const email=value.trim().toLowerCase();
 if(email.length>254||!/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(email))throw new EmailAuthError(400,'Check your email address and try again.');
 return email;
}

function configuration(env){
 if(env.EMAIL_AUTH_ENABLED!=='true')return null;
 try{
  const url=new URL(env.SUPABASE_URL),key=env.SUPABASE_PUBLISHABLE_KEY;
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||typeof key!=='string')return null;
  // Reject admin/secret credentials: this integration only needs a public auth key.
  const publishable=/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key);
  let anon=false;try{anon=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{}
  return publishable||anon?{url:url.origin,key}:null;
 }catch{return null;}
}

export function createEmailAuth(request,env,{fetch:authFetch=globalThis.fetch}={}){
 const config=configuration(env),secure=new URL(request.url).protocol==='https:',cookieName=secure?'__Host-bucketlist-email':'bucketlist-email';
 const fixedOptions={path:'/',httpOnly:true,sameSite:'lax',secure},pending=new Map();
 let incoming=[];try{incoming=parseCookieHeader(request.headers.get('cookie')||'');}catch{}
 const ours=name=>name===cookieName||name.startsWith(cookieName+'.');
 const hasSession=()=>incoming.some(c=>ours(c.name)&&c.value);
 function setCookies(cookies){for(const {name,value,options} of cookies){if(!ours(name))continue;pending.set(name,serializeCookieHeader(name,value,{...options,...fixedOptions}));incoming=incoming.filter(c=>c.name!==name);if(value)incoming.push({name,value});}}
 function clearCookies(){setCookies(incoming.filter(c=>ours(c.name)).map(c=>({name:c.name,value:'',options:{maxAge:0}})));}
 let client;
 function managedClient(){
  if(!config)throw new EmailAuthError(503,'Email sign-in is not available yet. Please use ChatGPT for now.');
  return client??=createServerClient(config.url,config.key,{
   cookieOptions:{name:cookieName,...fixedOptions,maxAge:60*60*24*30},
   cookies:{getAll:()=>incoming,setAll:setCookies},
   global:{fetch:(input,options)=>authFetch(input,{...options,signal:AbortSignal.timeout(10000)})}
  });
 }
 function verified(user,email){return !!user&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(user.id)&&!!user.email_confirmed_at&&typeof user.email==='string'&&(!email||user.email.toLowerCase()===email);}
 const unavailable=()=>new EmailAuthError(503,'Email sign-in is temporarily unavailable. Please try again shortly.');
 async function providerCall(fn){try{return await fn();}catch{throw unavailable();}}
 return {
  available:!!config,
  clearCookies,
  respond(response){const headers=new Headers(response.headers);for(const cookie of pending.values())headers.append('Set-Cookie',cookie);return new Response(response.body,{status:response.status,headers});},
  async sendCode(email){
   const {error}=await providerCall(()=>managedClient().auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:new URL('/community/',request.url).href}}));
   if(error){if(error.status===429)throw new EmailAuthError(429,'Please wait a minute before asking for another code.');throw unavailable();}
  },
  async verifyCode(email,token){
   if(typeof token!=='string'||!/^\d{6,10}$/.test(token.trim()))throw new EmailAuthError(400,'Enter the code from your email.');
   const {data,error}=await providerCall(()=>managedClient().auth.verifyOtp({email,token:token.trim(),type:'email'}));
   if(error||!data.session||!verified(data.user,email)){
    clearCookies();
    if(error?.status===429)throw new EmailAuthError(429,'Too many attempts. Please wait a few minutes and try again.');
    if(error?.status>=500)throw unavailable();
    throw new EmailAuthError(400,'That code is incorrect or has expired. Check your latest email, or ask for a new code.');
   }
  },
  async identity(){
   if(!config||!hasSession())return null;
   const {data,error}=await providerCall(()=>managedClient().auth.getUser());
   if(error){if(!error.status||error.status>=500||error.status===429)throw unavailable();clearCookies();return null;}
   if(!verified(data.user)){clearCookies();return null;}
   return {id:'email:'+data.user.id,method:'email'};
  },
  async signOut(){
   try{if(config&&hasSession())await managedClient().auth.signOut({scope:'local'});}catch{}finally{clearCookies();}
  }
 };
}
