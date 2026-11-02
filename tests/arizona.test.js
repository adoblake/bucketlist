import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isInArizona} from '../public/arizona.js';
import {locateArizonaDestination, discoverCourtsInBounds} from '../public/directory.js';

test('Arizona scope includes cities statewide and excludes neighboring states inside its bounding box',()=>{
 for(const [lat,lng] of [[33.4484,-112.074],[32.2226,-110.9747],[35.1983,-111.6513],[32.6927,-114.6277],[35.1359,-114.5286]])assert.equal(isInArizona(lat,lng),true);
 for(const [lat,lng] of [[35.1678,-114.573],[33.6103,-114.5964],[30.2672,-97.7431],[NaN,-112]])assert.equal(isInArizona(lat,lng),false);
});

test('destination lookup limits the provider to Arizona and rejects out-of-state results',async()=>{
 let request;
 const place=await locateArizonaDestination('Tucson',undefined,async url=>{
  request=new URL(url);return {ok:true,json:async()=>[{lat:'40.73',lon:'-73.99'},{lat:'32.2226',lon:'-110.9747'}]};
 });
 assert.equal(request.searchParams.get('bounded'),'1');assert.equal(request.searchParams.get('countrycodes'),'us');assert.match(request.searchParams.get('q'),/Tucson, Arizona/);
 assert.deepEqual(place,{lat:32.2226,lng:-110.9747});
 await assert.rejects(locateArizonaDestination('Austin',undefined,async()=>({ok:true,json:async()=>[{lat:'30.2672',lon:'-97.7431'}]})),/Arizona/);
});

test('Arizona court lookup filters both the provider query and cross-border results',async()=>{
 let request;
 const bounds={south:33.5,west:-114.7,north:33.8,east:-114.1};
 const raw=[{type:'way',id:1,center:{lat:33.6103,lon:-114.5964},tags:{sport:'basketball'}},{type:'way',id:2,center:{lat:33.61,lon:-114.3},tags:{sport:'basketball'}}];
 const result=await discoverCourtsInBounds(bounds,undefined,async url=>{request=decodeURIComponent(url);return {ok:true,json:async()=>({elements:raw})};},true);
 assert.match(request,/US-AZ/);assert.match(request,/nwr\(area.az\)/);assert.deepEqual(result.map(c=>c.id),['osm-way-2']);
});
