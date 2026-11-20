import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {dayKey,localDay,moveDay,proposedSlots,validSchedule} from '../public/schedule.js';
test('calendar navigation preserves dates through month, year, and leap boundaries',()=>{assert.equal(moveDay('2026-12-31',1),'2027-01-01');assert.equal(moveDay('2028-02-28',1),'2028-02-29');assert.equal(moveDay('2026-02-28',1),'2026-03-01');assert.equal(localDay('2026-02-30'),null);assert.throws(()=>moveDay('invalid',1));});
test('time ranges advance by 30 minutes, carry duration, exclude past starts and late endings',()=>{const now=new Date(2026,9,24,12,31),slots=proposedSlots('2026-10-24',60,now);assert.equal(slots[0].label,'1:00 PM – 2:00 PM');assert.equal(slots[0].group,'Afternoon');assert.equal(new Date(slots[1].startsAt)-new Date(slots[0].startsAt),1800000);for(const s of slots){assert.equal(validSchedule(s.startsAt,s.endsAt,60,now),true);assert.equal(new Date(s.endsAt).getHours()<=23,true);}assert.equal(proposedSlots('2026-10-24',120,new Date(2026,9,24,22)).length,0);assert.equal(proposedSlots('2026-10-23',60,now).length,0);assert.equal(proposedSlots('bad',60,now).length,0);assert.equal(proposedSlots('2026-10-24',45,now).length,0);});
test('expired selections and mismatched duration cannot be committed',()=>{const a='2026-10-24T13:00:00Z',b='2026-10-24T14:00:00Z';assert.equal(validSchedule(a,b,60,new Date(a)),false);assert.equal(validSchedule(a,b,90,new Date('2026-10-23')),false);assert.equal(validSchedule('bad',b,60),false);});
test('local calendar and time ranges handle DST without shifting the selected day',()=>{const source=`import {moveDay,proposedSlots,dayKey} from './public/schedule.js';const slots=proposedSlots('2027-03-14',90,new Date('2027-03-01T00:00:00Z'));if(moveDay('2027-03-13',1)!=='2027-03-14'||!slots.length||slots.some(s=>dayKey(s.startsAt)!=='2027-03-14'||new Date(s.endsAt)-new Date(s.startsAt)!==5400000))process.exit(1);`;execFileSync(process.execPath,['--input-type=module','-e',source],{env:{...process.env,TZ:'America/New_York'},cwd:process.cwd()});});

test('a court’s local game time converts to the right instant in any zone, including across DST',async()=>{
 const {wallClockToUtc,wallClockNow}=await import('../public/schedule.js');
 assert.equal(wallClockToUtc('2026-11-21T18:00','America/Phoenix').toISOString(),'2026-11-22T01:00:00.000Z');
 assert.equal(wallClockToUtc('2026-11-21T18:00','America/Chicago').toISOString(),'2026-11-22T00:00:00.000Z');
 assert.equal(wallClockToUtc('2026-07-04T18:00','America/Chicago').toISOString(),'2026-07-04T23:00:00.000Z');
 assert.equal(wallClockToUtc('2026-11-21T18:00','Europe/London').toISOString(),'2026-11-21T18:00:00.000Z');
 assert.equal(wallClockToUtc('2026-11-21T18:00','Asia/Tokyo').toISOString(),'2026-11-21T09:00:00.000Z');
 assert.equal(wallClockToUtc('2026-11-01T01:30','America/New_York').toISOString(),'2026-11-01T05:30:00.000Z','repeated hour resolves to the first one');
 assert.equal(wallClockToUtc('2026-03-08T02:30','America/New_York').toISOString(),'2026-03-08T07:30:00.000Z','skipped hour moves forward');
 assert.equal(wallClockToUtc('not a time','America/Chicago'),null);assert.equal(wallClockToUtc('2026-11-21T18:00','Not/AZone'),null);
 assert.equal(wallClockNow('Asia/Tokyo',new Date('2026-11-21T09:05:00Z')),'2026-11-21T18:05');
});
