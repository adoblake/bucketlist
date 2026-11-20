// Nationwide court directory built from OpenStreetMap (© OpenStreetMap contributors, ODbL).
// scripts/build-us-courts.mjs turns raw OSM elements into compact location records with buildLocations();
// the app loads the half-degree tiles around the map with loadDirectoryCourts().
export const TILE_SIZE=0.5;
export function tileKey(lat,lng){const f=v=>(Math.floor(v/TILE_SIZE+1e-9)*TILE_SIZE).toFixed(1);return f(lat)+'_'+f(lng);}

const BLOCKED_ACCESS=new Set(['private','no','customers','members','permit','delivery','military','employees','students']);
const isBasketball=t=>/(^|;)\s*basketball\s*(;|$)/.test(t.sport||'');
const ref=el=>el.type[0]+el.id;
const center=el=>el.center?{lat:el.center.lat,lng:el.center.lon}:Number.isFinite(el.lat)?{lat:el.lat,lng:el.lon}:null;
const metres=(a,b)=>Math.hypot((a.lat-b.lat)*111320,(a.lng-b.lng)*111320*Math.cos(a.lat*Math.PI/180));
const round=v=>Math.round(v*1e5)/1e5;
const clean=(v,max=80)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,max):'';
function kindOf(t){if(['park','recreation_ground'].includes(t.leisure))return 'park';if(t.leisure==='sports_centre'||t.amenity==='community_centre')return 'centre';if(['school','college','university'].includes(t.amenity))return 'school';return '';}
function usableCourt(el){
 const t=el.tags||{};if(!isBasketball(t)||!center(el))return false;
 if(BLOCKED_ACCESS.has(String(t.access||'').toLowerCase()))return false;
 if(t.shop||t.office||t.craft||t.club||t.disused==='yes'||t['disused:sport']||t.abandoned==='yes'||t.construction)return false;
 return true;
}
function street(t){return clean([t['addr:housenumber'],t['addr:street']].filter(Boolean).join(' '),90);}
function facts(courts,container){
 const tags=courts.map(c=>c.tags||{}),out=[],any=(k,v)=>tags.some(t=>String(t[k]||'').toLowerCase()===v);
 out.push(courts.length===1?'1 mapped court':courts.length+' mapped courts');
 if(any('lit','yes'))out.push('Lights');else if(any('lit','no'))out.push('No lights');
 const hoops=tags.map(t=>Number.parseInt(t.hoops,10)).filter(n=>n>0&&n<50);if(hoops.length)out.push(hoops.reduce((a,b)=>a+b,0)+' hoops');
 const surfaces=[...new Set(tags.map(t=>clean(t.surface,20).toLowerCase().replace(/_/g,' ')).filter(Boolean))];if(surfaces.length)out.push('Surface: '+surfaces.slice(0,2).join(', '));
 if(any('indoor','yes')||tags.some(t=>t.leisure==='sports_hall'))out.push('Indoor');else if(any('covered','yes'))out.push('Covered');else if(tags.some(t=>t.leisure==='pitch'))out.push('Outdoor');
 const ct=container?.tags||{};
 if(any('fee','yes')||String(ct.fee).toLowerCase()==='yes')out.push('Fee may apply');else if(any('fee','no')||String(ct.fee).toLowerCase()==='no')out.push('Free to use');
 const hours=clean(tags.find(t=>t.opening_hours)?.opening_hours||ct.opening_hours,60);if(hours)out.push('Hours: '+hours.replace(/;/g,'; '));
 if(any('wheelchair','yes')||String(ct.wheelchair).toLowerCase()==='yes')out.push('Wheelchair accessible');
 if(container&&kindOf(ct)==='school')out.push('School grounds · public access not confirmed');
 return out;
}

