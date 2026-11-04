import {COMMUNITY_APP_URL} from './site-config.js';
const imageryService='https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer';
const imageryAttribution='Esri, Vantor, Earthstar Geographics, and the GIS User Community';
const aerialPhotoCache=new Map(),aerialDateCache=new Map();
const curatedCourtPhotos={
 'phoenix:encantopark':{
  url:'./photos/encanto-courts.jpg',
  sourceUrl:'https://x.com/PhoenixParks/status/1471266331173527555',
  credit:'City of Phoenix Parks and Recreation',
  publishedAt:'2021-12-15',
  alt:'Basketball courts at Encanto Sports Complex in Phoenix, with blue and green playing surfaces, hoops, and light poles.'
 }
};
export function groundPhotoForCourt(court){
 if(court.shared&&court.photoUrl){try{const u=new URL(court.photoUrl);if(u.origin===new URL(COMMUNITY_APP_URL).origin&&/^\/api\/public\/courts\/shared-[a-f0-9-]{36}\/photo$/.test(u.pathname))return {url:u.href,sourceUrl:new URL('../play/?court='+encodeURIComponent(court.id),COMMUNITY_APP_URL).href,credit:'Court contributor',alt:'Photo of '+court.courtName+' inside '+court.parkName+', '+court.city,contributed:true};}catch{}}
 const key=String(court.city||'').toLowerCase()+':'+String(court.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 return curatedCourtPhotos[key]||null;
}
export function courtPhotoBounds(court,widthMeters=180){
 const {lat,lng}=court;
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180||!Number.isFinite(widthMeters)||widthMeters<90||widthMeters>720)throw Error('A valid court location is needed for a photo.');
 const halfLng=widthMeters/(2*111320*Math.cos(lat*Math.PI/180)),halfLat=widthMeters/(3*111320);
 return [lng-halfLng,lat-halfLat,lng+halfLng,lat+halfLat].map(n=>Number(n.toFixed(7)));
}
export function courtImageryUrl(court,widthMeters=180){
 const params=new URLSearchParams({bbox:courtPhotoBounds(court,widthMeters).join(','),bboxSR:'4326',imageSR:'3857',size:'600,400',format:'jpg',f:'json'});
 return imageryService+'/export?'+params;
}
function photoSignal(signal){return signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);}
function boundedPhotoCache(cache,key,value){if(cache.size>=80)cache.delete(cache.keys().next().value);cache.set(key,value);}
export async function fetchCourtAerial(court,widthMeters=180,{signal,fetcher=fetch,force=false}={}){
 const url=courtImageryUrl(court,widthMeters),cached=aerialPhotoCache.get(url);
 if(!force&&cached&&Date.now()-cached.checkedAt<300000)return cached.photo;
 const response=await fetcher(url,{signal:photoSignal(signal)});
 if(!response.ok)throw Error('Aerial photo unavailable.');
 const data=await response.json();
 if(data.error||!data.href)throw Error('Aerial photo unavailable.');
 const imageUrl=new URL(data.href);
 if(imageUrl.origin!==new URL(imageryService).origin||!imageUrl.pathname.startsWith('/arcgis/rest/directories/arcgisoutput/World_Imagery_MapServer/')||!/[.](jpg|jpeg|png)$/i.test(imageUrl.pathname))throw Error('Unexpected photo source.');
 const photo={url:imageUrl.href,sourceUrl:imageryService,credit:imageryAttribution};
 boundedPhotoCache(aerialPhotoCache,url,{checkedAt:Date.now(),photo});
 return photo;
}
export function parseImageryDate(data){
 const records=(Array.isArray(data.results)?data.results:[]).map(r=>r.attributes).filter(Boolean).sort((a,b)=>(Number(a['RESOLUTION (M)'])||Infinity)-(Number(b['RESOLUTION (M)'])||Infinity));
 for(const a of records){
  const raw=String(a['DATE (YYYYMMDD)']||'');if(!/^\d{8}$/.test(raw))continue;
  const iso=raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8),date=new Date(iso+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)continue;
  return {capturedAt:iso,provider:String(a.SOURCE||a.SOURCE_INFO||'Esri').slice(0,100)};
 }
 return {capturedAt:null,provider:'Esri'};
}
export async function fetchCourtImageryDate(court,widthMeters=180,{signal,fetcher=fetch}={}){
 const bounds=courtPhotoBounds(court,widthMeters),key=[court.lat,court.lng].join(',');
 if(aerialDateCache.has(key))return aerialDateCache.get(key);
 const params=new URLSearchParams({f:'json',geometry:key.split(',').reverse().join(','),geometryType:'esriGeometryPoint',sr:'4326',tolerance:'1',mapExtent:bounds.join(','),imageDisplay:'600,400,96',returnGeometry:'false'});
 const response=await fetcher(imageryService+'/identify?'+params,{signal:photoSignal(signal)});
 if(!response.ok)throw Error('Imagery date unavailable.');
 const result=parseImageryDate(await response.json());boundedPhotoCache(aerialDateCache,key,result);return result;
}
function courtPhotoDate(iso){return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(iso+'T00:00:00Z'));}
export function mountCourtMedia(container,court,{fetcher=fetch}={}){
 const ground=groundPhotoForCourt(court);
 let view=court.shared&&ground?'ground':'aerial',span=court.locationType==='park record'?420:180,ticket=0,controller=null,disposed=false,imageTimer=null;
 container.innerHTML='<div class="court-photo-tabs" role="group" aria-label="Court photo view"><button type="button" data-photo-view="aerial" aria-pressed="true">Aerial view</button><button type="button" data-photo-view="ground" aria-pressed="false" hidden>Court photo</button></div><figure class="court-photo"><div class="court-photo-frame"><p class="court-photo-loading" role="status">Loading court photo…</p><a class="court-photo-link" target="_blank" rel="noopener noreferrer" hidden></a><div class="court-photo-error" role="status" hidden><strong>Photo unavailable right now</strong><p>Try again or explore photos and Street View on Maps.</p><button type="button" class="secondary" data-retry-photo>Retry photo</button></div><div class="court-photo-zoom" role="group" aria-label="Aerial photo zoom"><button type="button" data-photo-closer aria-label="Zoom in on the court photo">+</button><button type="button" data-photo-wider aria-label="Show more of the park">−</button></div></div><figcaption><strong class="court-photo-name"></strong><span class="court-photo-date">Photo date unavailable</span><a class="court-photo-credit" target="_blank" rel="noopener noreferrer"></a><a class="court-photo-maps" target="_blank" rel="noopener noreferrer">Photos & Street View on Maps ↗</a></figcaption></figure>';
 const find=s=>container.querySelector(s),frame=find('.court-photo-frame'),imageLink=find('.court-photo-link'),loading=find('.court-photo-loading'),error=find('.court-photo-error'),caption=find('.court-photo-name'),date=find('.court-photo-date'),credit=find('.court-photo-credit');
 container.dataset.courtId=court.id;
 find('[data-photo-view="ground"]').hidden=!ground;
 const mapsQuery=court.name&&court.name!=='Basketball court'?court.name+', '+(court.city||'Arizona')+' near '+court.lat+','+court.lng:court.lat+','+court.lng;
 find('.court-photo-maps').href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(mapsQuery);
 const active=id=>!disposed&&id===ticket&&container.isConnected;
 function fail(id){if(!active(id))return;clearTimeout(imageTimer);loading.hidden=true;imageLink.hidden=true;error.hidden=false;frame.dataset.loading='false';}
 function displayImage(photo,id){
  if(!active(id))return;
  const img=document.createElement('img');img.decoding='async';img.width=600;img.height=400;
  img.alt=view==='ground'?ground.alt:'Aerial photograph centered on the mapped '+(court.locationType==='mapped basketball court'?'basketball court':'park location')+' at '+court.name+(court.city?', '+court.city:'');
  img.onload=()=>{if(!active(id))return;clearTimeout(imageTimer);loading.hidden=true;error.hidden=true;imageLink.hidden=false;frame.dataset.loading='false';};
  img.onerror=()=>fail(id);
  imageLink.replaceChildren(img);imageLink.href=photo.url;imageLink.setAttribute('aria-label','Open a larger photo of '+court.name);
  credit.textContent='Image: '+photo.credit+' ↗';credit.href=photo.sourceUrl;
  imageTimer=setTimeout(()=>fail(id),20000);img.src=photo.url;
 }
 async function load(next=view,force=false){
  view=next;controller?.abort();controller=new AbortController();const id=++ticket;clearTimeout(imageTimer);
  loading.hidden=false;loading.textContent='Loading a photo of '+court.name+'…';error.hidden=true;imageLink.hidden=true;frame.dataset.loading='true';
  for(const b of container.querySelectorAll('[data-photo-view]'))b.setAttribute('aria-pressed',String(b.dataset.photoView===view));
  find('.court-photo-zoom').hidden=view!=='aerial';find('[data-photo-closer]').disabled=span<=90;find('[data-photo-wider]').disabled=span>=720;
  if(view==='ground'&&ground){
   caption.textContent='Basketball courts at '+court.name;
   date.textContent=ground.contributed?'Photo supplied by a player · capture date unknown':'Source published '+courtPhotoDate(ground.publishedAt)+' · capture date not provided';displayImage(ground,id);return;
  }
  caption.textContent=court.name+' · aerial view';date.textContent='Capture date unavailable';
  credit.textContent='Imagery: '+imageryAttribution+' ↗';credit.href=imageryService;
  fetchCourtImageryDate(court,span,{signal:controller.signal,fetcher}).then(meta=>{
   if(active(id))date.textContent=meta.capturedAt?'Imagery captured '+courtPhotoDate(meta.capturedAt)+' · '+meta.provider:'Capture date unavailable';
  }).catch(()=>{});
  try{displayImage(await fetchCourtAerial(court,span,{signal:controller.signal,fetcher,force}),id);}catch{fail(id);}
 }
 for(const b of container.querySelectorAll('[data-photo-view]'))b.onclick=()=>load(b.dataset.photoView);
 find('[data-photo-closer]').onclick=()=>{span=Math.max(90,span/2);load('aerial');};
 find('[data-photo-wider]').onclick=()=>{span=Math.min(720,span*2);load('aerial');};
 find('[data-retry-photo]').onclick=()=>load(view,true);
 load();
 return ()=>{disposed=true;++ticket;controller?.abort();clearTimeout(imageTimer);};
}

