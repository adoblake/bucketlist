// In-memory Supabase Auth transport. Never sends mail or contacts a real service.
export function mockEmailProvider(){
 const calls=[],users=new Map(),access=new Map(),refresh=new Map(),codes=new Map();
 const state={calls,users,access,refresh,codes,sendError:null,verifyError:null,outage:false,confirmed:true};
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const fail=(code,status=400)=>json({code,msg:code},status);
 const b64=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
 function session(user){const now=Math.floor(Date.now()/1000),token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600,email:user.email,session_id:crypto.randomUUID()})+'.mock-signature',refreshToken=crypto.randomUUID();access.set(token,user);refresh.set(refreshToken,user);return {access_token:token,refresh_token:refreshToken,token_type:'bearer',expires_in:3600,expires_at:now+3600,user};}
 state.fetch=async(input,options={})=>{
  if(state.outage)return fail('service_unavailable',503);
  const url=new URL(typeof input==='string'?input:input.url),headers=new Headers(options.headers),body=options.body?JSON.parse(options.body):{};
  calls.push({path:url.pathname,method:options.method||'GET',body});
  if(url.pathname==='/auth/v1/otp'){
   if(state.sendError)return fail(state.sendError.code,state.sendError.status);
   codes.set(body.email,'123456');return json({});
  }
  if(url.pathname==='/auth/v1/verify'){
   if(state.verifyError)return fail(state.verifyError.code,state.verifyError.status);
   if(!codes.get(body.email)||codes.get(body.email)!==body.token)return fail('otp_expired',403);
   codes.delete(body.email);
   let user=users.get(body.email);if(!user){user={id:crypto.randomUUID(),aud:'authenticated',role:'authenticated',email:body.email,email_confirmed_at:state.confirmed?new Date().toISOString():null,app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:new Date().toISOString()};users.set(body.email,user);}
   return json(session(user));
  }
  if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='refresh_token'){
   const user=refresh.get(body.refresh_token);if(!user)return fail('refresh_token_not_found',400);refresh.delete(body.refresh_token);return json(session(user));
  }
  const token=headers.get('authorization')?.replace(/^Bearer /,'');
  if(url.pathname==='/auth/v1/user'){const user=access.get(token);return user?json(user):fail('bad_jwt',401);}
  if(url.pathname==='/auth/v1/logout'){const user=access.get(token);for(const [key,value] of access)if(value===user)access.delete(key);for(const [key,value] of refresh)if(value===user)refresh.delete(key);return new Response(null,{status:204});}
  throw Error('Unexpected mock auth endpoint: '+url.pathname);
 };
 return state;
}
