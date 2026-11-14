// WCAG 2.2 AA regression checks. Local fixture data only; this is not a conformance certification.
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const main = 'http://127.0.0.1:3160', shared = 'http://127.0.0.1:3170';
const report = [], failures = [], children = [];
fs.mkdirSync('accessibility-report', { recursive: true });
function start(file, port) {
  const p = spawn(process.execPath, [file], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(p);
  let log = '';
  for (const s of [p.stdout, p.stderr]) s.on('data', b => { log = (log + b).slice(-12000); });
  p.on('exit', code => { if(code) console.error(file + ' exited ' + code + ': ' + log); });
}
async function ready(url) {
  for(let i=0;i<120;i++) {
    try { if((await fetch(url)).ok) return; } catch {}
    await new Promise(r=>setTimeout(r,250));
  }
  throw Error('Preview did not become ready: ' + url);
}
async function scan(page, name) {
  await page.waitForTimeout(180);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  const entry = { name, url:page.url(), violations:result.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary,html:n.html}))})), incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})) };
  report.push(entry);
  console.log('AXE ' + JSON.stringify(entry));
  if(entry.violations.length)failures.push(name + ': ' + entry.violations.map(v=>v.id).join(', '));
  await page.screenshot({path:'accessibility-report/'+name+'.png', fullPage:true});
  // Only synthetic, signed-in test users are captured. Small previews support review without a local executor.
  if(['map-light','list-dark','pin-placement','court-form','chat-dark'].includes(name)) {
    const shot=await page.screenshot({type:'jpeg',quality:52});
    console.log('A11Y_IMAGE '+name+' '+shot.toString('base64'));
  }
}
(async()=>{
  start('server.js',3160);start('scripts/community-local.mjs',3170);
  await Promise.all([ready(main),ready(shared+'/play/')]);
  const browser = await chromium.launch();
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Phoenix'});
    await context.addInitScript(()=>{
      localStorage.setItem('bucketlist-release-seen','shared-courts-v1');
      Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:33.516,longitude:-111.909,accuracy:20}});}}});
    });
    await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
    await context.route('**/api/interpreter?**',r=>r.fulfill({json:{elements:[]}}));
    await context.route('https://bucketlist-recovered-oct29.adoblake.chatgpt.site/api/public/**',async route=>{
      const u=new URL(route.request().url());
      const response=await route.fetch({url:shared+u.pathname+u.search,headers:{...route.request().headers(),origin:main}});
      await route.fulfill({response});
    });
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(main);await page.locator('.user-location').waitFor();
    await page.waitForTimeout(650);
    if(await page.locator('#location-updates').evaluate(e=>e.open))await page.locator('#dismiss-location-updates').click();
    
    // Skip links preserve shared-court fragments instead of rewriting the app's URL.
    const hash=await page.evaluate(()=>location.hash);
    await page.locator('#skip-main').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'main-content');
    assert.equal(await page.evaluate(()=>location.hash),hash);
    await page.locator('#skip-court-list').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'location');
    await page.locator('#close-search').click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'court-search-toggle');
    await scan(page,'map-light');
    await page.locator('#court-list-view').click();await scan(page,'list-light');
    await page.locator('#appearance-toggle').click();await scan(page,'list-dark');
    await page.locator('#court-map-view').click();await page.locator('#add-court').click();
    
    assert.equal(await page.evaluate(()=>document.activeElement.id),'court-map');
    await page.keyboard.press('ArrowRight');await page.waitForTimeout(350);
    await page.getByRole('button',{name:'Center pin',exact:true}).focus();await page.keyboard.press('Enter');
    await page.getByText('Pin moved to the center of the map.',{exact:true}).waitFor();
    await scan(page,'pin-placement');await page.locator('#cancel-court-pin').click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'add-court');
    await page.locator('.bottom-nav [data-tab=games]').click();await scan(page,'games-dark');
    await page.locator('#sample-game-plan').evaluate(e=>e.open=true);await scan(page,'sample-games-dark');
    await page.locator('#appearance-toggle').click();await scan(page,'sample-games-light');
    await page.locator('#menu-toggle').click();await scan(page,'navigation-menu');
    
    await page.locator('#close-app-menu').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'menu-toggle');
    await page.locator('#location-updates summary').click();
    await page.locator('#pause-updates').click();
    assert.equal(await page.locator('#pause-updates').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>localStorage.getItem('bucketlist-updates-paused')),'true');
    await page.locator('#refresh-updates').click();
    assert.equal(await page.locator('#pause-updates').getAttribute('aria-pressed'),'true');
    await page.locator('#pause-updates').click();
    await page.locator('#dismiss-location-updates').click();
    assert.equal(await page.evaluate(()=>document.activeElement.matches('#location-updates summary')),true);
    const native=await context.newPage();native.on('pageerror',e=>errors.push(e.message));
    await native.goto(shared+'/play/?action=add&lat=33.516&lng=-111.909&park=Accessibility%20Fixture%20Park&city=Scottsdale');
    await native.getByRole('link',{name:'Continue with ChatGPT',exact:true}).waitFor();await scan(native,'play-signin');
    await native.getByRole('link',{name:'Continue with ChatGPT',exact:true}).click();
    await native.getByLabel('Your name or nickname').fill('Fixture Alice');
    await native.getByRole('button',{name:'Continue',exact:true}).click();
    
    await native.getByLabel('Park name',{exact:true}).waitFor();await scan(native,'court-form');
    await native.getByLabel('Latitude',{exact:true}).fill('0');
    await native.getByLabel('Longitude',{exact:true}).fill('0');
    await native.getByRole('button',{name:'Update pin from coordinates',exact:true}).click();
    assert.equal(await native.locator('.error').evaluate(e=>e===document.activeElement),true);
    assert.equal(await native.getByLabel('Latitude',{exact:true}).getAttribute('aria-invalid'),'true');
    await scan(native,'court-coordinate-error');
    await native.getByLabel('Latitude',{exact:true}).fill('33.5159');
    await native.getByLabel('Longitude',{exact:true}).fill('-111.9089');
    // Save must honor typed coordinates even when the separate Update pin button was not pressed.
    await native.locator('.pin-location').scrollIntoViewIfNeeded();
    await native.screenshot({path:'accessibility-report/court-coordinates.png'});
    console.log('A11Y_IMAGE court-coordinates '+(await native.screenshot({type:'jpeg',quality:52})).toString('base64'));
    await native.getByLabel('Court name',{exact:true}).fill('North basketball court');
    await native.locator('[name=placed]').check();await native.getByRole('button',{name:'Save court',exact:true}).click();
    
    await native.locator('#app h1').filter({hasText:'North basketball court'}).waitFor();
    const courtId=new URL(native.url()).searchParams.get('court');
    const saved=await (await context.request.get(shared+'/api/public/courts/'+courtId)).json();
    assert.equal(saved.court.lat,33.5159);assert.equal(saved.court.lng,-111.9089);
    await scan(native,'court-page');
    await native.getByRole('button',{name:'Schedule a game here',exact:true}).click();await scan(native,'game-form');
    await native.getByLabel('Game title',{exact:true}).fill('Accessibility fixture game');
    await native.getByRole('button',{name:'Create shared game',exact:true}).click();
    await native.locator('#app h1').filter({hasText:'Accessibility fixture game'}).waitFor();await scan(native,'shared-game');
    await native.goto(shared+'/community/');await native.getByRole('button',{name:'Create a group',exact:true}).click();
    await scan(native,'create-group-dialog');
    await native.getByLabel('Group name').fill('Accessibility fixture group');
    await native.locator('#modal').getByRole('button',{name:'Create group',exact:true}).click();
    await native.locator('.invite-link').waitFor();await native.getByRole('button',{name:'Close',exact:true}).click();
    await native.getByLabel('Your message').fill('Fixture message for accessibility checks.');
    await native.getByRole('button',{name:'Send',exact:true}).click();await native.getByText('Fixture message for accessibility checks.',{exact:true}).waitFor();
    
    const groupHash=new URL(native.url()).hash;
    await native.locator('.skip-link').focus();await native.keyboard.press('Enter');
    assert.equal(await native.evaluate(()=>document.activeElement.id),'app');
    assert.equal(new URL(native.url()).hash,groupHash);
    const closeGroup=native.getByRole('button',{name:'Group details',exact:true});
    await closeGroup.focus();await native.keyboard.press('Enter');
    await native.locator('#modal').waitFor({state:'visible'});assert.equal(await native.locator('#modal').evaluate(e=>e.open),true);
    await native.keyboard.press('Escape');
    assert.equal(await closeGroup.evaluate(e=>e===document.activeElement),true);
    await native.locator('#pause-updates').click();
    assert.equal(await native.locator('#pause-updates').getAttribute('aria-pressed'),'true');
    const bob=await browser.newContext({extraHTTPHeaders:{Origin:shared}});await bob.addCookies([{url:shared,name:'community-local-user',value:'bob'}]);
    assert.equal((await bob.request.post(shared+'/api/community/profile',{data:{name:'Fixture Bob'}})).ok(),true);
    const groupId=groupHash.split('=')[1];
    const detail=await (await context.request.get(shared+'/api/community/groups/'+groupId)).json();
    const joined=await bob.request.post(shared+'/api/community/join',{data:{code:detail.group.invite_code}});
    assert.equal(joined.ok(),true);
    await bob.request.post(shared+'/api/community/groups/'+groupId+'/messages',{data:{body:'A new fixture message while updates are paused.',clientId:crypto.randomUUID()}});
    await native.waitForTimeout(3300);
    assert.equal(await native.getByText('A new fixture message while updates are paused.',{exact:true}).count(),0);
    const deleteOwn=native.getByRole('button',{name:/Delete message from you sent/});
    await deleteOwn.focus();
    await native.locator('#refresh-updates').evaluate(e=>e.click());
    await native.getByText('A new fixture message while updates are paused.',{exact:true}).waitFor();
    assert.equal(await deleteOwn.evaluate(e=>e===document.activeElement),true,'Message refresh keeps keyboard focus on the same message');
    await native.locator('#pause-updates').click();await bob.close();
    await scan(native,'chat-light');await native.locator('#theme').click();await scan(native,'chat-dark');
    await page.locator('.bottom-nav [data-tab=discover]').click();await page.locator('#court-list-view').click();
    for(const p of [page,native]){
      await p.setViewportSize({width:320,height:844});
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'320px horizontal overflow: '+p.url());
      await p.evaluate(()=>{for(const e of document.querySelectorAll('*')){e.style.setProperty('line-height','1.5','important');e.style.setProperty('letter-spacing','.12em','important');e.style.setProperty('word-spacing','.16em','important');if(e.tagName==='P')e.style.setProperty('margin-bottom','2em','important');}});
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Text spacing overflow: '+p.url());
    }
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
  fs.writeFileSync('accessibility-report/results.json',JSON.stringify(report,null,2));
  console.log('Accessibility findings: '+(failures.join('; ')||'No automated WCAG A/AA violations in covered states.'));
  if(failures.length)throw Error(failures.length+' scanned states have accessibility violations.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  fs.writeFileSync('accessibility-report/results.json',JSON.stringify(report,null,2));
  for(const p of children)p.kill();
});
