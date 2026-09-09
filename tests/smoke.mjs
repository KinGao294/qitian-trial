import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:800,height:600}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:5173');await page.waitForTimeout(1500);await page.screenshot({path:'tests/title.png'});await page.click('#start');await page.waitForTimeout(500);
const snap=()=>page.evaluate(()=>window.__trial);
assert.equal((await snap()).running,true);
await page.keyboard.press('Space');await page.waitForTimeout(200);assert.ok((await snap()).player[1]>.2,'jump rises');await page.waitForFunction(()=>window.__trial.grounded,{},{timeout:15000});assert.equal((await snap()).grounded,true);
await page.screenshot({path:'tests/gameplay.png'});
// Fight using only keyboard inputs, with a read-only snapshot to steer toward enemies.
for(let i=0;i<500;i++){
 const s=await snap();if(!s.running)break;
 const target=s.enemies.filter(e=>!e.dead).sort((a,b)=>Math.hypot(a.position[0]-s.player[0],a.position[2]-s.player[2])-Math.hypot(b.position[0]-s.player[0],b.position[2]-s.player[2]))[0];if(!target)break;
 const wx=target.position[0]-s.player[0],wz=target.position[2]-s.player[2];const dx=wx*Math.cos(s.yaw)-wz*Math.sin(s.yaw),dz=wx*Math.sin(s.yaw)+wz*Math.cos(s.yaw);const wanted=[];if(i%25===0)console.log('step',i,'hp',s.hp,'kills',s.kills);
 if(Math.hypot(dx,dz)>2){if(Math.abs(dx)>.7)wanted.push(dx>0?'KeyD':'KeyA');if(Math.abs(dz)>.7)wanted.push(dz>0?'KeyS':'KeyW');}
 for(const k of ['KeyW','KeyA','KeyS','KeyD'])if(wanted.includes(k))await page.keyboard.down(k);else await page.keyboard.up(k);
 await page.keyboard.press('KeyJ');await page.waitForTimeout(120);
}
for(const k of ['KeyW','KeyA','KeyS','KeyD'])await page.keyboard.up(k);
const final=await snap();console.log('Combat result',final);assert.equal(final.kills,7,'clear all enemies through actual attacks');await page.screenshot({path:'tests/victory.png'});await page.click('#start');await page.waitForTimeout(200);assert.equal((await snap()).kills,0);assert.equal((await snap()).hp,100);
// Stand in range to verify damage and defeat.
await page.keyboard.down('KeyW');await page.waitForTimeout(1200);await page.keyboard.up('KeyW');await page.waitForTimeout(22000);const loss=await snap();console.log('Damage result',loss.hp);assert.ok(loss.hp<100);assert.deepEqual(errors,[]);await browser.close();
