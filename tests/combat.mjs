import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

// Combat smoke: proves the warrior's skeleton actually animates (run / jump / attack / ultimate)
// and that every boss move telegraphs from the right place with a hitbox that matches its visual.
//
// Software rendering in CI draws roughly one frame per second, so the simulation is advanced through
// `__trial.step()` instead of wall-clock waits; sampling stays deterministic and the run finishes in
// seconds. Screenshots are taken sparingly because each one forces a real (slow) render.
const base = process.env.TRIAL_URL ?? 'http://localhost:5173/qitian-trial/';
const shots = process.env.TRIAL_SHOTS !== '0';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.text().startsWith('[trial]')) console.log(m.text()); });

await page.goto(base);
await page.waitForFunction(() => window.__trial?.artReady, {}, { timeout: 60000 });
await page.click('#start');
await page.waitForFunction(() => window.__trial.running, {}, { timeout: 20000 });

const step = (steps = 1, dt = 1 / 60) => page.evaluate(([s, d]) => window.__trial.step(s, d), [steps, dt]);
const pose = () => page.evaluate(() => window.__trial.pose());
const boss = () => page.evaluate(() => window.__trial.boss());
const shot = async name => { if (shots) await page.screenshot({ path: `tests/${name}.png`, timeout: 180000 }); };
const spread = xs => Math.max(...xs) - Math.min(...xs);
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const jointDeg = (p, part) => p.joints.find(j => j.part === part)?.deg ?? 0;
async function sample(count, stepsEach = 3) {
  const out = [];
  for (let i = 0; i < count; i++) { await step(stepsEach); out.push(await pose()); }
  return out;
}

// Let the damped idle settle on the simulation clock. How many real frames rendered before this
// point depends on machine load, and half-blended arms are not what the guard assertion is about.
await step(30);
const idle = await pose();
assert.ok(idle, 'the player rig resolved from the Tripo skeleton');
assert.equal(idle.toes.length, 2, 'both legs are driven by the rig');
assert.equal(idle.hands.length, 2, 'both arms are driven by the rig');
console.log('idle', idle.joints.map(j => `${j.part}=${j.deg.toFixed(0)}`).join(' '));
// The idle keeps the verified standing bind: legs untouched, arms out of the T-pose.
assert.ok(jointDeg(idle, 'hipL') < 2 && jointDeg(idle, 'hipR') < 2, 'idle leaves the legs on the bind pose');
assert.ok(Math.min(jointDeg(idle, 'armL'), jointDeg(idle, 'armR')) > 12, 'idle brings the arms down into a guard');

// ...and it has to keep breathing. Sampled in-page a frame at a time: the torso must never settle
// on one pose, while the legs must never leave the bind by even a hundredth of a degree.
const idleTrace = await page.evaluate(() => {
  const rows = [], at = (p, part) => p.joints.find(j => j.part === part).deg;
  for (let i = 0; i < 150; i++) {
    window.__trial.step(1, 1 / 60);
    const p = window.__trial.pose();
    rows.push({ chest: at(p, 'chest'), head: at(p, 'head'), hip: Math.max(at(p, 'hipL'), at(p, 'hipR')), bob: p.root.bob });
  }
  return rows;
});
const idleChest = spread(idleTrace.map(r => r.chest)), idleHead = spread(idleTrace.map(r => r.head));
const idleHip = Math.max(...idleTrace.map(r => r.hip)), idleBob = spread(idleTrace.map(r => r.bob));
console.log(`idle drift: chest ${idleChest.toFixed(2)}° head ${idleHead.toFixed(2)}° bob ${idleBob.toFixed(3)}m, legs off bind by ${idleHip.toFixed(4)}°`);
assert.ok(idleChest > 0.4 && idleHead > 0.4, `the idle keeps breathing (chest ${idleChest.toFixed(2)}°, head ${idleHead.toFixed(2)}°)`);
assert.ok(idleBob > 0.004 && idleBob < 0.04, `the chest rises without lifting the body off the floor (${idleBob.toFixed(3)}m)`);
assert.ok(idleHip < 0.05, `2.5s of idle never touches the leg chain (worst ${idleHip.toFixed(4)}°)`);

