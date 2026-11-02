import http from 'node:http';import {readFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import worker from '../community-dist/dist/server/index.js';
const database=new DatabaseSync(process.env.COMMUNITY_DB||':memory:');database.exec('PRAGMA foreign_keys=ON');
// Loopback-only development adapter. Hosted identity is injected by Sites, never by this server.
const sql=readFileSync(new URL('../drizzle/0000_sticky_nightcrawler.sql',import.meta.url),'utf8');
if(!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='community_profiles'").get())database.exec(sql);
function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return database.prepare(sql).get(...args)||null;},async all(){return {results:database.prepare(sql).all(...args)};},async run(){const result=database.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};}
const env={DB:{prepare:sql=>statement(sql),async batch(statements){database.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());database.exec('COMMIT');return results;}catch(error){database.exec('ROLLBACK');throw error;}}}};
const server=http.createServer(async(req,res)=>{try{const origin='http://127.0.0.1:'+(process.env.PORT||3120),url=new URL(req.url,origin);
 if(url.pathname==='/signin-with-chatgpt'){const returnTo=url.searchParams.get('return_to')||'/community/';res.writeHead(302,{'Set-Cookie':'community-local-user=alice; HttpOnly; SameSite=Lax; Path=/','Location':returnTo.startsWith('/')&&!returnTo.startsWith('//')?returnTo:'/community/'});res.end();return;}
 if(url.pathname==='/signout-with-chatgpt'){res.writeHead(302,{'Set-Cookie':'community-local-user=; Max-Age=0; Path=/','Location':'/community/'});res.end();return;}
 const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(!name.startsWith('oai-')&&value)headers.set(name,Array.isArray(value)?value.join(','):value);
 const id=(req.headers.cookie||'').match(/(?:^|;\s*)community-local-user=(alice|bob|casey)(?:;|$)/)?.[1];if(id){headers.set('oai-authenticated-user-id','local-'+id);headers.set('oai-authenticated-user-email',id+'@sites.test');}
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request(url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
 const response=await worker.fetch(request,env,{waitUntil(promise){promise.catch(()=>{});}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error);res.writeHead(500);res.end('Local preview error');}});
server.listen(Number(process.env.PORT||3120),'127.0.0.1',()=>console.log('Community local preview: http://127.0.0.1:'+(process.env.PORT||3120)+'/community/'));
