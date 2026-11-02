const {chromium}=require('playwright');const assert=require('node:assert/strict');
const url=process.env.COMMUNITY_URL||'http://127.0.0.1:3120/community/';
// Browser UI contract with a fake same-origin API. Server auth is covered with
// the real Supabase SDK + mock transport in email-auth.test.js. No emails sent.
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
 let signedIn=false,profile=null,failSend=true,failVerify=true;const invite='a'.repeat(48);
 await page.route('**/api/community/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.replace('/api/community',''),body=request.postDataJSON();calls.push({path,method:request.method(),body});
  let status=200,data;
  if(path==='/me')data={signedIn,user:signedIn?{id:'email:browser-player',method:'email',profile}:null,auth:{email:true},signIn:'/signin-with-chatgpt?return_to=%2Fcommunity%2F',signOut:null};
  else if(path==='/auth/email/start'){if(failSend){failSend=false;status=503;data={error:'Email sign-in is temporarily unavailable. Please try again shortly.'};}else data={ok:true,resendAfter:60};}
  else if(path==='/auth/email/verify'){if(failVerify){failVerify=false;status=400;data={error:'That code is incorrect or has expired. Check your latest email, or ask for a new code.'};}else{signedIn=true;data={ok:true};}}
  else if(path==='/profile'){profile={id:'email:browser-player',name:body.name};data={profile};}
  else if(path==='/groups')data={groups:[]};
  else if(path==='/invites/'+invite)data={group:{id:'browser-group',name:'Your invited crew',description:'A group for our park.',member_count:2}};
  else if(path==='/auth/email/signout'){signedIn=false;profile=null;data={ok:true};}
  else throw Error('Unexpected UI API request: '+path);
  await route.fulfill({status,json:data});
 });
 await page.goto(url+'#invite='+invite);await page.getByRole('button',{name:'Continue with email',exact:true}).waitFor();assert.equal(calls.some(c=>c.path.endsWith('/start')),false,'no email sent on page open');
 assert.equal(await page.getByRole('link',{name:'Continue with ChatGPT',exact:true}).count(),1);assert.equal(await page.getByRole('link',{name:'Use Google through ChatGPT',exact:true}).count(),1);
 await page.locator('#help').click();await page.getByText(/No password or ChatGPT account is needed/).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Continue with email',exact:true}).click();const email=page.getByLabel('Email address',{exact:true});assert.equal(await email.getAttribute('type'),'email');assert.equal(await email.getAttribute('autocomplete'),'email');await email.fill('player@example.test');
 await page.getByRole('button',{name:'Email me a code',exact:true}).click();await page.locator('#modal .error').filter({hasText:'temporarily unavailable'}).waitFor();assert.equal(await email.inputValue(),'player@example.test');
 await page.getByRole('button',{name:'Email me a code',exact:true}).click();await page.getByRole('heading',{name:'Check your email',exact:true}).waitFor();
 const code=page.getByLabel('Email code',{exact:true});assert.equal(await code.getAttribute('autocomplete'),'one-time-code');assert.equal(await code.getAttribute('inputmode'),'numeric');assert.equal(await page.getByRole('button',{name:/Send another code/}).isDisabled(),true);
 await code.fill('654321');await page.getByRole('button',{name:'Verify & continue',exact:true}).click();await page.locator('#modal .error').filter({hasText:'incorrect or has expired'}).waitFor();assert.equal(await code.inputValue(),'654321');
 await page.getByRole('button',{name:'Use a different email',exact:true}).click();assert.equal(await email.inputValue(),'player@example.test');await page.getByRole('button',{name:'Email me a code',exact:true}).click();await page.getByRole('heading',{name:'Check your email',exact:true}).waitFor();
 await page.screenshot({path:'/workspace/work/community-qa/email-code-light.png'});await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('#theme').click();await page.screenshot({path:'/workspace/work/community-qa/email-sign-in-dark.png'});await page.getByRole('button',{name:'Continue with email',exact:true}).click();await page.getByRole('heading',{name:'Check your email',exact:true}).waitFor();
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Overflow at '+width);assert.equal(await page.locator('#modal').evaluate(d=>d.scrollWidth<=d.clientWidth),true,'Modal overflow at '+width);}
 await page.setViewportSize({width:390,height:844});await code.fill('123456');await page.getByRole('button',{name:'Verify & continue',exact:true}).click();await page.getByRole('heading',{name:'What should we call you?',exact:true}).waitFor();
 await page.getByLabel('Your name or nickname').fill('Avery');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Your invitation',exact:true}).waitFor();await page.getByText('Your invited crew',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>sessionStorage.getItem('bucketlist-pending-invite')),invite);
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Continue with email',exact:true}).waitFor();assert.equal(signedIn,false);assert.deepEqual(errors,[]);
 console.log('PASS: email signup/login UI, errors and retry, resend cooldown, change address, code autocomplete, light/dark, 320–1280px, preserved invitation, display name, signout; native options remain present. API mocked; no mail sent.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