// --- the shape of a swing: anticipation, a held beat, then one fastest moment ---
// This is what separates a weighted strike from a limb sliding between two poses, and it is only
// visible frame by frame — cross-process sampling smears the beats together. Angular *rate* is the
// honest signal: a pose that has stopped moving has a rate near zero however far from rest it is.
const swing = await page.evaluate(() => {
  const rows = [], rate = (p, part) => p.joints.find(j => j.part === part).rate;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
  for (let i = 0; i < 34; i++) {
    window.__trial.step(1, 1 / 60);
    const p = window.__trial.pose();
    rows.push({
      reach: Math.max(...p.hands.map(h => h.z)),
      pelvis: rate(p, 'pelvis'),
      elbow: Math.max(rate(p, 'elbowR'), rate(p, 'elbowL')),
    });
  }
  return rows;
});
const swingReach = swing.map(r => r.reach), elbowRate = swing.map(r => r.elbow);
const iBack = swingReach.indexOf(Math.min(...swingReach)), iOut = swingReach.indexOf(Math.max(...swingReach));
const fastest = Math.max(...elbowRate), iFastest = elbowRate.indexOf(fastest);
const medianRate = [...elbowRate].sort((a, b) => a - b)[Math.floor(elbowRate.length / 2)];
// The quietest frame between winding back and the strike is the held beat.
const stillest = Math.min(...elbowRate.slice(iBack, iFastest));
console.log(`swing: hand back at frame ${iBack} (${Math.min(...swingReach).toFixed(2)}m), out at ${iOut} (${Math.max(...swingReach).toFixed(2)}m)`);
console.log(`swing elbow rate: held ${stillest.toFixed(2)} rad/s → peak ${fastest.toFixed(1)} rad/s at frame ${iFastest} (median ${medianRate.toFixed(1)})`);
assert.ok(iBack > 0 && iBack < iOut, `the hand winds back before it drives out (back at ${iBack}, out at ${iOut})`);
assert.ok(Math.min(...swingReach) < swingReach[0] - 0.02, 'the wind-up pulls the guard hand back, not just sideways');
assert.ok(stillest < fastest * 0.15,
  `the wind-up parks on a held beat before the strike (${stillest.toFixed(2)} vs peak ${fastest.toFixed(1)} rad/s)`);
assert.ok(fastest > medianRate * 3.5,
  `the strike has one moment where it is fastest (peak ${fastest.toFixed(1)} vs median ${medianRate.toFixed(1)} rad/s)`);
// Kinetic chain: on the frame the strike is quickest, the light link is whipping and the heavy one
// is still catching up. A single blend rate for every bone cannot produce that gap.
assert.ok(swing[iFastest].elbow > swing[iFastest].pelvis * 2,
  `the elbow whips while the pelvis lags (${swing[iFastest].elbow.toFixed(1)} vs ${swing[iFastest].pelvis.toFixed(1)} rad/s)`);
for (let i = 0; i < 40 && (await page.evaluate(() => window.__trial.attack)) >= 0; i++) await step(4);
await step(60); // let the combo timer lapse, so the swing sampled later on is 横扫破风 too

