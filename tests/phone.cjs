const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark',reducedMotion:'reduce'}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const url=process.env.PHONE_URL||'http://127.0.0.1:3095/bucketlist/';
  await p.addInitScript(()=>{(localStorage.setItem('bucketlist-release-seen','shared-courts-v1'),localStorage.setItem('bucketlist-welcome-seen','yes'));Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:33.4715,longitude:-111.9834,accuracy:30}});}}});});
  await p.route('https://tile.openstreetmap.org/**',r=>r.abort());
  await p.route('**/api/interpreter?**',r=>r.fulfill({json:{elements:[]}}));
  const dismissUpdates=async()=>{await p.waitForTimeout(350);if(await p.locator('#location-updates').evaluate(e=>e.open))await p.locator('#dismiss-location-updates').click();};
  const openMenu=async()=>{if(await p.locator('#app-menu').isHidden())await p.locator('#menu-toggle').click();};
  await p.goto(url,{waitUntil:'domcontentloaded'});
  await p.locator('#court-map').waitFor();
  assert.equal(await p.locator('.screen:visible').getAttribute('id'),'discover-screen');
  assert.equal(await p.locator('.app-header .brand-wordmark').innerText(),'Bucketlist');
  await p.locator('.bottom-nav [data-tab=discover]').click();await p.locator('#search-toggle').click();await p.locator('#location').fill('Phoenix');await p.locator('#search-form button').click();await p.locator('#close-search').click();await dismissUpdates();
  assert.ok(Number(await p.locator('#court-map').getAttribute('data-result-count'))>=125);
  await p.locator('.bottom-nav [data-tab=games]').click();
  const manifestUrl=await p.locator('link[rel=manifest]').evaluate(e=>e.href);
  assert.match(manifestUrl,/bucketlist\/manifest.webmanifest$/);
  const response=await context.request.get(manifestUrl);assert.equal(response.status(),200);
  const manifest=await response.json();assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./');
  for(const icon of manifest.icons){const r=await context.request.get(new URL(icon.src,manifestUrl).href);assert.equal(r.status(),200);assert.match(r.headers()['content-type'],/image\/png/);}
  assert.equal((await context.request.get(new URL('share-qr.png',url).href)).status(),200);
  await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await context.setOffline(true);await p.reload({waitUntil:'domcontentloaded'});await p.locator('#court-map').waitFor();assert.equal(await p.locator('.screen:visible').getAttribute('id'),'discover-screen');await dismissUpdates();await p.locator('.bottom-nav [data-tab=games]').click();if(!await p.locator('#sample-game-plan').evaluate(e=>e.open))await p.locator('#sample-game-plan>summary').click();await p.locator('#open-plan-game').waitFor();
  await p.locator('#plan-profile').click();assert.equal(await p.locator('#plan-session-count').innerText(),'24');
  await p.locator('.bottom-nav [data-tab=stats]').click();assert.match(await p.locator('#stats-summary').innerText(),/24 sessions/);
  await context.setOffline(false);await openMenu();await p.locator('#install-app').click();assert.match(await p.locator('#details').innerText(),/Safari|Install/);await p.locator('#close-dialog').click();
  await openMenu();await p.locator('#share-app').click();assert.equal(await p.locator('.share-link a').getAttribute('href'),new URL('./',url).href);
  assert.deepEqual(errors,[]);
  console.log('PASS: /bucketlist/ mobile map opening, Games-tab game plan and original brand, saved directory, manifest/icon/QR assets, service worker control, offline map reload and showcase, installation help, and public share link.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