// records: {courts, containers, towns} of raw Overpass elements for one state.
export function buildLocations({courts=[],containers=[],towns=[]},state){
 const seen=new Set(),usable=[];for(const el of courts){const id=ref(el);if(!seen.has(id)&&usableCourt(el)){seen.add(id);usable.push(el);}}
 // Containers are indexed by bounding box; huge areas (state parks, campuses) say little about where a court is.
 const CELL=.02,grid=new Map(),cell=(a,b)=>Math.floor(a/CELL)+':'+Math.floor(b/CELL);
 for(const el of containers){const t=el.tags||{},b=el.bounds;if(!b||!kindOf(t)||!clean(t.name)||BLOCKED_ACCESS.has(String(t.access||'').toLowerCase()))continue;if(b.maxlat-b.minlat>.15||b.maxlon-b.minlon>.15)continue;
  const area=(b.maxlat-b.minlat)*(b.maxlon-b.minlon);for(let la=Math.floor(b.minlat/CELL);la<=Math.floor(b.maxlat/CELL);la++)for(let lo=Math.floor(b.minlon/CELL);lo<=Math.floor(b.maxlon/CELL);lo++){const k=la+':'+lo;if(!grid.has(k))grid.set(k,[]);grid.get(k).push({el,b,area});}}
 const containerOf=p=>{let best=null;for(const c of grid.get(cell(p.lat,p.lng))||[])if(p.lat>=c.b.minlat&&p.lat<=c.b.maxlat&&p.lng>=c.b.minlon&&p.lng<=c.b.maxlon&&(!best||c.area<best.area))best=c;return best?.el||null;};
 const TCELL=.25,townGrid=new Map();for(const el of towns){if(!clean(el.tags?.name)||!Number.isFinite(el.lat))continue;const k=Math.floor(el.lat/TCELL)+':'+Math.floor(el.lon/TCELL);if(!townGrid.has(k))townGrid.set(k,[]);townGrid.get(k).push(el);}
 const townNear=p=>{let best=null,bestScore=Infinity;const la=Math.floor(p.lat/TCELL),lo=Math.floor(p.lng/TCELL);for(let a=la-1;a<=la+1;a++)for(let b=lo-1;b<=lo+1;b++)for(const t of townGrid.get(a+':'+b)||[]){const d=metres(p,{lat:t.lat,lng:t.lon}),major=['city','town','suburb'].includes(t.tags.place),score=d*(major?1:2.5);if(d<30000&&score<bestScore){best=t;bestScore=score;}}return best?clean(best.tags.name,50):'';};
 // Group courts that share a park, school, or centre; group loose courts within 60 m of each other.
 const groups=new Map();
 for(const el of usable){const p=center(el),host=containerOf(p);let key=host?'p'+ref(host):null;
  if(!key){for(const [k,g] of groups)if(!g.host&&metres(g.point,p)<60){key=k;break;}key=key||'c'+ref(el);}
  if(!groups.has(key))groups.set(key,{host,point:p,courts:[]});groups.get(key).courts.push(el);}
 const out=[];
 for(const [key,g] of groups){
  const ht=g.host?.tags||{},first=g.courts[0],ft=first.tags||{},p=g.point;
  const name=clean(ht.name)||clean(ft.name)||(ft.leisure==='sports_centre'?'Basketball gym':'Basketball court');
  const city=clean(ht['addr:city']||ft['addr:city'],50)||townNear(p);
  const record={i:state.toLowerCase()+'-'+key,n:name,k:g.host?kindOf(ht):'court',a:street(ht)||street(ft),c:city,s:state,la:round(p.lat),lo:round(p.lng),ct:g.courts.length,f:facts(g.courts,g.host),o:ref(first)};
  if(g.host)record.h=ref(g.host);
  const site=clean(ht.website||ht['contact:website']||ft.website,200);if(/^https?:\/\//i.test(site))record.u=site;
  out.push(record);
 }
 return out.sort((a,b)=>a.i.localeCompare(b.i));
}

const OSM_TYPES={n:'node',w:'way',r:'relation'};
const osmUrl=r=>r&&OSM_TYPES[r[0]]?`https://www.openstreetmap.org/${OSM_TYPES[r[0]]}/${r.slice(1)}`:null;
const KIND_TEXT={park:'Basketball courts mapped inside this park.',school:'Basketball courts mapped on school grounds. Public access isn’t confirmed; check before you go.',centre:'Basketball mapped at this recreation or sports centre. Hours and access may be limited.',court:'A basketball court mapped in OpenStreetMap.'};
// Turn a tile record into the court shape the map uses.
export function directoryCourt(r){
 if(!r||typeof r.i!=='string'||!Number.isFinite(r.la)||!Number.isFinite(r.lo))return null;
 const place=[r.c,r.s].filter(Boolean).join(', ');
 return {id:'us-'+r.i,name:String(r.n||'Basketball court'),city:String(r.c||''),state:String(r.s||''),address:[r.a,place].filter(Boolean).join(', ')||'Location on map',lat:r.la,lng:r.lo,kind:r.k||'court',
  description:KIND_TEXT[r.k]||KIND_TEXT.court,source:'OpenStreetMap',directory:'us',facts:Array.isArray(r.f)?r.f.map(String):[],website:typeof r.u==='string'&&/^https?:\/\//i.test(r.u)?r.u:null,
  sourceUrl:osmUrl(r.o),hostUrl:osmUrl(r.h),courtIds:Array.from({length:Math.max(1,Number(r.ct)||1)},(_,n)=>r.i+'-'+n)};
}

const tileCache=new Map();let indexRequest=null;
// Courts for the visible map area from the bundled nationwide directory: {courts, covered, checkedAt}.
// covered is false where no tiles are published (for example outside the US), so callers can fall back to live lookups.
export async function loadDirectoryCourts(bounds,{base,signal,fetcher=fetch}={}){
 const none={courts:[],covered:false,checkedAt:null};if(!bounds||![bounds.south,bounds.west,bounds.north,bounds.east].every(Number.isFinite))return none;
 const root=new URL('data/us/',base||location.href);
 indexRequest??=fetcher(new URL('index.json',root),{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
 const index=await indexRequest;if(!index?.tiles){indexRequest=null;return none;}
 const rows=[Math.floor(bounds.south/TILE_SIZE),Math.floor(bounds.north/TILE_SIZE)],cols=[Math.floor(bounds.west/TILE_SIZE),Math.floor(bounds.east/TILE_SIZE)];
 if((rows[1]-rows[0]+1)*(cols[1]-cols[0]+1)>24)throw Error('Zoom in to load nearby courts.');
 const keys=[];for(let la=rows[0];la<=rows[1];la++)for(let lo=cols[0];lo<=cols[1];lo++){const k=tileKey(la*TILE_SIZE,lo*TILE_SIZE);if(index.tiles[k])keys.push(k);}
 const lists=await Promise.allSettled(keys.map(k=>{if(!tileCache.has(k))tileCache.set(k,fetcher(new URL(k+'.json',root),{signal}).then(r=>{if(!r.ok)throw Error('tile');return r.json();}).catch(e=>{tileCache.delete(k);throw e;}));return tileCache.get(k);}));
 if(keys.length&&lists.every(l=>l.status==='rejected'))throw Error('Saved court directory is unavailable right now.');
 return {courts:lists.flatMap(l=>l.status==='fulfilled'&&Array.isArray(l.value)?l.value:[]).map(directoryCourt).filter(Boolean),covered:keys.length>0,checkedAt:typeof index.checkedAt==='string'?index.checkedAt:null};
}
export const directoryMeta=async(base)=>{const r=await fetch(new URL('data/us/index.json',base||location.href)).catch(()=>null);return r?.ok?r.json():null;};