// --- run: the stride has to swing the legs, not slide a frozen pose across the courtyard ---
await page.keyboard.down('KeyW');
const running = await sample(16, 3);
await shot('combat-run');
await page.keyboard.up('KeyW');
const startZ = idle.toes[0].z;
console.log('run', running.map(p => p.toes.map(t => t.z.toFixed(2)).join('/')).join(' '));
for (const side of [-1, 1]) {
  const toeZ = running.map(p => p.toes.find(t => t.side === side).z);
  const toeY = running.map(p => p.toes.find(t => t.side === side).y);
  assert.ok(spread(toeZ) > 0.25, `side ${side}: foot travels fore/aft while running (got ${spread(toeZ).toFixed(3)}m)`);
  assert.ok(spread(toeY) > 0.06, `side ${side}: foot lifts off the ground while running (got ${spread(toeY).toFixed(3)}m)`);
}
const leftLeg = running.map(p => p.toes.find(t => t.side === -1).z);
const rightArm = running.map(p => p.hands.find(h => h.side === 1).z);
assert.ok(spread(rightArm) > 0.12, `arms swing with the stride (got ${spread(rightArm).toFixed(3)}m)`);
// Opposite arm and leg lead, the way people actually run.
const cross = leftLeg.reduce((acc, z, i) => acc + (z - avg(leftLeg)) * (rightArm[i] - avg(rightArm)), 0);
assert.ok(cross > 0, 'the right arm swings with the left leg');
assert.ok(Math.abs(startZ) < 0.3, 'the idle stance starts with the feet under the body');

// --- jump: legs tuck in the air, then the landing crouch fires ---
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })));
await step(8);
const air = await pose();
assert.equal((await page.evaluate(() => window.__trial.grounded)), false, 'the jump leaves the ground');
assert.ok(Math.max(jointDeg(air, 'kneeL'), jointDeg(air, 'kneeR')) > 15,
  `knees tuck in the air (got ${jointDeg(air, 'kneeL').toFixed(1)}° / ${jointDeg(air, 'kneeR').toFixed(1)}°)`);
await shot('combat-jump');
for (let i = 0; i < 80 && !(await page.evaluate(() => window.__trial.grounded)); i++) await step(4);
const landed = await pose();
assert.ok(landed.root.bob < -0.02, `landing absorbs into a crouch (bob ${landed.root.bob.toFixed(3)}m)`);
// The crouch has to be paid back too: compress hard, then push out of it. A dip that just fades
// away reads as the body inflating back to standing rather than springing off the floor.
const landTrace = await page.evaluate(() => {
  const rows = [];
  for (let i = 0; i < 26; i++) { window.__trial.step(1, 1 / 60); rows.push(window.__trial.pose().root.bob); }
  return rows;
});
const deepest = Math.min(landed.root.bob, ...landTrace);
const recovered = landTrace[landTrace.length - 1];
console.log(`landing: dips to ${deepest.toFixed(3)}m, back to ${recovered.toFixed(3)}m`);
assert.ok(deepest < -0.06, `the landing really compresses (${deepest.toFixed(3)}m)`);
assert.ok(recovered > deepest + 0.05, `and pushes back out of it (${recovered.toFixed(3)}m)`);

// --- attack: the lead hand has to drive forward through the swing ---
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' })));
const swinging = await sample(9, 2);
await shot('combat-attack');
const reach = swinging.map(p => Math.max(...p.hands.map(h => h.z)));
assert.ok(Math.max(...reach) > 0.3, `a hand drives out in front during the swing (got ${Math.max(...reach).toFixed(3)}m)`);
assert.ok(spread(reach) > 0.15, 'the swing travels instead of holding one pose');
console.log('attack reach', reach.map(v => v.toFixed(2)).join(' '));

// --- ultimate: readable flourish that leaves the idle stance far behind ---
for (let i = 0; i < 40 && (await page.evaluate(() => window.__trial.attack)) >= 0; i++) await step(4);
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' })));
const ulting = await sample(10, 3);
await shot('combat-ultimate');
const overhead = Math.max(...ulting.map(p => Math.max(...p.hands.map(h => h.y))));
const spun = Math.max(...ulting.map(p => Math.abs(p.root.spin)));
assert.ok(spun > 1 || overhead > 1.7, `the ultimate spins or raises the staff overhead (spin ${spun.toFixed(2)}, hands ${overhead.toFixed(2)}m)`);

