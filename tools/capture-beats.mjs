// Frame-strip capture: step the simulation a fixed number of frames at a time and screenshot each
// stop, so the result is a real slow-motion playback of the animation rather than a lucky still.
//
// The trigger, the stepping and the freeze all happen inside one synchronous page.evaluate: the
// render loop advances the simulation by itself, and a software-rendered frame takes long enough
// that the pose would be somewhere else entirely by the time the shot came back. Freezing uses the
// real pause path, so nothing (including the boss) moves during the seconds the shot takes.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.env.SHOT_DIR ?? '/tmp/strips';
const W = Number(process.env.SHOT_W ?? 760), H = Number(process.env.SHOT_H ?? 560);
const only = process.env.ONLY ?? '';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('http://localhost:5173/qitian-trial/');
await page.waitForFunction(() => window.__trial?.artReady, {}, { timeout: 60000 });
await page.click('#start');
await page.waitForFunction(() => window.__trial.running, {}, { timeout: 20000 });

const snap = () => page.evaluate(() => window.__trial);
const step = (s, d = 1 / 60) => page.evaluate(([a, b]) => window.__trial.step(a, b), [s, d]);
const resume = () => page.evaluate(() => { document.getElementById('start').click(); });
const hide = () => page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  for (const l of document.querySelectorAll('.enemy-label')) l.style.display = 'none';
});
/**
 * Let the camera catch up. It lerps toward its target at `1-exp(-dt*8)` per rendered frame, and a
 * software-rendered frame here takes about a second — so after moving the warrior the camera is
 * still tens of frames behind. Once it has converged the look point is the warrior's chest, which
 * puts him at the exact centre of every frame and makes a fixed crop possible.
 */
const settleCamera = async (ms = 26000) => { await page.waitForTimeout(ms); };
const hold = async (key, steps, each = 4) => {
  await page.keyboard.down(key);
  for (let i = 0; i < steps; i++) await step(each);
  await page.keyboard.up(key);
};
const dist = async () => {
  const s = await snap(), b = s.enemies[0].position;
  return Math.hypot(s.player[0] - b[0], s.player[2] - b[2]);
};

/** Advance `frames`, freeze, shoot. `trigger` is JS run in the page immediately before stepping. */
async function frame(name, trigger, frames) {
  await page.evaluate(([t, n]) => {
    new Function(t)();
    window.__trial.step(n, 1 / 60);
    window.dispatchEvent(new Event('blur'));
  }, [trigger, frames]);
  await hide();
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 });
  await resume();
  await hide();
}
async function strip(label, trigger, count, every) {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await hide();
  await settleCamera();
  await page.evaluate(() => { document.getElementById('start').click(); });
  await hide();
  const t0 = Date.now();
  for (let i = 0; i < count; i++) {
    await frame(`${label}_${String(i).padStart(2, '0')}`, i === 0 ? trigger : '0', every);
    process.stdout.write(`\r${label} ${i + 1}/${count} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  console.log('');
}

const J = "window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyJ'}))";
const K = "window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyK'}))";
const force = m => `window.__trial.forceBossMove('${m}')`;
const want = s => !only || only.split(',').includes(s);

// Stand off to the right and side-on to the camera: past the 4.6m auto-face range the swing keeps
// the facing it started with, so the body is seen in profile instead of from behind.
await hold('KeyD', 9);
await hold('KeyW', 12);
for (let i = 0; i < 25; i++) { if (await dist() < 10.5) await hold('KeyS', 2); else break; }
await hold('KeyD', 2);
await step(30);
await hide();
console.log('player at', (await dist()).toFixed(1), 'm from the boss');

// 横扫破风, 0.48s over 15 frames of 2 sim steps.
if (want('sweep')) { await strip('sweep', J, 12, 3); await step(40); }

// 定海神针, 0.95s. The apex freeze and the burst add hitstop, so this runs slightly long on purpose.
if (want('ult')) {
  for (let i = 0; i < 25; i++) { if (await dist() < 11.5) await hold('KeyS', 2); else break; }
  await hold('KeyD', 2);
  await step(20);
  await strip('ult', K, 13, 5);
  await step(60);
}

// The three boss tells, one frame each: the beats that live in a single readable frame rather than
// in a sequence. Frame counts are phases of each move's own wind-up (see `BOSS_MOVES`).
if (want('tells')) {
  for (let i = 0; i < 40; i++) { const d = await dist(); if (d > 6.4) await hold('KeyW', 2); else break; }
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await hide();
  await settleCamera();
  await page.evaluate(() => { document.getElementById('start').click(); });
  await hide();
  for (const [name, move, frames] of [
    ['tell_fire_inhale', 'fire', 47],   // wind 0.9s, held tremor near the end of the intake
    ['tell_fire_eruption', 'fire', 55], // just past the muzzle ring, head still kicked back
    ['tell_swipe_coil', 'swipe', 32],   // wind 0.6s, wound and holding
    ['tell_slam_top', 'slam', 50],      // wind 0.95s, at the top with the inner ring nearly shut
  ]) {
    await frame(name, force(move), frames);
    for (let i = 0; i < 250; i++) { const b = await page.evaluate(() => window.__trial.boss()); if (b.move === null && b.cool > 0.9) break; await step(6); }
    console.log('shot', name);
  }
}

// 巨掌砸地, from the top of the wind-up through the impact. Stand just outside the ring: the palm
// and the crater still fill the frame, but the hurt vignette does not wash the whole shot red.
if (want('slam')) {
  for (let i = 0; i < 40; i++) { const d = await dist(); if (d > 7.6) await hold('KeyW', 2); else if (d < 7) await hold('KeyS', 2); else break; }
  // Wait out whatever the boss is already doing, so its last effect is not still on screen.
  for (let i = 0; i < 300; i++) { const b = await page.evaluate(() => window.__trial.boss()); if (b.move === null && b.cool > 0.9) break; await step(6); }
  await step(20);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await hide();
  await settleCamera();
  await page.evaluate(() => { document.getElementById('start').click(); });
  await hide();
  await frame('slam_00', force('slam'), 30);
  for (let i = 1; i < 12; i++) { await frame(`slam_${String(i).padStart(2, '0')}`, '0', 5); process.stdout.write(`\rslam ${i + 1}/12`); }
  console.log('');
  for (let i = 0; i < 200 && (await page.evaluate(() => window.__trial.boss())).move !== null; i++) await step(6);
}

console.log('done');
await browser.close();