// A compact version of the same verified photo sources for the game-plan hero.
export function mountCourtHero(container,court,{creditElement,dateElement,onOpen,fetcher=fetch}={}){
 let disposed=false;const controller=new AbortController(),ground=groundPhotoForCourt(court);
 container.dataset.courtId=court.id;
 container.innerHTML='<button type="button" class="plan-photo-view"><span class="plan-photo-status" role="status">Loading court photo…</span></button>';
 const button=container.querySelector('button'),status=container.querySelector('.plan-photo-status');
 button.setAttribute('aria-label','View photos and court details for '+court.name);button.onclick=onOpen;
 const active=()=>!disposed&&container.isConnected;
 function paint(photo,isGround){
  if(!active())return;
  const img=document.createElement('img');img.alt=isGround?photo.alt:'Aerial photograph of the mapped court location at '+court.name;img.decoding='async';img.width=600;img.height=400;
  img.onload=()=>{if(active()){status.hidden=true;container.dataset.loaded='true';}};
  img.onerror=()=>{if(!active())return;if(isGround)loadAerial();else{img.remove();status.hidden=false;status.textContent='Photo unavailable · View court details';}};
  button.querySelector('img')?.remove();button.append(img);img.src=photo.url;
  if(creditElement){creditElement.href=photo.sourceUrl;creditElement.textContent=isGround?'Photo: City of Phoenix':'Imagery: Esri';}
  if(dateElement){dateElement.textContent=isGround?'Published '+photo.publishedAt.slice(0,4):'Capture date unavailable';dateElement.title=isGround?'Source published '+courtPhotoDate(photo.publishedAt)+'; capture date was not provided.':'';}
 }
 async function loadAerial(){
  if(!active())return;
  status.hidden=false;status.textContent='Loading court photo…';
  try{paint(await fetchCourtAerial(court,court.locationType==='park record'?420:180,{signal:controller.signal,fetcher}),false);}catch{if(active())status.textContent='Photo unavailable · View court details';}
  fetchCourtImageryDate(court,180,{signal:controller.signal,fetcher}).then(meta=>{if(active()&&dateElement)dateElement.textContent=meta.capturedAt?'Captured '+courtPhotoDate(meta.capturedAt):'Capture date unavailable';}).catch(()=>{});
 }
 if(ground)paint(ground,true);else loadAerial();
 return ()=>{disposed=true;controller.abort();};
}