// --- boss: muzzle anchor, telegraph-before-damage, and hitboxes built from the drawn shapes ---
const info = await boss();
assert.ok(info, 'boss state is observable');
assert.ok(info.mouth, 'the boss has a muzzle anchor derived from its bounds');
const height = 4.2;
assert.ok(info.mouth[1] > height * 0.45 && info.mouth[1] < height * 1.05,
  `the muzzle sits in the head, not at the feet (y=${info.mouth[1].toFixed(2)} of a ${height}m boss)`);
const ahead = (info.mouth[0] - info.position[0]) * Math.sin(info.yaw) + (info.mouth[2] - info.position[2]) * Math.cos(info.yaw);
assert.ok(ahead > 0.4, `the muzzle is on the front of the body (${ahead.toFixed(2)}m ahead of centre)`);

for (const move of ['slam', 'swipe', 'fire']) {
  assert.ok(await page.evaluate(m => window.__trial.forceBossMove(m), move), `boss starts ${move}`);
  const started = await boss();
  const spec = started.moves[move];
  assert.equal(started.move, move, `${move} is the active move`);
  assert.equal(started.struck, false, `${move} telegraphs before anything lands`);
  // Nothing may land while the tell is still playing.
  await step(Math.floor(spec.wind * 60 * 0.8));
  const winding = await boss();
  assert.equal(winding.move, move, `${move} is still winding up`);
  assert.equal(winding.struck, false, `${move} has not landed at 80% of its wind-up`);
  // ...and it must commit soon after, within its own strike window.
  const committed = b => (move === 'fire' ? !!b.jet : b.struck);
  let struck = await boss();
  for (let i = 0; i < 60 && !committed(struck); i++) { await step(2); struck = await boss(); }
  assert.ok(committed(struck), `${move} lands once its wind-up finishes`);
  assert.ok(struck.t < spec.wind + spec.strike + 0.2, `${move} lands on schedule (t=${struck.t.toFixed(2)}s)`);
  await shot(`boss-${move}`);
  if (move === 'fire') {
    assert.ok(struck.jet, 'the jet exists while breathing');
    const gap = Math.hypot(...struck.jet.origin.map((v, i) => v - struck.mouth[i]));
    assert.ok(gap < 0.4, `the jet starts at the muzzle, not the body centre (off by ${gap.toFixed(3)}m)`);
    assert.ok(Math.abs(Math.hypot(...struck.jet.dir) - 1) < 1e-3, 'the jet direction is a unit vector');
    assert.ok(struck.jet.dir[1] < 0.2, 'the jet is angled down toward the player, not at the sky');
    assert.ok(spec.half > 0.1 && spec.half < 0.7, 'the fire cone keeps a sane spread');
  }
  for (let i = 0; i < 400 && (await boss()).move !== null; i++) await step(6);
  assert.equal((await boss()).move, null, `${move} recovers back to neutral`);
}

