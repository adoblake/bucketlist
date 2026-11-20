// Builds the nationwide court directory from OpenStreetMap so every player sees the courts near them,
// even when live lookups are slow or down.
//
//   npm run refresh:us-courts                 fetch (or reuse cached) data for every state, then write tiles
//   npm run refresh:us-courts -- GA FL NY CA  only these states (tiles for other states are kept)
//
// Output: public/data/us/index.json plus one small file per half-degree tile (public/data/us/<lat>_<lng>.json).
// Raw Overpass responses are cached in .cache/us-courts/ so an interrupted run resumes where it stopped.
// Data © OpenStreetMap contributors, ODbL 1.0. Attribution is shown in the app wherever these courts appear.
import {mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {buildLocations,tileKey,TILE_SIZE} from '../public/us-courts.js';

const root=new URL('../',import.meta.url),cacheDir=new URL('.cache/us-courts/',root),outDir=new URL('public/data/us/',root);
const ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const STATES=['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR'];
const CHUNK=3;// degrees; small enough for dense metros, few enough to finish in reasonable time
// Alaska and Hawaii span huge, mostly empty boxes, so they use bigger pieces.
const CHUNK_FOR={AK:8,HI:5};
const only=process.argv.slice(2).map(s=>s.toUpperCase()).filter(s=>STATES.includes(s));
if(process.argv.length>2&&!only.length)throw Error('Unknown state code. Use two-letter codes such as GA FL NY CA.');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let turn=0;
async function overpass(query,label){
 for(let attempt=1;attempt<=6;attempt++){
  const endpoint=ENDPOINTS[(turn++)%ENDPOINTS.length];
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'bucketlist-court-directory/1.0'},body:'data='+encodeURIComponent(query),signal:AbortSignal.timeout(400000)});
   if(response.status===429||response.status===504||response.status===503){console.warn(`  ${label}: busy (${response.status}), retrying`);await sleep(20000*attempt);continue;}
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();if(data.remark&&/runtime error|timed out|out of memory/i.test(data.remark))throw Error(data.remark);
   if(!Array.isArray(data.elements))throw Error('Unexpected response');return data;
  }catch(error){console.warn(`  ${label}: ${error.message} (attempt ${attempt})`);await sleep(10000*attempt);}
 }
 throw Error('Gave up on '+label);
}
async function cached(name,make){const file=new URL(name,cacheDir);if(existsSync(file))return JSON.parse(await readFile(file,'utf8'));const data=await make();await writeFile(file,JSON.stringify(data));return data;}

const COURTS='nwr["sport"~"(^|;)basketball(;|$)"]';
const PLACES='nwr["name"]["leisure"~"^(park|recreation_ground|sports_centre)$"];nwr["name"]["amenity"~"^(school|college|university|community_centre)$"]';
function chunks(b,size=CHUNK){
 // A box wider than 180° wraps the antimeridian (Alaska's Aleutians); keep the western-hemisphere part, where the people are.
 if(b.maxlon-b.minlon>180)b={...b,minlon:-180,maxlon:-129.9};
 const out=[];for(let s=Math.floor(b.minlat);s<b.maxlat;s+=size)for(let w=Math.floor(b.minlon);w<b.maxlon;w+=size)out.push([s,w,Math.min(s+size,Math.ceil(b.maxlat)),Math.min(w+size,Math.ceil(b.maxlon))]);return out;}

await mkdir(cacheDir,{recursive:true});await mkdir(outDir,{recursive:true});
const bounds=await cached('states.json',()=>overpass('[out:json][timeout:300];rel["boundary"="administrative"]["admin_level"="4"]["ISO3166-2"~"^US-"];out tags bb;','state boundaries'));
const stateBounds=new Map(bounds.elements.filter(e=>e.bounds&&e.tags?.['ISO3166-2']).map(e=>[e.tags['ISO3166-2'].slice(3),e.bounds]));
const todo=only.length?only:STATES;
const started=Date.now();let done=0;
const failed=[];
for(const state of todo){
 const b=stateBounds.get(state);if(!b){console.warn('No boundary for '+state+', skipping.');failed.push(state);continue;}
 const records={courts:[],containers:[],towns:[]};
 try{
  for(const [s,w,n,e] of chunks(b,CHUNK_FOR[state])){
   const box=`(${s},${w},${n},${e})`,label=`${state} ${box}`;
   const data=await cached(`${state}_${s}_${w}.json`,()=>overpass(`[out:json][timeout:360][maxsize:1073741824];area["ISO3166-2"="US-${state}"]["admin_level"="4"]->.s;${COURTS}(area.s)${box};out tags center;(${PLACES.split(';').map(q=>q+'(area.s)'+box+';').join('')});out tags bb;node["place"~"^(city|town|village|suburb|hamlet)$"]["name"](area.s)${box};out body;`,label));
   for(const el of data.elements){const t=el.tags||{};if(t.place&&el.type==='node')records.towns.push(el);else if(/(^|;)basketball(;|$)/.test(t.sport||''))records.courts.push(el);else records.containers.push(el);}
  }
 }catch(error){
  // Keep going so one stubborn state doesn't block the rest; finished pieces stay cached for the next run.
  console.warn(`${state}: ${error.message}; its previous tiles (if any) are kept.`);failed.push(state);continue;
 }
 const locations=buildLocations(records,state);
 await writeFile(new URL(`state-${state}.json`,cacheDir),JSON.stringify(locations));
 done++;console.log(`${state}: ${records.courts.length} court features → ${locations.length} locations (${done}/${todo.length}, ${Math.round((Date.now()-started)/1000)}s)`);
}

// Tiles are written from every built state, so refreshing a few states keeps the rest.
const all=[],built=new Set();for(const name of (await readdir(cacheDir)).filter(n=>/^state-[A-Z]{2}\.json$/.test(n))){built.add(name.slice(6,8));all.push(...JSON.parse(await readFile(new URL(name,cacheDir),'utf8')));}
// A state that failed and has no cached build keeps the courts already published for it.
for(const name of (await readdir(outDir)).filter(n=>/^-?\d+\.\d_-?\d+\.\d\.json$/.test(n)))for(const loc of JSON.parse(await readFile(new URL(name,outDir),'utf8')))if(!built.has(loc.s))all.push(loc);
const tiles=new Map();for(const loc of all){const key=tileKey(loc.la,loc.lo);if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(loc);}
for(const name of await readdir(outDir))if(name.endsWith('.json'))await rm(new URL(name,outDir));
const checkedAt=new Date().toISOString().slice(0,10),index={source:'OpenStreetMap',license:'ODbL 1.0',attribution:'© OpenStreetMap contributors',checkedAt,tileSize:TILE_SIZE,locations:all.length,tiles:{}};
for(const [key,list] of [...tiles].sort()){list.sort((a,b)=>a.i.localeCompare(b.i));await writeFile(new URL(key+'.json',outDir),JSON.stringify(list));index.tiles[key]=list.length;}
await writeFile(new URL('index.json',outDir),JSON.stringify(index));
console.log(`Wrote ${all.length} court locations in ${tiles.size} tiles to public/data/us/.`);
if(failed.length){console.warn('Not refreshed this run: '+failed.join(' ')+'. Run again to resume.');process.exitCode=2;}
