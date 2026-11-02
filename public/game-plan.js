import {isInArizona} from './arizona.js';
export function planMiles(a,b){
 const rad=n=>n*Math.PI/180;
 const h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
 return 3958.8*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}
export function selectPlanGame({games,courts,joined=[],area,now=new Date(),hasPhoto=()=>false,countPlayers=g=>g.players.length}){
 const byId=new Map(courts.map(c=>[c.id,c]));
 const eligible=games.filter(g=>{const c=byId.get(g.courtId);return c&&isInArizona(c.lat,c.lng)&&!g.cancelled&&Number.isFinite(Date.parse(g.startsAt))&&new Date(g.startsAt)>now;});
 const own=eligible.filter(g=>joined.includes(g.id));
 const nearby=eligible.filter(g=>countPlayers(g)<g.capacity&&(!area||planMiles(area,byId.get(g.courtId))<=30));
 return [...(own.length?own:nearby)].sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt)||Number(!!hasPhoto(byId.get(b.courtId)))-Number(!!hasPhoto(byId.get(a.courtId))))[0]||null;
}
function planZone(zone){try{new Intl.DateTimeFormat('en-US',{timeZone:zone});return zone;}catch{return 'America/Phoenix';}}
function planCalendarKey(date,zone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-');}
export function gamePlanTiming(startsAt,now=new Date(),timeZone='America/Phoenix'){
 const date=new Date(startsAt),zone=planZone(timeZone);
 if(!Number.isFinite(date.getTime()))return {relative:'Date unavailable',date:'',time:''};
 const days=(Date.parse(planCalendarKey(date,zone))-Date.parse(planCalendarKey(now,zone)))/86400000;
 return {relative:days===0?'Today':days===1?'Tomorrow':new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'long'}).format(date),date:new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',month:'short',day:'numeric'}).format(date),time:new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(date)};
}
export function gamePlanToday(now=new Date()){return new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',weekday:'short',month:'short',day:'numeric'}).format(now);}
