import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:800,height:600}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:5173/qitian-trial/');await page.waitForFunction(()=>window.__trial?.artReady);await page.screenshot({path:'tests/title.png',timeout:180000});await page.click('#start');
const snap=()=>page.evaluate(()=>window.__trial);
// Input stays real (keyboard events on the page); only the clock is driven by hand. Software
// rendering draws about one frame a second here, so sleeping would test nothing at all.
const step=(steps=6)=>page.evaluate(n=>window.__trial.step(n,1/60),steps);
assert.equal((await snap()).running,true);
    10|await page.keyboard.press('Space');await step(10);assert.ok((await snap()).player[1]>.2,'jump rises');
for(let i=0;i<200&&!(await snap()).grounded;i++)await step(4);assert.equal((await snap()).grounded,true);
await page.screenshot({path:'tests/gameplay.png',timeout:180000});
// Fight using only keyboard inputs, with a read-only snapshot to steer toward enemies.
for(let i=0;i<500;i++){
 const s=await snap();if(!s.running)break;
 const target=s.enemies.filter(e=>!e.dead).sort((a,b)=>Math.hypot(a.position[0]-s.player[0],a.position[2]-s.player[2])-Math.hypot(b.position[0]-s.player[0],b.position[2]-s.player[2]))[0];if(!target)break;
 const wx=target.position[0]-s.player[0],wz=target.position[2]-s.player[2];const dx=wx*Math.cos(s.yaw)-wz*Math.sin(s.yaw),dz=wx*Math.sin(s.yaw)+wz*Math.cos(s.yaw);const wanted=[];if(i%25===0)console.log('step',i,'hp',Math.round(s.hp),'boss',Math.round(s.enemies[0].hp),'kills',s.kills);
 if(Math.hypot(dx,dz)>2){if(Math.abs(dx)>.7)wanted.push(dx>0?'KeyD':'KeyA');if(Math.abs(dz)>.7)wanted.push(dz>0?'KeyS':'KeyW');}
 for(const k of ['KeyW','KeyA','KeyS','KeyD'])if(wanted.includes(k))await page.keyboard.down(k);else await page.keyboard.up(k);
    20| await page.keyboard.press('KeyJ');await step(7);
}
for(const k of ['KeyW','KeyA','KeyS','KeyD'])await page.keyboard.up(k);
const final=await snap();console.log('Combat result hp',Math.round(final.hp),'kills',final.kills);assert.equal(final.kills,1,'defeat boss through actual attacks');await page.screenshot({path:'tests/victory.png',timeout:180000});await page.click('#start');await step(4);assert.equal((await snap()).kills,0);assert.equal((await snap()).hp,100);
// Stand in range to verify the boss can still punish a player who never dodges.
await page.keyboard.down('KeyW');await step(150);await page.keyboard.up('KeyW');
for(let i=0;i<120&&(await snap()).hp===100;i++)await step(30);
const loss=await snap();console.log('Damage result',Math.round(loss.hp));assert.ok(loss.hp<100,'the boss lands hits on a passive player');assert.deepEqual(errors,[]);await browser.close();
