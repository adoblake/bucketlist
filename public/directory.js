// Overpass outputs each park followed by its tagged basketball features.
export function normalizeParkDirectory(elements, city='') {
 const found=new Map();let current=null;
 for(const e of elements){
  if(!e||!['node','way','relation'].includes(e.type)||!Number.isSafeInteger(e.id))continue;
  const tags=e.tags||{},point=e.center||e;
  if(tags.leisure==='park'){
   current={id:`osm-${e.type}-${e.id}`,name:String(tags.name||'Unnamed basketball park'),city:String(tags['addr:city']||city),address:[tags['addr:housenumber'],tags['addr:street'],tags['addr:city']||city].filter(Boolean).join(' ')||'Address not mapped',lat:point.lat,lng:point.lon,description:'OpenStreetMap lists basketball at this park. Access, opening hours, lighting, and court conditions need confirmation.',source:'OpenStreetMap',sourceUrl:`https://www.openstreetmap.org/${e.type}/${e.id}`,courtIds:[]};
   if(found.has(current.id))current=found.get(current.id);
  }
  if(current&&/(^|;)basketball(;|$)/.test(tags.sport||'')){
   if(!current.courtIds.length&&Number.isFinite(point.lat)&&Number.isFinite(point.lon)){current.lat=point.lat;current.lng=point.lon;}
   const id=e.type+'-'+e.id;if(!current.courtIds.includes(id))current.courtIds.push(id);
   found.set(current.id,current);
  }
 }
 return [...found.values()].filter(c=>Number.isFinite(c.lat)&&Number.isFinite(c.lng)&&Math.abs(c.lat)<=90&&Math.abs(c.lng)<=180);
}
export function parkQuery(lat,lon,radiusKm=16){
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)throw Error('Choose a valid map location.');
 const dy=radiusKm/111,dx=radiusKm/(111*Math.cos(lat*Math.PI/180));
 return `[out:json][timeout:35];nwr["leisure"="park"](${lat-dy},${lon-dx},${lat+dy},${lon+dx});foreach->.park(.park out tags center;.park map_to_area->.parkArea;nwr(area.parkArea)["sport"~"(^|;)basketball(;|$)"];out tags center;);`;
}
export async function discoverBasketballParks(query,signal,fetcher=fetch){
 let lat=33.475,lon=-112.02,city='Phoenix';
 if(query.trim().toLowerCase()!=='phoenix'){
  const response=await fetcher('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(query),{signal});if(!response.ok)throw Error('Location search is unavailable.');const places=await response.json();if(!places.length)throw Error('Location not found. Try a city name.');lat=Number(places[0].lat);lon=Number(places[0].lon);city=query;
 }
 let data,lastError;
 for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){
  try{const response=await fetcher(endpoint+'?data='+encodeURIComponent(parkQuery(lat,lon)),{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});if(!response.ok)throw Error('The park directory is temporarily unavailable.');const result=await response.json();if(result.remark)throw Error('The directory query was incomplete. Try a smaller area later.');if(!Array.isArray(result.elements))throw Error('The directory returned an unexpected response.');data=result;break;}catch(error){if(signal?.aborted)throw error;lastError=error;}
 }
 if(!data)throw lastError||Error('Directory unavailable.');
 const parks=normalizeParkDirectory(data.elements,city).filter(c=>{const r=d=>d*Math.PI/180,a=Math.sin(r(c.lat-lat)/2)**2+Math.cos(r(lat))*Math.cos(r(c.lat))*Math.sin(r(c.lng-lon)/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))<=16;});
 return {parks,center:{lat,lng:lon},city,checkedAt:new Date().toISOString()};
}

export async function locateDestination(query,signal,fetcher=fetch){
 const response=await fetcher('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(query),{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Location search unavailable.');
 const [place]=await response.json(),lat=Number(place?.lat),lng=Number(place?.lon);
 if(!place||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)throw Error('Location not found.');
 return {lat,lng};
}

