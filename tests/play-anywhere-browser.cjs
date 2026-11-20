// Shared courts and games work wherever the player is, in each court's own local time.
// Run against the local Worker: npm run build:community && PORT=3140 node scripts/community-local.mjs
const {chromium}=require('playwright');const assert=require('node:assert/strict');
const origin=process.env.COMMUNITY_ORIGIN||'http://127.0.0.1:3140',run=Date.now().toString(36);
(async()=>{const {wallClockToUtc}=await import('../public/schedule.js');const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});try{
 // The player's phone is on Arizona time; the court is in Chicago.
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Phoenix'});await context.addCookies([{url:origin,name:'community-local-user',value:'chi-'+run}]);await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/play/?'+new URLSearchParams({action:'add',lat:'41.8756',lng:'-87.6188'}),{waitUntil:'domcontentloaded'});
 await page.getByLabel('Your name or nickname').fill('Chicago Hooper');await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByLabel('Park name').fill('Grant Park '+run);await page.getByLabel('City or town').fill('Chicago');await page.getByLabel('Court name').fill('Lakefront court');
 await page.getByLabel('I placed this pin on the actual court inside the named park.').check();await page.getByRole('button',{name:'Save court',exact:true}).click();
 await page.getByRole('button',{name:'Schedule a game here',exact:true}).click();
 const zone=await page.locator('#game-zone').textContent();assert.match(zone,/America\/Chicago/);assert.match(zone,/different from your device/);
 const wall=await page.getByLabel('Start date and time').inputValue();const expected=wallClockToUtc(wall,'America/Chicago').getTime();
 await page.getByLabel('Game title').fill('Lakefront run '+run);await page.getByRole('button',{name:'Create shared game',exact:true}).click();
 await page.locator('.game-time').waitFor();assert.match(await page.locator('.game-time').textContent(),/C[SD]T · court’s local time/);
 const gameId=new URL(page.url()).searchParams.get('game');const {game}=await (await context.request.get(origin+'/api/public/games/'+gameId)).json();
 assert.equal(game.timeZone,'America/Chicago');assert.equal(game.startsAt,expected,'the entered time is Chicago wall-clock time, not the phone’s');
 // Lists are local: near Chicago the game appears with a distance; near Phoenix it does not.
 await page.goto(origin+'/play/?lat=41.88&lng=-87.63',{waitUntil:'domcontentloaded'});await page.getByText('SHARED GAMES NEAR YOU',{exact:false}).waitFor();
 const card=page.locator('.play-card').filter({hasText:'Lakefront run '+run});await card.waitFor();assert.match(await card.textContent(),/0\.\d mi away/);
 await page.goto(origin+'/play/?lat=33.45&lng=-112.07',{waitUntil:'domcontentloaded'});await page.getByText('Find your next run.').waitFor();await page.getByRole('button',{name:'Show games everywhere'}).waitFor();
 assert.equal(await page.locator('.play-card').filter({hasText:'Lakefront run '+run}).count(),0);
 await page.getByRole('button',{name:'Show games everywhere'}).click();await page.locator('.play-card').filter({hasText:'Lakefront run '+run}).waitFor();
 // Adding a court with no hand-off and no location starts zoomed out, not in Phoenix.
 const anon=await browser.newContext({viewport:{width:390,height:844}});await anon.addCookies([{url:origin,name:'community-local-user',value:'chi-'+run}]);const p2=await anon.newPage();p2.on('pageerror',e=>errors.push(e.message));
 await p2.goto(origin+'/play/?action=add',{waitUntil:'domcontentloaded'});await p2.locator('#pin-map').waitFor();assert.match(await p2.locator('#status').textContent(),/Turn on location/);
 assert.deepEqual(errors,[]);
 console.log('PASS: a Chicago court pinned and hosted from a phone on Arizona time, stored and shown in Chicago time, listed near Chicago with distance but not near Phoenix, games-everywhere view, and a no-location pin map that does not default to Phoenix.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
