import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getDeviceLocation} from '../public/location.js';
const position={coords:{latitude:40.73,longitude:-73.99,accuracy:30}};
test('uses the device coordinates rather than the Phoenix fallback',async()=>{
 let options;const result=await getDeviceLocation({getCurrentPosition(ok,_fail,o){options=o;ok(position);}});
 assert.equal(result,position);assert.equal(options.maximumAge,0);
});
test('retries unavailable or timed-out GPS with a lower accuracy request',async()=>{
 for(const code of [2,3]){const calls=[];const result=await getDeviceLocation({getCurrentPosition(ok,fail,o){calls.push(o);if(calls.length===1)fail({code});else ok(position);}});assert.equal(result,position);assert.equal(calls.length,2);assert.equal(calls[1].enableHighAccuracy,false);}
});
test('does not retry denied permissions, and preserves fallback failures',async()=>{
 let calls=0;await assert.rejects(getDeviceLocation({getCurrentPosition(_ok,fail){calls++;fail({code:1});}}),e=>e.code===1);assert.equal(calls,1);
 await assert.rejects(getDeviceLocation({getCurrentPosition(_ok,fail){fail({code:3});}}),e=>e.code===3);
});
test('rejects missing location services and invalid coordinates',async()=>{
 await assert.rejects(getDeviceLocation(null),e=>e.code===0);
 await assert.rejects(getDeviceLocation({getCurrentPosition(ok){ok({coords:{latitude:NaN,longitude:0}});}}),e=>e.code===2);
});
