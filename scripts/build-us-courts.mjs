// Builds the nationwide court directory from OpenStreetMap so every player sees the courts near them,
// even when live lookups are slow or down.
//
//   npm run refresh:us-courts                 download (or reuse cached) data for every state, then write tiles
//   npm run refresh:us-courts -- GA FL NY CA  only these states (tiles for other states are kept)
//   npm run refresh:us-courts -- --tiles-only rewrite tiles from already-built states
//
// Source: Geofabrik's daily per-state OpenStreetMap extracts (download.geofabrik.de), filtered with osmium-tool
// (`apt install osmium-tool` / `brew install osmium-tool`). The public Overpass servers can't serve a nationwide
// pull reliably, so the bulk extracts are used instead.
//
// Output: public/data/us/index.json plus one small file per half-degree tile (public/data/us/<lat>_<lng>.json).
// Filtered state data is cached in .cache/us-courts/ so an interrupted run resumes where it stopped.
// Data © OpenStreetMap contributors, ODbL 1.0. Attribution is shown in the app wherever these courts appear.
import {mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {existsSync,createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {buildLocations,tileKey,TILE_SIZE} from '../public/us-courts.js';

const run=promisify(execFile);
const root=new URL('../',import.meta.url),cacheDir=new URL('.cache/us-courts/',root),outDir=new URL('public/data/us/',root);
const path=u=>fileURLToPath(u);
const UA='bucketlist-court-directory/1.0';
// Download links come from Geofabrik's own index, matched by ISO code (US-GA, US-FL, …), not from guessed paths.
const INDEX=process.env.GEOFABRIK_INDEX||'https://download.geofabrik.de/index-v1-nogeom.json';
// Most populous first, so a run that is cut short still covers the most players.
const NAMES={CA:'california',TX:'texas',FL:'florida',NY:'new-york',PA:'pennsylvania',IL:'illinois',OH:'ohio',GA:'georgia',NC:'north-carolina',MI:'michigan',NJ:'new-jersey',VA:'virginia',WA:'washington',AZ:'arizona',TN:'tennessee',MA:'massachusetts',IN:'indiana',MD:'maryland',MO:'missouri',WI:'wisconsin',CO:'colorado',MN:'minnesota',SC:'south-carolina',AL:'alabama',LA:'louisiana',KY:'kentucky',OR:'oregon',OK:'oklahoma',CT:'connecticut',UT:'utah',IA:'iowa',NV:'nevada',AR:'arkansas',KS:'kansas',MS:'mississippi',NM:'new-mexico',NE:'nebraska',ID:'idaho',WV:'west-virginia',HI:'hawaii',NH:'new-hampshire',ME:'maine',MT:'montana',RI:'rhode-island',DE:'delaware',SD:'south-dakota',ND:'north-dakota',AK:'alaska',DC:'district-of-columbia',VT:'vermont',WY:'wyoming',PR:'puerto-rico'};
const STATES=Object.keys(NAMES);
// Optional time budget (minutes): stop starting new states when it runs out, still write tiles for what's done.
const budgetMs=Number(process.env.BUDGET_MINUTES||0)*60000;
// --tiles-only: skip downloading and just (re)write the tiles from the built states in .cache/us-courts/
// (the workflow builds states in parallel jobs, then merges them this way).
// --probe: only check that each listed state's extract can be downloaded (the workflow's preflight).
const args=process.argv.slice(2),tilesOnly=args.includes('--tiles-only'),probe=args.includes('--probe');
const only=args.filter(a=>!a.startsWith('--')).map(s=>s.toUpperCase()).filter(s=>STATES.includes(s));
if(args.some(a=>!a.startsWith('--'))&&!only.length)throw Error('Unknown state code. Use two-letter codes such as GA FL NY CA.');

// Everything the directory needs: courts (any sport tag; basketball is picked out later), the parks, schools and
// centres that contain them, and named places for the city line.
const FILTERS=['nwr/sport','nwr/leisure=park,recreation_ground,sports_centre','nwr/amenity=school,college,university,community_centre','n/place=city,town,village,suburb,hamlet'];

let links=null;
async function downloadUrl(state){
 links??=(async()=>{
  // A single network blip here would fail every state, so retry a few times.
  let r;for(let attempt=1;;attempt++){
   try{r=await fetch(INDEX,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(60000)});if(r.ok||r.status<500)break;}catch(error){if(attempt>=4)throw Error(`Geofabrik index ${INDEX}: ${error.message}`);}
   if(attempt>=4)break;await new Promise(done=>setTimeout(done,5000*attempt));
  }
  if(!r.ok)throw Error(`Geofabrik index ${INDEX}: HTTP ${r.status}`);
  const found=new Map();
  for(const {properties:p={}} of (await r.json()).features||[]){
   // The index gives ISO codes as a string or a list depending on the region.
   const list=v=>Array.isArray(v)?v:v?[v]:[];
   const pbf=p.urls?.pbf,codes=list(p['iso3166-2']);if(list(p['iso3166-1:alpha2']).includes('PR'))codes.push('US-PR');
   // Prefer the state-level extract (parent "us") over any sub-region that carries the same code.
   for(const code of codes)if(pbf&&/^US-[A-Z]{2}$/.test(code)&&(!found.has(code)||p.parent==='us'))found.set(code,pbf);
  }
  return found;
 })();
 links.catch(()=>{links=null;});
 const url=(await links).get('US-'+state);if(!url)throw Error(`No Geofabrik extract listed for US-${state} in ${INDEX}`);
 return url;
}

// A URL that actually serves bytes (checked with a 1-byte ranged GET).
async function reachable(url){try{await run('curl',['-fsSL','--retry','2','--retry-delay','5','-r','0-0','-o','/dev/null','-A',UA,url]);return true;}catch{return false;}}
// Geofabrik's "-latest" link redirects to a dated file (georgia-261120.osm.pbf) that can be missing while the daily
// update publishes; fall back to the newest dated file from the past week that downloads.
async function workingUrl(state){
 const latest=await downloadUrl(state);if(await reachable(latest))return latest;
 const base=latest.replace(/-latest\.osm\.pbf$/,'');
 for(let days=0;days<=7;days++){const stamp=new Date(Date.now()-days*864e5).toISOString().slice(2,10).replace(/-/g,''),url=`${base}-${stamp}.osm.pbf`;if(await reachable(url))return url;}
 throw Error(`${latest} redirects to a missing file, and no dated file from the past week downloads`);
}

async function extract(state){
 const features=new URL(`${state}.geojsonseq`,cacheDir);
 if(existsSync(features))return features;
 const pbf=new URL(`${state}.osm.pbf`,cacheDir),filtered=new URL(`${state}.filtered.osm.pbf`,cacheDir),partial=new URL(`${state}.partial`,cacheDir);
 try{
  const url=await workingUrl(state);console.log(`${state}: downloading ${url}`);
  // Bounded download: up to 3 retries for transient errors only (a 404 fails at once), abort a transfer that stalls
  // below 100 KB/s for 2 minutes, never more than 70 minutes.
  await run('curl',['-fsSL','--retry','3','--retry-delay','20','--connect-timeout','30','--speed-limit','102400','--speed-time','120','--max-time','4200','-A',UA,'-o',path(pbf),url],{maxBuffer:1<<20})
   .catch(error=>{throw Error(`${url}: ${String(error.stderr||error.message).trim()}`);});
  await run('osmium',['tags-filter','--overwrite','-o',path(filtered),path(pbf),...FILTERS]);
  await rm(pbf,{force:true});
  await run('osmium',['export','--overwrite','-f','geojsonseq','--format-option','print_record_separator=false','-a','type,id','-o',path(partial),path(filtered)]);
  await run('mv',[path(partial),path(features)]);
  return features;
 }finally{for(const f of [pbf,filtered,partial])await rm(f,{force:true});}
}

// osmium's GeoJSON features → the element shape buildLocations() expects (as Overpass would give: center + bounds).
function element(feature){
 const {'@type':type,'@id':id,...tags}=feature.properties||{},g=feature.geometry;if(!type||!g)return null;
 if(g.type==='Point')return {type,id,lat:g.coordinates[1],lon:g.coordinates[0],tags};
 let minlat=90,maxlat=-90,minlon=180,maxlon=-180;
 const walk=c=>{if(typeof c[0]==='number'){if(c[1]<minlat)minlat=c[1];if(c[1]>maxlat)maxlat=c[1];if(c[0]<minlon)minlon=c[0];if(c[0]>maxlon)maxlon=c[0];}else c.forEach(walk);};
 walk(g.coordinates);if(minlat>maxlat)return null;
 return {type,id,tags,center:{lat:(minlat+maxlat)/2,lon:(minlon+maxlon)/2},bounds:{minlat,minlon,maxlat,maxlon}};
}
async function records(features){
 // osmium writes a closed way both as a line and as an area; keep one copy per OSM object.
 const byRef=new Map();
 for await(const line of createInterface({input:createReadStream(features),crlfDelay:Infinity})){
  const text=line.replace(/^\x1e/,'').trim();if(!text)continue;
  const el=element(JSON.parse(text));if(el)byRef.set(el.type+el.id,el);
 }
 const out={courts:[],containers:[],towns:[]};
 for(const el of byRef.values()){const t=el.tags;
  if(t.place&&el.type==='node')out.towns.push(el);
  else if(/(^|;)\s*basketball\s*(;|$)/.test(t.sport||''))out.courts.push(el);
  else if(t.leisure||t.amenity)out.containers.push(el);
 }
 return out;
}

if(probe){
 let ok=true;for(const state of only)try{console.log(`${state}: ${await workingUrl(state)}`);}catch(error){ok=false;console.error(`${state}: ${error.message}`);}
 process.exit(ok?0:1);
}
await mkdir(cacheDir,{recursive:true});await mkdir(outDir,{recursive:true});
const todo=tilesOnly?[]:only.length?only:STATES;
const started=Date.now();let done=0;
const failed=[];let failedInARow=0;
// Stop early when the source itself is down, rather than spending minutes failing on every remaining state.
const GIVE_UP_AFTER=3;
for(const state of todo){
 if(failedInARow>=GIVE_UP_AFTER){console.warn(`${GIVE_UP_AFTER} states failed in a row; the source looks unavailable, so ${state} and later states wait for the next run.`);failed.push(...todo.slice(todo.indexOf(state)));break;}
 if(budgetMs&&Date.now()-started>budgetMs){console.warn(`Time budget used up; ${state} and later states wait for the next run.`);failed.push(...todo.slice(todo.indexOf(state)));break;}
 let data;
 try{data=await records(await extract(state));}
 catch(error){
  // Keep going so one stubborn state doesn't block the rest.
  console.warn(`${state}: ${String(error.stderr||error.message).trim().split('\n').pop()}; its previous tiles (if any) are kept.`);failed.push(state);failedInARow++;continue;
 }
 failedInARow=0;
 const locations=buildLocations(data,state);
 await writeFile(new URL(`state-${state}.json`,cacheDir),JSON.stringify(locations));
 done++;console.log(`${state}: ${data.courts.length} court features → ${locations.length} locations (${done}/${todo.length}, ${Math.round((Date.now()-started)/1000)}s)`);
}

// Tiles are written from every built state, so refreshing a few states keeps the rest.
const all=[],built=new Set();for(const name of (await readdir(cacheDir)).filter(n=>/^state-[A-Z]{2}\.json$/.test(n))){built.add(name.slice(6,8));all.push(...JSON.parse(await readFile(new URL(name,cacheDir),'utf8')));}
// A state that failed and has no cached build keeps the courts already published for it.
for(const name of (await readdir(outDir)).filter(n=>/^-?\d+\.\d_-?\d+\.\d\.json$/.test(n)))for(const loc of JSON.parse(await readFile(new URL(name,outDir),'utf8')))if(!built.has(loc.s))all.push(loc);
// State extracts overlap slightly at borders; keep one copy of each park or court group.
const seen=new Set(),unique=all.filter(loc=>{const k=loc.h?'h'+loc.h:'o'+loc.o;if(seen.has(k))return false;seen.add(k);return true;});
const tiles=new Map();for(const loc of unique){const key=tileKey(loc.la,loc.lo);if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(loc);}
for(const name of await readdir(outDir))if(name.endsWith('.json'))await rm(new URL(name,outDir));
const checkedAt=new Date().toISOString().slice(0,10),index={source:'OpenStreetMap',license:'ODbL 1.0',attribution:'© OpenStreetMap contributors',checkedAt,tileSize:TILE_SIZE,locations:unique.length,tiles:{}};
for(const [key,list] of [...tiles].sort()){list.sort((a,b)=>a.i.localeCompare(b.i));await writeFile(new URL(key+'.json',outDir),JSON.stringify(list));index.tiles[key]=list.length;}
await writeFile(new URL('index.json',outDir),JSON.stringify(index));
console.log(`Wrote ${unique.length} court locations in ${tiles.size} tiles to public/data/us/.`);
if(failed.length){console.warn('Not refreshed this run: '+failed.join(' ')+'. Run again to resume.');process.exitCode=2;}
