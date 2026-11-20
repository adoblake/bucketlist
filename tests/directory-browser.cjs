// The nationwide court directory: players anywhere in the US see the courts and park details near them,
// without depending on the live OpenStreetMap lookup. Tiles are served by fixtures so the check is deterministic.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
const url=process.env.APP_URL||'http://127.0.0.1:3090';
const tiles={
 'index.json':{source:'OpenStreetMap',checkedAt:'2026-11-20',tileSize:.5,tiles:{'33.5_-84.5':2,'33.0_-112.5':1,'33.5_-112.5':1}},
 '33.5_-84.5.json':[
  {i:'ga-pw10',n:'Piedmont Park',k:'park',a:'400 Piedmont Ave NE',c:'Atlanta',s:'GA',la:33.7851,lo:-84.3738,ct:2,f:['2 mapped courts','Lights','4 hoops','Surface: asphalt','Outdoor','Free to use'],o:'w1',h:'w10',u:'https://piedmontpark.org'},
  {i:'ga-pw11',n:'Grady High School',k:'school',a:'',c:'Atlanta',s:'GA',la:33.7815,lo:-84.3752,ct:1,f:['1 mapped court','School grounds · public access not confirmed'],o:'w2',h:'w11'}],
 // Encanto Park duplicates the City of Phoenix record and must not appear twice.
 '33.0_-112.5.json':[{i:'az-pw20',n:'Encanto Park',k:'park',a:'',c:'Phoenix',s:'AZ',la:33.4772,lo:-112.0905,ct:1,f:['1 mapped court'],o:'w3',h:'w20'}],
 '33.5_-112.5.json':[]};
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});try{
 const errors=[],live=[];
 async function open(lat,lng){const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.addInitScript(([la,lo])=>{localStorage.setItem('bucketlist-welcome-seen','yes');localStorage.setItem('bucketlist-release-seen','courts-everywhere-v1');Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:la,longitude:lo,accuracy:20}});}}});},[lat,lng]);
  await context.route('https://tile.openstreetmap.org/**',r=>r.abort());await context.route('**/reverse?**',r=>r.fulfill({json:{address:{}}}));
  await context.route('**/data/us/*.json',r=>{const name=new URL(r.request().url()).pathname.split('/').pop();return tiles[name]?r.fulfill({json:tiles[name]}):r.fulfill({status:404,body:'missing'});});
  await context.route('**/api/interpreter?**',r=>{live.push(r.request().url());r.fulfill({json:{elements:[{type:'node',id:99,lat:51.507,lon:-0.128,tags:{sport:'basketball',name:'London live court'}}]}});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>/Centered on your location/.test(document.querySelector('#map-location-status')?.textContent||''));
  if(await page.locator('#location-updates').evaluate(e=>e.open))await page.locator('#dismiss-location-updates').click();return page;}

 // Atlanta: the directory supplies nearby parks and their details, with no live lookup.
 const atl=await open(33.7840,-84.3745);await atl.locator('#search-toggle').click();
 const card=atl.locator('.court-card').filter({hasText:'Piedmont Park'});await card.waitFor({timeout:15000});
 assert.match(await card.textContent(),/400 Piedmont Ave NE, Atlanta, GA/);assert.match(await card.textContent(),/Park courts · OpenStreetMap/);
 assert.match(await atl.locator('.court-card').filter({hasText:'Grady High School'}).textContent(),/School grounds · access not confirmed/);
 assert.match(await atl.locator('#coverage-status').textContent(),/court directory · OpenStreetMap · updated 2026-11-20/);
 assert.equal(live.length,0,'no live Overpass lookup where the directory has data');
 await card.locator('[data-map]').click();await atl.locator('#court-popup [data-court]').click();
 const details=atl.locator('#details');await details.locator('.court-facts').waitFor();
 for(const fact of ['Lights','4 hoops','Surface: asphalt','Free to use'])assert.match(await details.locator('.court-facts').textContent(),new RegExp(fact));
 assert.equal(await details.getByRole('link',{name:'Park or venue website →'}).getAttribute('href'),'https://piedmontpark.org');
 assert.equal(await details.getByRole('link',{name:'View on OpenStreetMap →'}).getAttribute('href'),'https://www.openstreetmap.org/way/1');
 assert.match(await details.textContent(),/Data © OpenStreetMap contributors/);
 await atl.screenshot({path:(process.env.QA_OUT||require('node:os').tmpdir()+'/bucketlist-qa')+'/directory/atlanta-details.png'});

 // Phoenix: the city's own record wins over the same park from the directory.
 const phx=await open(33.4770,-112.0910);await phx.locator('#search-toggle').click();await phx.locator('.court-card').first().waitFor();await phx.waitForTimeout(800);
 assert.equal(await phx.locator('.court-card').filter({hasText:'Encanto Park'}).count(),1);

 // Outside the directory (London), the app still falls back to the live lookup.
 const ldn=await open(51.5072,-0.1276);await ldn.locator('#search-toggle').click();await ldn.locator('.court-card').filter({hasText:'London live court'}).waitFor({timeout:15000});assert.ok(live.length>=1);
 assert.deepEqual(errors,[]);
 console.log('PASS: Atlanta player sees nearby park and school courts from the bundled directory with address, lights, hoops, surface, fees, website and OpenStreetMap credit, no live lookup needed; Phoenix city records are not duplicated; outside the directory the live lookup still works.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