// --- regression: 巨掌砸地's ring must ride along with the turn its hitbox already follows ---
// Ground zero is `reach` ahead of the boss's *current* facing and the boss keeps tracking the player
// all through the wind-up, so a ring spawned once and left behind marks ground the palm never
// touches. Close in, force the slam, then strafe so the boss has to turn a long way while winding
// up, and sample every single frame: the drawn ring and the live hitbox centre must not part.
for (let i = 0; i < 120; i++) {
  const b = await boss();
  const me = (await page.evaluate(() => window.__trial)).player;
  if (Math.hypot(me[0] - b.position[0], me[2] - b.position[2]) < 7.5) break;
  await page.keyboard.down('KeyW');
  await step(6);
}
await page.keyboard.up('KeyW');
assert.ok(await page.evaluate(() => window.__trial.forceBossMove('slam')), 'boss starts the tracked slam');
const slamSpec = (await boss()).moves.slam;
const opened = await boss();
const yaw0 = opened.yaw;
assert.ok(opened.slam, 'the slam reports its ground zero and its ring');
// The original bug in one assertion: the ring was spawned and the handle thrown away, so nothing
// could move it afterwards even though the hitbox centre was recomputed every frame.
assert.ok(opened.slam.tele?.live, 'the slam holds on to its ring so the turn can drag it along');
await page.keyboard.down('KeyD'); // strafe, so tracking forces a real turn
let worstDrift = 0, turned = 0, frames = 0, frozen = null;
for (let i = 0; i < Math.ceil(slamSpec.wind * 60); i++) {
  await step(1);
  const b = await boss();
  if (b.move !== 'slam' || !b.slam?.tele?.live) break;
  frozen = b.slam.center;
  frames++;
  turned = Math.max(turned, Math.abs(((b.yaw - yaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
  worstDrift = Math.max(worstDrift, Math.hypot(
    b.slam.tele.position[0] - b.slam.center[0], b.slam.tele.position[2] - b.slam.center[2]));
  // The hitbox centre itself must stay pinned `reach` straight ahead of the boss.
  const ahead = (b.slam.center[0] - b.position[0]) * Math.sin(b.yaw)
    + (b.slam.center[2] - b.position[2]) * Math.cos(b.yaw);
  const side = (b.slam.center[0] - b.position[0]) * Math.cos(b.yaw)
    - (b.slam.center[2] - b.position[2]) * Math.sin(b.yaw);
  assert.ok(Math.abs(ahead - slamSpec.reach) < 0.02,
    `ground zero stays ${slamSpec.reach}m ahead of the boss (got ${ahead.toFixed(3)}m)`);
  assert.ok(Math.abs(side) < 0.02, `ground zero stays on the boss's centre line (off by ${side.toFixed(3)}m)`);
}
await page.keyboard.up('KeyD');
await shot('boss-slam-tracking');
console.log(`slam telegraph: ${frames} frames, turned ${turned.toFixed(2)} rad, worst drift ${worstDrift.toFixed(4)}m`);
assert.ok(frames > 20, `sampled the whole wind-up (${frames} frames)`);
// Without a turn this proves nothing, so fail loudly rather than passing on a stationary boss.
assert.ok(turned > 0.25, `the boss really turned while winding up (${turned.toFixed(2)} rad)`);
assert.ok(worstDrift < 0.02, `the ring tracks the hitbox centre through the turn (worst ${worstDrift.toFixed(4)}m)`);

// The ring is a promise about where the palm lands; the damage has to keep it.
const hpBefore = await page.evaluate(() => window.__trial.hp);
for (let i = 0; i < 120 && !(await boss()).struck; i++) await step(2);
const landed2 = await boss();
assert.ok(landed2.struck, 'the tracked slam lands');
assert.ok(Math.hypot(landed2.slam.center[0] - frozen[0], landed2.slam.center[2] - frozen[2]) < 0.05,
  'ground zero is frozen where the ring last drew it, not moved again during the drop');
const standing = (await page.evaluate(() => window.__trial)).player;
const fromCentre = Math.hypot(standing[0] - landed2.slam.center[0], standing[2] - landed2.slam.center[2]);
const hpAfter = await page.evaluate(() => window.__trial.hp);
console.log(`slam impact: player ${fromCentre.toFixed(2)}m from ground zero, ring ${landed2.slam.radius}m, hp ${hpBefore}->${hpAfter}`);
if (fromCentre < landed2.slam.radius - 0.6)
  assert.ok(hpAfter < hpBefore, `inside the ${landed2.slam.radius}m ring (${fromCentre.toFixed(2)}m) takes the hit`);
if (fromCentre > landed2.slam.radius + 0.6)
  assert.equal(hpAfter, hpBefore, `outside the ${landed2.slam.radius}m ring (${fromCentre.toFixed(2)}m) is safe`);
for (let i = 0; i < 400 && (await boss()).move !== null; i++) await step(6);

const after = await page.evaluate(() => window.__trial);
assert.ok(after.enemies[0].hp > 0, 'the boss survived this diagnostic pass');
assert.ok(after.running, 'the trial is still running');
assert.deepEqual(errors, []);
console.log('\ncombat OK');
await browser.close();
