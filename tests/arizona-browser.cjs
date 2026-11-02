const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.APP_URL||'http://127.0.0.1:3097';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];
 async function newPage(geoScript){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('bucketlist-welcome-seen','yes'));
  if(geoScript)await context.addInitScript(geoScript);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
  await page.route('**/api/interpreter?**',r=>r.fulfill({json:{elements:[]}}));
  return {context,page};
 }
 try{
  // A failure to find courts is distinct from failure to locate the user.
  const {page:p}=await newPage(()=>Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:32.2226,longitude:-110.9747,accuracy:20}});}}}));
  await p.route('**/api/interpreter?**',r=>r.abort());
  await p.goto(url,{waitUntil:'domcontentloaded'});await p.locator('.user-location').waitFor();
  await p.locator('#retry-courts').waitFor();assert.match(await p.locator('#coverage-status').innerText(),/live lookup unavailable here/);
  assert.match(await p.locator('#map-location-status').innerText(),/Centered on your location/);assert.match(new URL(await p.locator('#map-external').getAttribute('href')).searchParams.get('query'),/basketball courts near 32\.2226,-110\.9747/);assert.equal(await p.locator('#location-help').isVisible(),false);
  await p.route('**/api/interpreter?**',r=>r.fulfill({json:{elements:[{type:'way',id:98765,center:{lat:32.2226,lon:-110.9747},tags:{sport:'basketball',name:'Tucson fixture court'}}]}}));
  await p.locator('#retry-courts').click();await p.locator('#search-toggle').click();await p.locator('[data-map=osm-way-98765]').waitFor();
  assert.equal(await p.locator('.user-location').count(),1);assert.match(await p.locator('#court-list').innerText(),/0.0 mi/);await p.locator('#close-search').click();
  await p.locator('#menu-toggle').click();await p.locator('#share-app').click();assert.equal(await p.locator('.share-link a').getAttribute('href'),new URL('./',url).href);
  await p.locator('#close-dialog').click();
  // Denied browser permission leaves saved AZ courts usable and offers help.
  const {page:d}=await newPage(()=>Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(_ok,fail){fail({code:1});}}}));
  await d.goto(url,{waitUntil:'domcontentloaded'});await d.locator('#location-help').waitFor();
  assert.match(await d.locator('#map-location-status').innerText(),/Location access is off/);assert.ok(Number(await d.locator('#court-map').getAttribute('data-result-count'))>=125);
  await d.locator('#search-toggle').click();await d.route('**/search?**',r=>r.fulfill({json:[{lat:'30.2672',lon:'-97.7431'}]}));
  await d.locator('#location').fill('Austin');await d.locator('#search-form button').click();await d.waitForFunction(()=>document.querySelector('#map-location-status').textContent.includes('Choose a city'));
  assert.doesNotMatch(await d.locator('#court-list').innerText(),/Alamo/);assert.ok(Number(await d.locator('#court-map').getAttribute('data-result-count'))>=125);
  await d.locator('#close-search').click();await d.locator('#location-help').click();assert.equal(await d.locator('#details a[target=_blank]').getAttribute('href'),url.endsWith('/')?url:url+'/');
  // An iframe policy block has a direct escape link, rather than claiming GPS is off.
  const {page:e}=await newPage(()=>Object.defineProperty(document,'permissionsPolicy',{value:{allowsFeature(){return false;}}}));
  await e.goto(url,{waitUntil:'domcontentloaded'});await e.locator('#location-open-browser').waitFor();
  assert.match(await e.locator('#map-location-status').innerText(),/blocked in this view/);assert.equal(await e.locator('.user-location').count(),0);
  assert.equal(new URL(await e.locator('#location-open-browser').getAttribute('href')).origin,new URL(url).origin);
  // A device reporting another state must never appear as a dot in Phoenix.
  const {page:o}=await newPage(()=>Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:35.1678,longitude:-114.573,accuracy:20}});}}}));
  await o.goto(url,{waitUntil:'domcontentloaded'});await o.waitForFunction(()=>document.querySelector('#map-location-status').textContent.includes('outside Arizona'));
  assert.equal(await o.locator('.user-location').count(),0);assert.equal(await o.locator('#refit-map').isEnabled(),true);assert.ok(Number(await o.locator('#court-map').getAttribute('data-result-count'))>=125);
  // High-accuracy timeout recovers without a second permission loop.
  const {page:f}=await newPage(()=>{let calls=0;Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){calls++;if(calls===1)fail({code:3});else ok({coords:{latitude:33.4715,longitude:-111.9834,accuracy:2000}});}}});});
  await f.goto(url,{waitUntil:'domcontentloaded'});await f.locator('.user-location').waitFor();await f.locator('#location-updates[open]').waitFor();assert.match(await f.locator('#map-location-status').innerText(),/approximate location/);assert.ok(Number(await f.locator('#court-map').getAttribute('data-result-count'))>0);
  // Status messages and recovery controls do not overlap at mobile size.
  const boxes=await e.locator('.map-notices > :visible').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom};}));
  for(let i=1;i<boxes.length;i++)assert.ok(boxes[i].top>=boxes[i-1].bottom);
  assert.deepEqual(errors,[]);
  await d.screenshot({path:'/workspace/work/arizona-location-help.png'});
  console.log('PASS: Arizona GPS, provider failure/retry, nearby distances, permission denial, embedded recovery, out-of-state rejection, coarse fallback, current share link, and mobile notices.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
