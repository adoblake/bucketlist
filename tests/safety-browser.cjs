// Browser check for community rules, reporting, blocking, moderation, suspension, and account deletion.
// Run against the local Worker: npm run build:community && PORT=3120 MODERATOR_IDS=chatgpt:local-mod node scripts/community-local.mjs
const {chromium}=require('playwright');const assert=require('node:assert/strict');
const url=process.env.COMMUNITY_URL||'http://127.0.0.1:3120/community/',origin=new URL(url).origin,run=Date.now().toString(36),spam='spam-'+run+'.example';
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});try{
 const errors=[],pages={};
 async function person(id,name,theme='light'){const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{url:origin,name:'community-local-user',value:id}]);await context.addInitScript(t=>{localStorage.setItem('bucketlist-theme',t);window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective));},theme);const page=await context.newPage();page.on('pageerror',e=>errors.push(name+': '+e.message));page.on('dialog',d=>d.accept());pages[name]=page;return page;}
 async function signUp(page,name,target=url){await page.goto(target,{waitUntil:'domcontentloaded'});await page.getByLabel('Your name or nickname').waitFor();const notice=page.locator('#app .legal');assert.match(await notice.innerText(),/Community rules.*Privacy policy/s);assert.equal(await notice.getByRole('link',{name:'Community rules'}).getAttribute('href'),'/legal/terms');await page.getByLabel('Your name or nickname').fill(name);await page.getByRole('button',{name:'Continue',exact:true}).click();}
 const alice=await person('alice-'+run,'Alice'),bob=await person('bob-'+run,'Bob','dark'),mod=await person('mod','Mod');
 await signUp(alice,'Alice');await alice.getByRole('button',{name:'Create a group',exact:true}).click();await alice.getByLabel('Group name').fill('Safety run '+run);await alice.locator('#modal').getByRole('button',{name:'Create group',exact:true}).click();
 const invite=await alice.locator('.invite-link').innerText();await alice.locator('#close-modal').click();
 await signUp(bob,'Bob',invite);await bob.getByRole('button',{name:'Join this group',exact:true}).click();await bob.getByLabel('Your message').fill('Buy followers at '+spam);await bob.getByRole('button',{name:'Send',exact:true}).click();await bob.locator('.message').first().waitFor();
 assert.equal(await bob.locator('.message-more').count(),0,'no report button on your own messages');

 // Report and block from the message.
 await alice.waitForFunction(t=>document.querySelector('#messages')?.textContent.includes(t),spam,{timeout:15000});
 await alice.getByRole('button',{name:'Report or block',exact:true}).click();await alice.getByRole('button',{name:'Report this message',exact:true}).click();
 await alice.locator('#modal').getByRole('button',{name:'Send report',exact:true}).click();assert.equal(await alice.locator('#modal select').evaluate(s=>s.checkValidity()),false,'a reason is required');assert.ok(await alice.locator('#modal').isVisible());
 await alice.getByLabel('Why are you reporting this message?').selectOption('spam');await alice.locator('#modal').getByRole('button',{name:'Send report',exact:true}).click();await alice.waitForFunction(()=>/report was sent/.test(document.querySelector('#status').textContent));
 await alice.screenshot({path:(process.env.QA_OUT||require('node:os').tmpdir()+'/bucketlist-qa')+'/safety/reported.png'});
 await alice.getByRole('button',{name:'Report or block',exact:true}).click();await alice.getByRole('button',{name:'Block Bob',exact:true}).click();
 await alice.waitForFunction(t=>!document.querySelector('#messages').textContent.includes(t),spam);
 await alice.getByRole('button',{name:'Group details',exact:true}).click();await alice.locator('#modal-title',{hasText:'Safety run'}).waitFor();await alice.locator('#modal').getByText('Blocked by you').waitFor();await alice.locator('#close-modal').click();
 await alice.getByRole('button',{name:'Account',exact:true}).click();await alice.locator('#modal').getByText('Bob',{exact:true}).waitFor();await alice.locator('#modal').getByRole('button',{name:'Unblock',exact:true}).click();await alice.locator('#close-modal').click();
 await alice.waitForFunction(t=>document.querySelector('#messages').textContent.includes(t),spam,{timeout:15000});

 // Moderator removes the message and suspends its author.
 await mod.goto(url,{waitUntil:'domcontentloaded'});await mod.locator('#app input[name=name], #app .user-bar').first().waitFor();if(await mod.locator('#app input[name=name]').isVisible()){await mod.getByLabel('Your name or nickname').fill('Mod');await mod.getByRole('button',{name:'Continue',exact:true}).click();}await mod.getByRole('button',{name:'Review reports',exact:true}).click();const card=mod.locator('.report').filter({hasText:spam});await card.waitFor();assert.match(await card.innerText(),/Spam or scam/i);assert.match(await card.innerText(),/Reported by Alice/);
 await mod.screenshot({path:(process.env.QA_OUT||require('node:os').tmpdir()+'/bucketlist-qa')+'/safety/moderation.png'});
 await card.getByRole('button',{name:'Remove & suspend',exact:true}).click();await mod.waitForFunction(t=>!document.querySelector('#app').textContent.includes(t),spam);
 await alice.waitForFunction(t=>!document.querySelector('#messages').textContent.includes(t),spam,{timeout:15000});

 // The suspended author is told why, cannot post, and can still delete the account.
 await bob.reload({waitUntil:'domcontentloaded'});await bob.getByText('Your account is suspended').waitFor();
 await bob.getByRole('button',{name:'Account',exact:true}).click();await bob.getByRole('button',{name:'Delete my account…',exact:true}).click();
 await bob.getByLabel('Type DELETE to confirm').fill('nope');await bob.getByRole('button',{name:'Permanently delete my account',exact:true}).click();await bob.locator('#modal .error',{hasText:'DELETE'}).waitFor();
 await bob.getByLabel('Type DELETE to confirm').fill('delete');await bob.getByRole('button',{name:'Permanently delete my account',exact:true}).click();
 await bob.getByRole('link',{name:'Continue with ChatGPT',exact:true}).waitFor({timeout:15000});
 await alice.getByRole('button',{name:'Group details',exact:true}).click();await alice.locator('#modal-title',{hasText:'Safety run'}).waitFor();await alice.locator('#modal .member').first().waitFor();assert.doesNotMatch(await alice.locator('#modal').innerText(),/Bob/);await alice.locator('#close-modal').click();

 // Legal pages load under their own CSP, in both themes.
 for(const [page,path,heading] of [[alice,'/legal/privacy','Privacy policy'],[bob,'/legal/delete-account','Delete your Bucketlist account'],[alice,'/legal/terms','Community rules & terms']]){const r=await page.goto(origin+path);assert.equal(r.status(),200);assert.equal(await page.getByRole('heading',{level:1}).innerText(),heading);assert.deepEqual(await page.evaluate(()=>window.__csp),[]);for(const width of [320,1280]){await page.setViewportSize({width,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path+' fits '+width);}}
 assert.equal(await bob.evaluate(()=>document.documentElement.dataset.theme),'dark');
 for(const page of [alice,mod])assert.deepEqual(await page.evaluate(()=>window.__csp||[]),[]);
 assert.deepEqual(errors,[]);
 console.log('PASS: rules notice at sign-up, message report with required reason, block/unblock with hidden messages, moderator removal + suspension, suspended notice, typed-confirmation account deletion with sign-out and roster removal, legal pages under CSP at 320–1280px in light/dark.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
