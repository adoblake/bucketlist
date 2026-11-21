const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.APP_URL||'http://127.0.0.1:3110';
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
 const errors=[];
 const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark',reducedMotion:'reduce'});
 await context.addInitScript(()=>{
  (localStorage.setItem('bucketlist-release-seen','courts-everywhere-v1'),localStorage.setItem('bucketlist-welcome-seen','yes'));localStorage.getItem('bucketlist-theme')||localStorage.setItem('bucketlist-theme','dark');
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:33.4715,longitude:-111.9834,accuracy:20}});}}});
 });
 await context.route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/png',body:pixel}));
 await context.route('**/api/interpreter?**',r=>r.fulfill({json:{elements:[]}}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const openUpdates=async()=>{if(!await page.locator('#location-updates').evaluate(e=>e.open))await page.locator('#location-updates summary').click();};
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#location-updates[open]').waitFor();
  assert.match(await page.locator('#updates-heading').innerText(),/Near you/);
  assert.match(await page.locator('#map-location-status').innerText(),/Centered on your location/);
  assert.equal(await page.locator('#updates-badge').isVisible(),true);
  assert.equal(await page.locator('#appearance-toggle').getAttribute('aria-label'),'Switch to light mode');
  const darkPanel=await page.locator('#location-updates-panel').evaluate(e=>getComputedStyle(e).backgroundColor);
  await page.screenshot({path:(process.env.QA_OUT||require('node:os').tmpdir()+'/bucketlist-qa')+'/nearby-updates-dark.png'});
  await page.locator('#appearance-toggle').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  assert.equal(await page.evaluate(()=>localStorage.getItem('bucketlist-theme')),'light');
  await openUpdates();
  const lightPanel=await page.locator('#location-updates-panel').evaluate(e=>getComputedStyle(e).backgroundColor);
  assert.notEqual(darkPanel,lightPanel);
  assert.equal(await page.locator('#appearance-toggle').getAttribute('aria-label'),'Switch to dark mode');
  await page.screenshot({path:(process.env.QA_OUT||require('node:os').tmpdir()+'/bucketlist-qa')+'/nearby-updates-light.png'});
  await page.locator('#dismiss-location-updates').click();
  assert.equal(await page.locator('#location-updates').evaluate(e=>e.open),false);
  await page.waitForTimeout(1400);
  assert.equal(await page.locator('#location-updates').evaluate(e=>e.open),false);
  assert.equal(await page.locator('#updates-badge').isVisible(),false);
  // Acknowledged information in the same area stays dismissed on reload.
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('.user-location'));await page.waitForTimeout(1200);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  assert.equal(await page.locator('#location-updates').evaluate(e=>e.open),false);
  await openUpdates();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#location-updates').evaluate(e=>e.open),false);
  assert.equal(await page.locator('#location-updates summary').evaluate(e=>e===document.activeElement),true);
  // After "Got it" the card stays closed until the next sign-in: searching somewhere new, moving the map,
  // a failed lookup or newly found courts never reopen it. It stays one tap away under the bell.
  await page.locator('#search-toggle').click();await page.locator('#location').fill('Scottsdale');await page.locator('#search-form button').click();
  await page.waitForTimeout(350);await page.locator('#close-search').click();await page.waitForTimeout(600);
  assert.equal(await page.locator('#location-updates').evaluate(e=>e.open),false);
  await openUpdates();assert.match(await page.locator('#updates-heading').innerText(),/Scottsdale/);await page.locator('#close-location-updates').click();
  await page.locator('.leaflet-control-zoom-out').click();await page.waitForTimeout(1100);
  assert.equal(await page.locator('#location-updates').evaluate(e=>e.open),false);
  await page.route('**/api/interpreter?**',r=>r.abort());
  await page.locator('#search-toggle').click();await page.locator('#court-search-options summary').click();await page.locator('#find-live-parks').click();await page.waitForTimeout(400);await page.locator('#close-search').click();await page.waitForTimeout(600);
  assert.equal(await page.locator('#location-updates').evaluate(e=>e.open),false);
  assert.equal(await page.locator('#updates-badge').isVisible(),true,'a real problem still marks the bell');
  await openUpdates();assert.match(await page.locator('#coverage-status').innerText(),/live lookup unavailable/);await page.locator('#close-location-updates').click();
  await page.route('**/api/interpreter?**',r=>r.fulfill({json:{elements:[{type:'way',id:777003,center:{lat:33.525,lon:-111.904},tags:{sport:'basketball',name:'New nearby fixture court'}}]}}));
  await page.locator('#search-toggle').click();await page.locator('#find-live-parks').click();
  await page.locator('[data-map=osm-way-777003]').waitFor();await page.locator('#close-search').click();await page.waitForTimeout(600);
  assert.equal(await page.locator('#location-updates').evaluate(e=>e.open),false);
  for(let i=0;i<3;i++){await page.locator('.leaflet-control-zoom-out').click();await page.waitForTimeout(400);}
  await page.mouse.move(195,520);await page.mouse.down();await page.mouse.move(60,380,{steps:8});await page.mouse.up();await page.waitForTimeout(900);
  assert.equal(await page.locator('#location-updates').evaluate(e=>e.open),false);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('.user-location'));await page.waitForTimeout(1000);
  assert.equal(await page.locator('#location-updates').evaluate(e=>e.open),false,'Got it survives a restart');
  // Signing in starts fresh: the card shows again on arrival.
  await page.locator('[data-tab=stats]').first().click();await page.locator('[name=displayName]').fill('Hooper');await page.locator('#login-form button').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('bucketlist-area-card-ack')),null);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#location-updates[open]').waitFor();
  await page.locator('#dismiss-location-updates').click();
  // Both modes remain usable at narrow and desktop viewport widths.
  for(const width of [320,1280]){
   await page.setViewportSize({width,height:844});await openUpdates();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.ok(await page.locator('#appearance-toggle').isVisible());
   const panel=await page.locator('#location-updates-panel').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=width);
   await page.locator('#close-location-updates').click();
  }
  const fresh=await context.browser().newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await fresh.addInitScript(()=>{localStorage.setItem('bucketlist-release-seen','courts-everywhere-v1');localStorage.setItem('bucketlist-welcome-seen','yes');Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:33.4715,longitude:-111.9834,accuracy:20}});}}});});
  await fresh.route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/png',body:pixel}));await fresh.route('**/api/interpreter?**',r=>r.fulfill({json:{elements:[]}}));
  const visitor=await fresh.newPage();visitor.on('pageerror',e=>errors.push(e.message));await visitor.goto(url,{waitUntil:'domcontentloaded'});
  await visitor.locator('#location-updates[open]').waitFor();await visitor.mouse.click(200,700);
  assert.equal(await visitor.locator('#location-updates').evaluate(e=>e.open),false);
  await visitor.locator('.leaflet-control-zoom-out').click();await visitor.waitForTimeout(800);
  await visitor.mouse.move(195,560);await visitor.mouse.down();await visitor.mouse.move(40,400,{steps:8});await visitor.mouse.up();await visitor.waitForTimeout(900);
  assert.equal(await visitor.locator('#location-updates').evaluate(e=>e.open),false,'moving the map never opens the card');
  await fresh.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: visible Light/Dark toggle, saved theme, themed dropdown, area card opens once on arrival, Got it holds across searches, map moves, failures, new courts and restarts until the next sign-in, problems still mark the bell, moving the map never pops the card, keyboard access, and mobile/desktop layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