// Search a place anywhere, preferring results near the map the player is looking at.
export async function searchPlace(query,near,signal,fetcher=fetch){
 const params=new URLSearchParams({format:'json',limit:'1',q:query});
 if(near&&[near.west,near.north,near.east,near.south].every(Number.isFinite))params.set('viewbox',[near.west,near.north,near.east,near.south].map(v=>v.toFixed(4)).join(','));
 const response=await fetcher('https://nominatim.openstreetmap.org/search?'+params,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Place search is unavailable. Try a saved court name or use Near me.');
 const places=await response.json(),place=Array.isArray(places)?places[0]:null,lat=Number(place?.lat),lng=Number(place?.lon);
 if(!place||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)throw Error('We couldn’t find that place. Try a city, address, or park name.');
 return {lat,lng,label:shortPlaceName(place.display_name)||query};
}
const shortPlaceName=name=>String(name||'').split(',').map(v=>v.trim()).filter(Boolean).slice(0,2).join(', ');

// Name the player's area ("Chicago, IL"). Coordinates are rounded to about 1 km before they leave the device.
export async function describeArea(lat,lng,signal,fetcher=fetch){
 const params=new URLSearchParams({format:'jsonv2',zoom:'10',addressdetails:'1',lat:lat.toFixed(2),lon:lng.toFixed(2)});
 const response=await fetcher('https://nominatim.openstreetmap.org/reverse?'+params,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Area name unavailable.');
 return areaName((await response.json())?.address);
}
export function areaName(a){
 if(!a||typeof a!=='object')return '';
 const place=a.city||a.town||a.village||a.municipality||a.hamlet||a.suburb||a.county||'';
 const iso=String(a['ISO3166-2-lvl4']||''),us=a.country_code==='us';
 const region=us&&/^US-[A-Z]{2}$/.test(iso)?iso.slice(3):us?a.state:a.country;
 return [...new Set([place,region].filter(Boolean).map(String))].join(', ').slice(0,60);
}

export function areaCourtQuery({south,west,north,east}){
 if(![south,west,north,east].every(Number.isFinite)||south>=north||west>=east||south< -85||north>85||west< -180||east>180||north-south>.6||east-west>.8)throw Error('Zoom in to search this map area.');
 return `[out:json][timeout:15];nwr["sport"~"(^|;)basketball(;|$)"]["access"!="private"](${south},${west},${north},${east});out tags center;`;
}

export function normalizeAreaCourts(elements){
 const found=new Map();
 for(const e of elements){const t=e?.tags||{},p=e?.center||e;if(!e||!['node','way','relation'].includes(e.type)||!Number.isSafeInteger(e.id)||!/(^|;)basketball(;|$)/.test(t.sport||'')||t.access==='private'||!Number.isFinite(p?.lat)||!Number.isFinite(p?.lon)||Math.abs(p.lat)>85||Math.abs(p.lon)>180)continue;
 const id=`osm-${e.type}-${e.id}`;found.set(id,{id,name:String(t.name||'Basketball court'),city:String(t['addr:city']||''),address:[t['addr:housenumber'],t['addr:street'],t['addr:city']].filter(Boolean).join(' ')||'Mapped basketball court · check the map for its location',lat:p.lat,lng:p.lon,description:'Basketball is tagged in OpenStreetMap. Confirm public access, hours, and conditions before you go.',source:'OpenStreetMap',sourceUrl:`https://www.openstreetmap.org/${e.type}/${e.id}`,courtIds:[e.type+'-'+e.id]});
 }
 return [...found.values()];
}

export async function discoverCourtsInBounds(bounds,signal,fetcher=fetch){
 const query=areaCourtQuery(bounds);let lastError;
 for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){
  try{const response=await fetcher(endpoint+'?data='+encodeURIComponent(query),{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});if(!response.ok)throw Error('Court directory unavailable.');const result=await response.json();if(result.remark||!Array.isArray(result.elements))throw Error('Incomplete directory response.');return normalizeAreaCourts(result.elements).filter(c=>c.lat>=bounds.south&&c.lat<=bounds.north&&c.lng>=bounds.west&&c.lng<=bounds.east);}catch(error){if(signal?.aborted)throw error;lastError=error;}
 }
 throw lastError||Error('Court directory unavailable.');
}
