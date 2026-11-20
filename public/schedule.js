export function dayKey(value=new Date()) {
 const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function localDay(key) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return null;
 const [y,m,d]=key.split('-').map(Number),value=new Date(y,m-1,d,12);
 return dayKey(value)===key?value:null;
}
export function moveDay(key,offset) {const d=localDay(key);if(!d)throw Error('Invalid calendar date');d.setDate(d.getDate()+offset);return dayKey(d);}
export function timeLabel(value) {return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(value));}
export function proposedSlots(date,duration=60,now=new Date()) {
 const d=localDay(date);if(!d||![30,60,90,120].includes(duration))return [];
 const slots=[];
 for(let minute=360;minute+duration<=1380;minute+=30){
  const start=new Date(d.getFullYear(),d.getMonth(),d.getDate(),Math.floor(minute/60),minute%60);
  if(start.getHours()!==Math.floor(minute/60)||start.getMinutes()!==minute%60||start<=now)continue;
  const end=new Date(start.getTime()+duration*60000);
  if(dayKey(end)!==date||end.getHours()*60+end.getMinutes()>1380)continue;
  slots.push({startsAt:start.toISOString(),endsAt:end.toISOString(),duration,group:minute<720?'Morning':minute<1020?'Afternoon':'Evening',label:`${timeLabel(start)} – ${timeLabel(end)}`});
 }
 return slots;
}
export function validSchedule(start,end,duration,now=new Date()) {
 const a=new Date(start),b=new Date(end);
 return Number.isFinite(a.getTime())&&Number.isFinite(b.getTime())&&a>now&&[30,60,90,120].includes(duration)&&b-a===duration*60000;
}
export function mountTimePicker(root,{value=null,onConfirm,onCancel,clock=()=>new Date()}) {
 const earliest=dayKey(clock()),latest=moveDay(earliest,180),zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'device local time';
 let chosenDay=value?.startsAt?dayKey(value.startsAt):earliest;if(chosenDay<earliest||chosenDay>latest)chosenDay=earliest;
 let weekStart=moveDay(earliest,Math.floor((Date.parse(chosenDay+'T12:00:00Z')-Date.parse(earliest+'T12:00:00Z'))/86400000/7)*7),duration=value?.duration||60,selected=value?.startsAt||null,activeGroup=value?.startsAt?(new Date(value.startsAt).getHours()<12?'Morning':new Date(value.startsAt).getHours()<17?'Afternoon':'Evening'):'Afternoon';
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function draw(focusSelector){
  const slots=proposedSlots(chosenDay,duration,clock());if(!slots.some(s=>s.startsAt===selected))selected=null;
  if(!slots.some(s=>s.group===activeGroup)&&slots.length)activeGroup=slots[0].group;
  const days=Array.from({length:7},(_,i)=>moveDay(weekStart,i)),picked=slots.find(s=>s.startsAt===selected);
  root.innerHTML=`<section class="time-picker" aria-label="Choose game date and time"><div class="time-picker-heading"><button type="button" class="icon-button" id="time-back" aria-label="Back without changing time">‹</button><h2 id="time-picker-title">CHOOSE GAME TIME</h2></div><p class="time-zone">${esc(zone)} · your device’s timezone</p><div class="calendar-month"><button type="button" class="icon-button" id="week-prev" aria-label="Previous seven days" ${weekStart<=earliest?'disabled':''}>‹</button><strong>${esc(new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(localDay(chosenDay)))}</strong><button type="button" class="icon-button" id="week-next" aria-label="Next seven days" ${moveDay(weekStart,7)>latest?'disabled':''}>›</button></div><div class="day-strip" role="group" aria-label="Choose a day">${days.map(key=>`<button type="button" data-day="${key}" aria-pressed="${key===chosenDay}" aria-label="${esc(new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(localDay(key)))}" ${key>latest?'disabled':''}><span>${new Intl.DateTimeFormat('en-US',{weekday:'short'}).format(localDay(key)).toUpperCase()}</span><strong>${localDay(key).getDate()}</strong>${key===earliest?'<small>Today</small>':'<small>&nbsp;</small>'}</button>`).join('')}</div><div class="time-picker-options"><label>Jump to date<input id="calendar-jump" type="date" value="${chosenDay}" min="${earliest}" max="${latest}"></label><label>Game length<select id="game-length">${[30,60,90,120].map(n=>`<option value="${n}" ${n===duration?'selected':''}>${n} minutes</option>`).join('')}</select></label></div><p class="note">Proposed times, not court reservations. Confirm park hours and access with your group.</p><div class="time-period-tabs" role="group" aria-label="Time of day">${['Morning','Afternoon','Evening'].map(group=>`<button type="button" data-period="${group}" aria-pressed="${group===activeGroup}" ${slots.some(s=>s.group===group)?'':'disabled'}>${group}</button>`).join('')}</div><p id="time-picker-error" class="form-error" role="alert"></p><div class="time-slot-groups">${slots.length?['Morning','Afternoon','Evening'].map(group=>{const options=slots.filter(s=>s.group===group);return options.length&&group===activeGroup?`<section><h3>${group.toUpperCase()} (${options.length})</h3><div class="time-slots" role="group" aria-label="${group} time ranges">${options.map(s=>`<button type="button" data-slot="${s.startsAt}" aria-pressed="${selected===s.startsAt}"><span>${s.label}</span><span class="slot-check" aria-hidden="true">${selected===s.startsAt?'✓':'○'}</span></button>`).join('')}</div></section>`:'';}).join(''):`<div class="empty"><h3>No future start times on this date.</h3><p>Choose another day. Proposed sessions run between 6:00 AM and 11:00 PM; park hours are unverified.</p><button type="button" class="secondary" id="pick-tomorrow" ${chosenDay>=latest?'disabled':''}>Next day</button></div>`}</div><div class="time-picker-confirm"><p id="time-selection-summary" aria-live="polite">${picked?esc(new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(localDay(chosenDay)))+'<br><strong>'+picked.label+'</strong>':'Choose a time range to continue.'}</p><button type="button" class="primary full" id="confirm-game-time" ${picked?'':'disabled'}>USE THIS TIME</button></div></section>`;
  root.querySelector('#time-back').onclick=onCancel;
  root.querySelector('#week-prev').onclick=()=>{weekStart=moveDay(weekStart,-7);if(weekStart<earliest)weekStart=earliest;chosenDay=weekStart;selected=null;draw('#week-prev');};
  root.querySelector('#week-next').onclick=()=>{weekStart=moveDay(weekStart,7);chosenDay=weekStart;selected=null;draw('#week-next');};
  root.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{chosenDay=b.dataset.day;selected=null;draw(`[data-day="${chosenDay}"]`);});
  root.querySelector('#calendar-jump').onchange=e=>{const key=e.target.value;if(!localDay(key)||key<earliest||key>latest){root.querySelector('#time-picker-error').textContent='Choose a date within the next 180 days.';return;}chosenDay=key;weekStart=key;selected=null;draw('#calendar-jump');};
  root.querySelector('#game-length').onchange=e=>{duration=Number(e.target.value);draw('#game-length');};
  root.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{activeGroup=b.dataset.period;draw(`[data-period="${activeGroup}"]`);});
  root.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{selected=b.dataset.slot;draw(`[data-slot="${selected}"]`);});
  const next=root.querySelector('#pick-tomorrow');if(next)next.onclick=()=>{chosenDay=moveDay(chosenDay,1);if(!days.includes(chosenDay))weekStart=chosenDay;selected=null;draw();};
  root.querySelector('#confirm-game-time').onclick=()=>{const slot=proposedSlots(chosenDay,duration,clock()).find(s=>s.startsAt===selected);if(!slot){draw();root.querySelector('#time-picker-error').textContent='That time has passed. Choose a later time.';return;}onConfirm({...slot,timeZone:zone});};
  root.onkeydown=e=>{const day=e.target.closest('[data-day]');if(!day||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const index=days.indexOf(day.dataset.day),next=e.key==='Home'?0:e.key==='End'?6:Math.max(0,Math.min(6,index+(e.key==='ArrowRight'?1:-1)));root.querySelector(`[data-day="${days[next]}"]`)?.focus();};
  if(focusSelector)root.querySelector(focusSelector)?.focus({preventScroll:true});
 }
 draw();return ()=>{root.innerHTML='';root.onkeydown=null;};
}
// "18:00 on 2026-11-21 in America/Chicago" → the exact instant, wherever the person entering it is.
// Two passes settle the offset across daylight-saving changes; times inside a spring-forward gap move forward.
export function wallClockToUtc(local,timeZone){
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local||''));if(!m)return null;
 const fields={timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'};
 let format;try{format=new Intl.DateTimeFormat('en-US',fields);}catch{return null;}
 const offset=at=>{const p=Object.fromEntries(format.formatToParts(new Date(at)).map(x=>[x.type,x.value]));return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-at;};
 const wanted=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]),first=wanted-offset(wanted),second=wanted-offset(first);
 const exact=[first,second].filter(at=>at+offset(at)===wanted);
 return new Date(exact.length?Math.min(...exact):Math.max(first,second));
}
// The current wall-clock time in a zone, as a datetime-local value.
export function wallClockNow(timeZone,at=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(at).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
}
