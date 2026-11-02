const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const url=process.env.APP_URL||'http://127.0.0.1:3112';
const fixtures=process.env.PHOTO_FIXTURES||require('node:path').join(__dirname,'fixtures','court-photos');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[],exports=[];let rejectExport=false,lateRoute=null,holdExport=false,missingDate=false;
 const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark',reducedMotion:'reduce'});
 await context.addInitScript(()=>{(localStorage.setItem('bucketlist-release-seen','2026-11-02-shared-groups-v1'),localStorage.setItem('bucketlist-welcome-seen','yes'));localStorage.setItem('bucketlist-theme','dark');Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:33.47028247951755,longitude:-111.98406982543241,accuracy:20}});}}});});
 await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await context.route('**/api/interpreter?**',r=>r.fulfill({json:{elements:[]}}));
 await context.route('**/World_Imagery/MapServer/export?**',async route=>{
  const u=new URL(route.request().url()),bounds=u.searchParams.get('bbox').split(',').map(Number);exports.push(bounds);
  if(holdExport){lateRoute=route;return;}
  if(rejectExport){await route.fulfill({status:503,json:{error:{message:'Temporary failure'}}});return;}
  const photo=(bounds[0]+bounds[2])/2< -112.04?'encanto':'pierce';
  await route.fulfill({headers:{'access-control-allow-origin':'*'},json:{href:'https://services.arcgisonline.com/arcgis/rest/directories/arcgisoutput/World_Imagery_MapServer/qa-'+photo+'.jpg'}});
 });
 await context.route('**/World_Imagery/MapServer/identify?**',r=>r.fulfill({headers:{'access-control-allow-origin':'*'},json:missingDate?{results:[]}:{results:[{attributes:{'DATE (YYYYMMDD)':'20260507','RESOLUTION (M)':'0.5',SOURCE:'Vantor'}}]}}));
 await context.route('**/arcgisoutput/World_Imagery_MapServer/qa-*.jpg',r=>r.fulfill({contentType:'image/jpeg',body:fs.readFileSync(fixtures+'/'+(r.request().url().includes('encanto')?'encanto':'pierce')+'-aerial.jpg')}));
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 async function openCourt(name){
  if(await p.locator('#detail-dialog').isVisible())await p.locator('#close-dialog').click();
  if(!await p.locator('#map-search').isVisible())await p.locator('#search-toggle').click();
  await p.locator('#location').fill(name);await p.locator('#search-form button').click();await p.locator('#court-list [data-map]').first().click();
  await p.waitForTimeout(300);if(await p.locator('#location-updates').evaluate(e=>e.open))await p.locator('#dismiss-location-updates').click();
  await p.locator('#court-popup [data-court]').click();
 }
 async function imageReady(){await p.waitForFunction(()=>{const i=document.querySelector('#court-media img');return i&&i.complete&&i.naturalWidth>0&&!i.closest('a').hidden;});}
 try{
  await p.goto(url,{waitUntil:'domcontentloaded'});await openCourt('Pierce');await imageReady();
  assert.equal(await p.locator('.court-preview').count(),0);assert.match(await p.locator('.court-photo-link img').getAttribute('alt'),/mapped basketball court at Pierce Park/);
  assert.match(await p.locator('.court-photo-date').innerText(),/May 7, 2026/);assert.match(await p.locator('.court-photo-credit').innerText(),/Esri/);
  assert.equal(await p.locator('[data-photo-view=ground]').isVisible(),false);
  const b=exports.at(-1);assert.ok(Math.abs((b[0]+b[2])/2+111.98406982543241)<1e-6);assert.ok(Math.abs((b[1]+b[3])/2-33.47028247951755)<1e-6);
  await p.screenshot({path:'/workspace/work/court-photos/pierce-in-app.png'});
  const previousWidth=b[2]-b[0];await p.locator('[data-photo-wider]').click();await imageReady();assert.ok(exports.at(-1)[2]-exports.at(-1)[0]>previousWidth);
  await openCourt('Encanto');await imageReady();assert.match(await p.locator('.court-photo-link img').getAttribute('alt'),/Encanto Park/);
  await p.locator('[data-photo-view=ground]').click();await imageReady();assert.match(await p.locator('.court-photo-link img').getAttribute('src'),/^data:image\/jpeg;base64,/);
  assert.match(await p.locator('.court-photo-date').innerText(),/Source published Dec 15, 2021/);assert.match(await p.locator('.court-photo-date').innerText(),/capture date not provided/);
  assert.equal(await p.locator('.court-photo-credit').getAttribute('href'),'https://x.com/PhoenixParks/status/1471266331173527555');
  await p.screenshot({path:'/workspace/work/court-photos/encanto-in-app.png'});
  // Tab changes and dialogs clean up the old venue's pending photo request.
  await openCourt('Pierce');await imageReady();holdExport=true;await p.locator('[data-photo-closer]').click();
  await p.waitForFunction(()=>document.querySelector('.court-photo-frame').dataset.loading==='true');
  for(let i=0;i<20&&!lateRoute;i++)await p.waitForTimeout(20);assert.ok(lateRoute);
  holdExport=false;await openCourt('Encanto');await imageReady();
  try{await lateRoute.fulfill({headers:{'access-control-allow-origin':'*'},json:{href:'https://services.arcgisonline.com/arcgis/rest/directories/arcgisoutput/World_Imagery_MapServer/qa-pierce.jpg'}});}catch{}
  assert.match(await p.locator('.court-photo-name').innerText(),/Encanto/);assert.match(await p.locator('.court-photo-link img').getAttribute('alt'),/Encanto/);
  // An unavailable photo offers recovery, without substituting another venue.
  rejectExport=true;missingDate=true;await openCourt('Aguila');await p.locator('.court-photo-error').waitFor();
  assert.equal(await p.locator('.court-photo-link').isVisible(),false);assert.match(await p.locator('.court-photo-date').innerText(),/Capture date unavailable/);
  assert.match(await p.locator('.court-photo-maps').getAttribute('href'),/Aguila/);assert.equal(await p.locator('.court-preview').count(),0);
  rejectExport=false;await p.locator('[data-retry-photo]').click();await imageReady();assert.match(await p.locator('.court-photo-name').innerText(),/Aguila/);
  await p.locator('#close-dialog').click();await p.locator('#appearance-toggle').click();await openCourt('Encanto');await imageReady();
  assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
  for(const width of [320,1280]){await p.setViewportSize({width,height:844});assert.equal(await p.locator('#details').evaluate(e=>e.scrollWidth<=e.clientWidth),true);}
  assert.deepEqual(errors,[]);
  console.log('PASS: per-court aerial imagery, dates/credits, real Encanto photo, zoom, venue switching/stale replies, unavailable-photo recovery, and Light/Dark responsive layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
