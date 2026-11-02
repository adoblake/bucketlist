import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
let server;
before(async()=>{server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3087'},stdio:['ignore','pipe','pipe']});await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Server exited before startup');}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Server startup timeout')),5000);t.unref();})]);});
after(()=>server?.kill());
test('serves the discovery page and its executable assets',async()=>{const page=await fetch('http://127.0.0.1:3087');assert.equal(page.status,200);assert.match(await page.text(),/id="court-map"/);for(const path of ['/game-plan.js','/game-plan.css','/ui-icons.js','/court-photos.js','/arizona.js','/location.js','/app.js','/domain.js','/directory.js','/demo.js','/schedule.js','/city-data.js','/data/phoenix-courts.js','/markercluster.js','/markercluster.css','/styles.css','/leaflet.js','/leaflet.css']){const res=await fetch('http://127.0.0.1:3087'+path);assert.equal(res.status,200);assert.ok((await res.text()).length>100);}});
test('does not expose repository files',async()=>{for(const path of ['/package.json','/.git/config','/server.js'])assert.equal((await fetch('http://127.0.0.1:3087'+path)).status,404);});
