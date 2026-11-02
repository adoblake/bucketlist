import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectPlanGame,gamePlanTiming,gamePlanToday} from '../public/game-plan.js';
const courts=[{id:'pierce',lat:33.4703,lng:-111.9841},{id:'encanto',lat:33.4721,lng:-112.0909},{id:'tucson',lat:32.2226,lng:-110.9747},{id:'austin',lat:30.282,lng:-97.719}];
const now=new Date('2026-11-02T02:00:00Z'),area={lat:33.47,lng:-112};
const game=(id,courtId,startsAt='2026-11-03T01:00:00Z',extra={})=>({id,courtId,startsAt,capacity:10,players:['a','b'],...extra});
test('next run prioritizes future games, available roster spots, and Arizona scope',()=>{
 const all=[game('old','pierce','2020-01-01T00:00:00Z'),game('cancelled','pierce',undefined,{cancelled:true}),game('full','pierce',undefined,{capacity:2}),game('texas','austin'),game('next','encanto')];
 assert.equal(selectPlanGame({games:all,courts,area,now}).id,'next');
});
test('a player can still open their own joined game even when full or farther away',()=>{
 const g=game('joined','tucson',undefined,{capacity:2});assert.equal(selectPlanGame({games:[game('nearby','pierce'),g],courts,joined:['joined'],area,now}).id,'joined');
});
test('photo preference only breaks a time tie and never displaces an earlier game',()=>{
 const same=[game('pierce','pierce'),game('encanto','encanto')];assert.equal(selectPlanGame({games:same,courts,area,now,hasPhoto:c=>c.id==='encanto'}).id,'encanto');
 assert.equal(selectPlanGame({games:[...same,game('early','pierce','2026-11-02T23:00:00Z')],courts,area,now,hasPhoto:c=>c.id==='encanto'}).id,'early');
});
test('an Arizona area with no available games gets an empty state rather than distant sample games',()=>{
 assert.equal(selectPlanGame({games:[game('phoenix','pierce'),game('texas','austin')],courts,area:{lat:32.2226,lng:-110.9747},now}),null);
});
test('Arizona calendar dates are correct when UTC is already on the following day',()=>{
 assert.equal(gamePlanToday(now),'Sun, Nov 1');const t=gamePlanTiming('2026-11-03T01:00:00Z',now);assert.equal(t.relative,'Tomorrow');assert.equal(t.date,'Mon, Nov 2');assert.equal(t.time,'6:00 PM');
});
test('stored timezone errors and missing dates do not break the dashboard',()=>{
 assert.equal(gamePlanTiming('2026-11-03T01:00:00Z',now,'invalid/time-zone').time,'6:00 PM');assert.equal(gamePlanTiming('bad date',now).relative,'Date unavailable');
});
