import test from 'node:test';import assert from 'node:assert/strict';
import {buildLocations,directoryCourt,tileKey,loadDirectoryCourts} from '../public/us-courts.js';

const park={type:'way',id:10,tags:{leisure:'park',name:'Piedmont Park','addr:street':'Piedmont Ave NE','addr:housenumber':'400','addr:city':'Atlanta',website:'https://piedmontpark.org'},bounds:{minlat:33.780,minlon:-84.380,maxlat:33.790,maxlon:-84.370}};
const school={type:'way',id:11,tags:{amenity:'school',name:'Grady High School'},bounds:{minlat:33.7800,minlon:-84.3760,maxlat:33.7830,maxlon:-84.3740}};
const hugePark={type:'relation',id:12,tags:{leisure:'park',name:'Chattahoochee National Recreation Area'},bounds:{minlat:33.5,minlon:-84.6,maxlat:34.1,maxlon:-84.1}};
const towns=[{type:'node',id:20,lat:33.749,lon:-84.388,tags:{place:'city',name:'Atlanta'}},{type:'node',id:21,lat:33.774,lon:-84.296,tags:{place:'city',name:'Decatur'}}];
const court=(id,lat,lon,tags={})=>({type:'way',id,center:{lat,lon},tags:{leisure:'pitch',sport:'basketball',...tags}});

test('courts are grouped by the park they are in, with the park’s name, address, website and court facts',()=>{
 const out=buildLocations({courts:[court(1,33.785,-84.375,{lit:'yes',hoops:'2',surface:'asphalt'}),court(2,33.7852,-84.3752,{hoops:'2',fee:'no'})],containers:[park,hugePark],towns},'GA');
 assert.equal(out.length,1);const [loc]=out;
 assert.deepEqual({i:loc.i,n:loc.n,k:loc.k,a:loc.a,c:loc.c,s:loc.s,ct:loc.ct,u:loc.u,h:loc.h},{i:'ga-pw10',n:'Piedmont Park',k:'park',a:'400 Piedmont Ave NE',c:'Atlanta',s:'GA',ct:2,u:'https://piedmontpark.org',h:'w10'});
 assert.deepEqual(loc.f,['2 mapped courts','Lights','4 hoops','Surface: asphalt','Outdoor','Free to use']);
});
test('the smallest enclosing place wins, school courts are flagged, and huge areas are ignored',()=>{
 const out=buildLocations({courts:[court(3,33.781,-84.375)],containers:[park,school,hugePark],towns},'GA');
 assert.equal(out[0].n,'Grady High School');assert.equal(out[0].k,'school');assert.ok(out[0].f.includes('School grounds · public access not confirmed'));
 const loose=buildLocations({courts:[court(4,33.70,-84.50)],containers:[hugePark],towns},'GA');assert.equal(loose[0].k,'court');assert.equal(loose[0].n,'Basketball court');
});
test('loose courts near each other merge; private, members-only, disused and shop features are dropped; city comes from the nearest town',()=>{
 const out=buildLocations({courts:[court(5,33.7745,-84.2965,{name:'Oakhurst courts'}),court(6,33.7746,-84.2966),court(7,33.70,-84.40,{access:'private'}),court(8,33.71,-84.40,{access:'members'}),court(9,33.72,-84.40,{disused:'yes'}),{type:'node',id:30,lat:33.73,lon:-84.40,tags:{shop:'sports',sport:'basketball'}},court(5,33.7745,-84.2965)],containers:[],towns},'GA');
 assert.equal(out.length,1);assert.equal(out[0].n,'Oakhurst courts');assert.equal(out[0].ct,2);assert.equal(out[0].c,'Decatur');
});
test('tile records become map courts with OpenStreetMap links, and bad records are rejected',()=>{
 const c=directoryCourt({i:'ga-pw10',n:'Piedmont Park',k:'park',a:'400 Piedmont Ave NE',c:'Atlanta',s:'GA',la:33.785,lo:-84.375,ct:2,f:['Lights'],o:'w1',h:'w10',u:'javascript:alert(1)'});
 assert.equal(c.id,'us-ga-pw10');assert.equal(c.address,'400 Piedmont Ave NE, Atlanta, GA');assert.equal(c.sourceUrl,'https://www.openstreetmap.org/way/1');assert.equal(c.hostUrl,'https://www.openstreetmap.org/way/10');assert.equal(c.website,null);assert.equal(c.courtIds.length,2);
 assert.equal(directoryCourt({i:'x',la:'33'}),null);
 assert.equal(tileKey(33.785,-84.375),'33.5_-84.5');assert.equal(tileKey(40.0,-74.0),'40.0_-74.0');assert.equal(tileKey(-0.1,0.1),'-0.5_0.0');
});
test('the app loads only the published tiles that cover the visible map',async()=>{
 const requested=[];const files={'index.json':{tiles:{'33.5_-84.5':1,'40.5_-74.0':1}},'33.5_-84.5.json':[{i:'ga-pw10',n:'Piedmont Park',la:33.785,lo:-84.375,ct:1,o:'w1'}]};
 const fetcher=async url=>{const name=String(url).split('/data/us/')[1];requested.push(name);return files[name]?{ok:true,json:async()=>files[name]}:{ok:false};};
 const {courts,covered}=await loadDirectoryCourts({south:33.70,west:-84.45,north:33.82,east:-84.30},{base:'https://example.test/bucketlist/',fetcher});
 assert.deepEqual(courts.map(c=>c.name),['Piedmont Park']);assert.equal(covered,true);assert.deepEqual(requested,['index.json','33.5_-84.5.json'],'no requests for tiles that do not exist');
 await loadDirectoryCourts({south:33.70,west:-84.45,north:33.82,east:-84.30},{base:'https://example.test/bucketlist/',fetcher});assert.equal(requested.length,2,'tiles are cached');
 await assert.rejects(loadDirectoryCourts({south:25,west:-100,north:45,east:-70},{base:'https://example.test/bucketlist/',fetcher}),/Zoom in/);assert.equal(requested.length,2,'no downloads for a zoomed-out view');
 files['40.5_-74.0.json']=[{i:'ny-pw1',n:'Rucker Park',la:40.83,lo:-73.94,ct:1,o:'w2'}];const both=await loadDirectoryCourts({south:33.70,west:-84.45,north:40.9,east:-73.9},{base:'https://example.test/bucketlist/',fetcher}).catch(e=>e);assert.match(String(both.message||''),/Zoom in/);
 const ny=await loadDirectoryCourts({south:40.8,west:-73.96,north:40.85,east:-73.92},{base:'https://example.test/bucketlist/',fetcher});assert.deepEqual(ny.courts.map(c=>c.name),['Rucker Park']);
 const abroad=await loadDirectoryCourts({south:51.4,west:-0.3,north:51.6,east:-0.1},{base:'https://example.test/bucketlist/',fetcher});assert.deepEqual(abroad,{courts:[],covered:false,checkedAt:null},'outside the directory the app falls back to live lookups');
});
