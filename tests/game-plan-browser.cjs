const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const url=process.env.APP_URL||'http://127.0.0.1:3114';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,colorScheme:'light',timezoneId:'America/Phoenix'});
 await context.addInitScript(()=>{(localStorage.setItem('bucketlist-release-seen','2026-11-02-shared-groups-v1'),localStorage.setItem('bucketlist-welcome-seen','yes'));Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:33.4715,longitude:-111.9834,accuracy:30}});}}});});
 await context.route('https://tile.openstreetmap.org/**',r=>r.abort());await context.route('**/api/interpreter?**',r=>r.fulfill({json:{elements:[]}}));
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 async function dismissUpdates(){await p.waitForTimeout(350);if(await p.locator('#location-updates').evaluate(e=>e.open))await p.locator('#dismiss-location-updates').click();}
 const nav=async tab=>{if(tab==='chats'){await p.locator('#menu-toggle').click();await p.locator('#app-menu [data-tab=chats]').click();}else await p.locator('.bottom-nav [data-tab='+tab+']').click();};
 try{
  await p.goto(url,{waitUntil:'domcontentloaded'});assert.equal(await p.locator('.screen:visible').getAttribute('id'),'discover-screen');await dismissUpdates();await nav('games');await p.waitForFunction(()=>document.querySelector('#game-plan-photo img')?.complete);
  assert.equal(await p.locator('.screen:visible').getAttribute('id'),'games-screen');
  assert.deepEqual(await p.locator('.bottom-nav button').allTextContents(),['Courts','Games','Chat','Stats']);
  assert.equal(await p.locator('.bottom-nav [aria-current]').getAttribute('data-tab'),'games');assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
  assert.match(await p.locator('.plan-court-name').innerText(),/Encanto/);assert.match(await p.locator('.plan-photo-view img').getAttribute('alt'),/Encanto/);
  assert.equal(await p.locator('#plan-session-count').innerText(),'—');assert.equal(await p.locator('#plan-ppg').innerText(),'—');assert.match(await p.locator('.plan-game-facts').innerText(),/7\/10 players/);
  // Guests can inspect a run; joining retains the existing profile and team flow.
  await p.locator('#open-plan-game').click();await p.locator('[data-team=A]').click();await p.locator('[name=displayName]').fill('QA Player');await p.locator('#login-form button').click();
  await p.locator('[data-team=A]').click();await p.locator('#close-dialog').click();await dismissUpdates();
  assert.match(await p.locator('.plan-game-facts').innerText(),/8\/10 players/);assert.equal(await p.locator('#plan-session-count').innerText(),'0');
  await p.locator('#view-plan-stats').click();await p.locator('#log-stats').click();await p.locator('[name=points]').fill('12');await p.locator('[name=rebounds]').fill('3');await p.locator('[name=assists]').fill('4');await p.locator('#stats-form button').click();
  await nav('games');assert.equal(await p.locator('#plan-session-count').innerText(),'1');assert.equal(await p.locator('#plan-ppg').innerText(),'12.0');
  await p.locator('#toggle-all-games').click();assert.equal(await p.locator('#all-games-panel').isVisible(),true);assert.ok(await p.locator('#my-games-list [data-game]').count()>0);await p.locator('#toggle-all-games').click();
  // The four tabs retain the original courts, groups, and stats workflows.
  await nav('chats');assert.equal(await p.locator('#chats-screen').isVisible(),true);assert.match(await p.locator('#chat-list').innerText(),/Encanto/);
  await nav('discover');await p.locator('.user-location').waitFor();await p.waitForFunction(()=>Number(document.querySelector('#court-map').dataset.resultCount)>0);assert.ok(Number(await p.locator('#court-map').getAttribute('data-result-count'))>0);const dot=await p.locator('.user-location').boundingBox(),map=await p.locator('#court-map').boundingBox();assert.ok(Math.abs(dot.x+dot.width/2-map.x-map.width/2)<15);assert.ok(Math.abs(dot.y+dot.height/2-map.y-map.height/2)<15);await dismissUpdates();
  await nav('games');await p.locator('#menu-toggle').click();await p.locator('#app-menu [data-tab=profile]').click();assert.equal(await p.locator('[name=name]').inputValue(),'QA Player');await p.locator('#sign-out').click();await nav('games');await dismissUpdates();
  assert.equal(await p.locator('#plan-session-count').innerText(),'—');assert.equal(await p.locator('#plan-ppg').innerText(),'—');
  // The demo remains explicitly fictional and never replaces personal records.
  await p.locator('#plan-profile').click();assert.equal(await p.locator('#plan-profile').innerText(),'Demo profile');assert.equal(await p.locator('#plan-session-count').innerText(),'24');assert.match(await p.locator('#plan-stats-label').innerText(),/Demo stats/i);
  const personal=await p.evaluate(()=>JSON.parse(localStorage.getItem('bucketlist-demo-v2')));assert.equal(personal.profile.name,'QA Player');assert.equal(personal.stats.length,1);assert.equal(personal.stats[0].points,12);
  const navTop=await p.locator('.bottom-nav').evaluate(e=>e.getBoundingClientRect().top),statsBottom=await p.locator('#view-plan-stats').evaluate(e=>e.getBoundingClientRect().bottom);assert.ok(statsBottom<=navTop,'The stats action must be above the fixed nav');
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).display==='none');await p.screenshot({path:path.join(__dirname,'../docs/game-plan-light.png')});
  await p.locator('#appearance-toggle').click();assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');await p.waitForTimeout(200);await p.screenshot({path:path.join(__dirname,'../docs/game-plan-dark.png')});
  await p.reload({waitUntil:'domcontentloaded'});await dismissUpdates();assert.equal(await p.locator('.screen:visible').getAttribute('id'),'discover-screen');await nav('games');assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');assert.equal(await p.locator('#plan-session-count').innerText(),'24');
  for(const width of [320,390,768,1280]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Horizontal overflow at '+width);for(const tab of ['discover','games','chats','stats'])assert.equal(await p.locator('.bottom-nav [data-tab='+tab+']').isVisible(),true);}
  await p.setViewportSize({width:390,height:844});await p.locator('#menu-toggle').click();await p.locator('#exit-showcase').click();await nav('games');assert.equal(await p.locator('#plan-session-count').innerText(),'—');
  const retained=await p.evaluate(()=>JSON.parse(localStorage.getItem('bucketlist-demo-v2')));assert.equal(retained.stats.length,1);assert.equal(retained.profile.name,'QA Player');
  assert.deepEqual(errors,[]);
  console.log('PASS: map landing and Games-tab game plan, genuine court photo, guest/sign-in/team join, data-driven roster/stats, all-games expansion, four-tab flows, sign-out privacy, demo isolation, saved theme, and responsive controls.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
