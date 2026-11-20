import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeParkDirectory,parkQuery,discoverBasketballParks} from '../public/directory.js';import {createShowcase} from '../public/demo.js';import {validStatEntry} from '../public/domain.js';
const elements=[{type:'way',id:1,center:{lat:33.48,lon:-112},tags:{leisure:'park',name:'Basketball Park'}},{type:'way',id:2,center:{lat:33.481,lon:-112},tags:{leisure:'pitch',sport:'basketball'}},{type:'way',id:3,center:{lat:34,lon:-112},tags:{leisure:'park',name:'Tennis Only'}},{type:'way',id:4,center:{lat:34,lon:-112},tags:{sport:'tennis'}}];
test('directory includes basketball parks even without app games and excludes parks without basketball tags',()=>{const parks=normalizeParkDirectory(elements,'Phoenix');assert.equal(parks.length,1);assert.equal(parks[0].name,'Basketball Park');assert.equal(parks[0].courtIds.length,1);assert.equal(parks[0].lat,33.481);assert.match(parkQuery(33,-112),/map_to_area/);assert.throws(()=>parkQuery(NaN,-112));});
test('directory rejects incomplete queries instead of presenting partial data as complete',async()=>{await assert.rejects(discoverBasketballParks('Phoenix',undefined,async()=>({ok:true,json:async()=>({remark:'timeout',elements})})),/incomplete/);const result=await discoverBasketballParks('Phoenix',undefined,async()=>({ok:true,json:async()=>({elements})}));assert.equal(result.parks.length,1);});
test('90-day showcase has coherent completed sessions, stats, teams, groups, and fictional labels',()=>{const now=new Date('2026-10-24T12:00:00'),s=createShowcase(now);assert.equal(s.stats.length,24);assert.equal(s.custom.length,24);assert.equal(s.groups.length,3);assert.equal(s.showcase,true);for(const e of s.stats){assert.equal(validStatEntry(e,'2026-10-24'),true);assert.ok(s.custom.some(g=>g.id===e.gameId));}assert.ok(s.stats.at(-1).points>s.stats[0].points);assert.equal(createShowcase(now).profile.shareStats,true);});

test('map-area lookup uses viewport bounds, validates area, and excludes private/non-basketball entries',async()=>{
 const {areaCourtQuery,normalizeAreaCourts,discoverCourtsInBounds,locateDestination}=await import('../public/directory.js');
 const bounds={south:40.70,west:-74.02,north:40.76,east:-73.96};assert.match(areaCourtQuery(bounds),/40.7,-74.02,40.76,-73.96/);assert.throws(()=>areaCourtQuery({...bounds,north:42}));assert.throws(()=>areaCourtQuery({...bounds,west:NaN}));
 const raw=[{type:'way',id:1,center:{lat:40.73,lon:-73.99},tags:{sport:'basketball',name:'Court'}},{type:'node',id:2,lat:40.73,lon:-73.99,tags:{sport:'basketball',access:'private'}},{type:'node',id:3,lat:40.73,lon:-73.99,tags:{sport:'tennis'}},{type:'node',id:4,lat:33,lon:-112,tags:{sport:'basketball'}}];
 assert.equal(normalizeAreaCourts(raw).length,2);let request='';const courts=await discoverCourtsInBounds(bounds,undefined,async url=>{request=decodeURIComponent(url);return {ok:true,json:async()=>({elements:raw})};});assert.equal(courts.length,1);assert.match(request,/40.7,-74.02,40.76,-73.96/);await assert.rejects(discoverCourtsInBounds(bounds,undefined,async()=>({ok:true,json:async()=>({remark:'timeout',elements:raw})})),/Incomplete/);
 assert.deepEqual(await locateDestination('Somewhere',undefined,async()=>({ok:true,json:async()=>[{lat:'40.73',lon:'-73.99'}]})),{lat:40.73,lng:-73.99});await assert.rejects(locateDestination('missing',undefined,async()=>({ok:true,json:async()=>[]})),/not found/);
});

test('areas are named wherever the player is, with US state codes and country names elsewhere',async()=>{
 const {areaName}=await import('../public/directory.js');
 assert.equal(areaName({city:'Chicago',state:'Illinois','ISO3166-2-lvl4':'US-IL',country_code:'us'}),'Chicago, IL');
 assert.equal(areaName({town:'Flagstaff',state:'Arizona','ISO3166-2-lvl4':'US-AZ',country_code:'us'}),'Flagstaff, AZ');
 assert.equal(areaName({city:'London',country:'United Kingdom',country_code:'gb'}),'London, United Kingdom');
 assert.equal(areaName({county:'Coconino County',state:'Arizona',country_code:'us'}),'Coconino County, Arizona');
 assert.equal(areaName(null),'');assert.equal(areaName({}),'');
});
test('area naming rounds coordinates to about 1 km before they leave the device',async()=>{
 const {describeArea}=await import('../public/directory.js');let requested;
 const name=await describeArea(41.878113,-87.629799,undefined,async url=>{requested=new URL(url);return {ok:true,json:async()=>({address:{city:'Chicago','ISO3166-2-lvl4':'US-IL',country_code:'us'}})};});
 assert.equal(name,'Chicago, IL');assert.equal(requested.searchParams.get('lat'),'41.88');assert.equal(requested.searchParams.get('lon'),'-87.63');
});
test('place search works anywhere and prefers results near the visible map',async()=>{
 const {searchPlace}=await import('../public/directory.js');let requested;
 const place=await searchPlace('Lincoln Park',{west:-87.9,north:42.1,east:-87.5,south:41.7},undefined,async url=>{requested=new URL(url);return {ok:true,json:async()=>[{lat:'41.92',lon:'-87.63',display_name:'Lincoln Park, Chicago, Cook County, Illinois, United States'}]};});
 assert.deepEqual(place,{lat:41.92,lng:-87.63,label:'Lincoln Park, Chicago'});assert.equal(requested.searchParams.get('viewbox'),'-87.9000,42.1000,-87.5000,41.7000');assert.equal(requested.searchParams.get('bounded'),null,'a preference, not a limit');
 await assert.rejects(searchPlace('Nowhere',null,undefined,async()=>({ok:true,json:async()=>[]})),/couldn’t find/);
});
test('live court lookup is a plain map-area query with no state restriction',async()=>{
 const {areaCourtQuery}=await import('../public/directory.js');
 assert.doesNotMatch(areaCourtQuery({south:41.8,west:-87.7,north:41.9,east:-87.6}),/US-AZ|area\[/);
});
