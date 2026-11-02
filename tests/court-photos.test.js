import {test} from 'node:test';
import assert from 'node:assert/strict';
import {courtPhotoBounds,courtImageryUrl,groundPhotoForCourt,fetchCourtAerial,parseImageryDate,fetchCourtImageryDate} from '../public/court-photos.js';
const pierce={id:'pierce',name:'Pierce Park',city:'Phoenix',lat:33.47028247951755,lng:-111.98406982543241};
test('aerial bounds are centered on the specific court and wider views preserve that center',()=>{
 const b=courtPhotoBounds(pierce),wide=courtPhotoBounds(pierce,360);assert.ok(Math.abs((b[0]+b[2])/2-pierce.lng)<1e-7);assert.ok(Math.abs((b[1]+b[3])/2-pierce.lat)<1e-7);assert.ok(wide[2]-wide[0]>b[2]-b[0]);
 assert.throws(()=>courtPhotoBounds({...pierce,lat:NaN}));assert.throws(()=>courtPhotoBounds(pierce,10000));
 const u=new URL(courtImageryUrl(pierce));assert.equal(u.searchParams.get('bboxSR'),'4326');assert.equal(u.searchParams.get('size'),'600,400');
});
test('curated ground photos match both park name and city',()=>{
 assert.equal(groundPhotoForCourt({name:'Encanto Park',city:'Phoenix'}).publishedAt,'2021-12-15');assert.equal(groundPhotoForCourt({name:'Encanto Park',city:'Tucson'}),null);assert.equal(groundPhotoForCourt(pierce),null);
});
test('aerial photos use a validated source response rather than a generic image',async()=>{
 const photo=await fetchCourtAerial(pierce,180,{force:true,fetcher:async url=>{assert.match(decodeURIComponent(url),/-111.98/);return {ok:true,json:async()=>({href:'https://services.arcgisonline.com/arcgis/rest/directories/arcgisoutput/World_Imagery_MapServer/test-pierce.jpg'})};}});
 assert.match(photo.url,/test-pierce/);assert.match(photo.credit,/Esri/);
 await assert.rejects(fetchCourtAerial(pierce,180,{force:true,fetcher:async()=>({ok:true,json:async()=>({href:'https://unrelated.example/random-park.jpg'})})}),/Unexpected/);
 await assert.rejects(fetchCourtAerial(pierce,180,{force:true,fetcher:async()=>({ok:false})}),/unavailable/);
});
test('imagery dates choose detailed source records and reject invalid or missing dates',()=>{
 const data={results:[{attributes:{'RESOLUTION (M)':'15','DATE (YYYYMMDD)':'20100101',SOURCE:'Coarse source'}},{attributes:{'RESOLUTION (M)':'0.5','DATE (YYYYMMDD)':'20260507',SOURCE:'Vantor'}}]};
 assert.deepEqual(parseImageryDate(data),{capturedAt:'2026-05-07',provider:'Vantor'});assert.equal(parseImageryDate({results:[{attributes:{'DATE (YYYYMMDD)':'20260230'}}]}).capturedAt,null);assert.equal(parseImageryDate({}).capturedAt,null);
});
test('photo-date lookup uses the same court coordinates and does not invent a current date',async()=>{
 let request;const c={...pierce,lat:33.47206073177998,lng:-112.090904559299};
 const result=await fetchCourtImageryDate(c,180,{fetcher:async url=>{request=new URL(url);return {ok:true,json:async()=>({results:[]})};}});
 assert.equal(request.searchParams.get('geometry'),c.lng+','+c.lat);assert.equal(result.capturedAt,null);
});
