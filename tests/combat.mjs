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

// --- 巨掌砸地: the warned circle and the live hitbox must be the same circle at the same time ---
// Two ways this drifts apart. In space: ground zero is `reach` ahead of the boss's *current* facing
// and the boss keeps tracking the player through the wind-up, so a ring that is not dragged along
// marks ground the palm never touches. In time: the palm keeps falling for `strike` after the
// wind-up and then rests for `active`, so a ring that expires with the wind-up leaves the hitbox
// live with nothing drawn under it — and because `hitstop` freezes attack timers but not effect
// ages, a ring left to run out its own lifetime slides out from under the active frames too.
//
// Both runs live entirely inside the page: a 0.12s window is far too fine to resolve over the wire.
const slam = await page.evaluate(() => {
  const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c }));
  const T = () => window.__trial;  // the getter rebuilds a snapshot, so hp/player must be re-read
  const settle = () => { for (let i = 0; i < 900 && T().boss().move; i++) T().step(1, 1 / 60); };
  const approach = d => {
    key('KeyW', true);
    for (let i = 0; i < 900; i++) {
      const b = T().boss(), me = T().player;
      if (Math.hypot(me[0] - b.position[0], me[2] - b.position[2]) < d) break;
      T().step(1, 1 / 60);
    }
    key('KeyW', false);
  };
  // `hold` is pressed from `after` seconds into the wind-up: strafing forces the boss to turn,
  // running backwards bolts out of the circle before the palm commits.
  const run = (hold, after) => {
    settle();
    approach(4.6);
    settle();
    const hp0 = T().hp, frames = [];
    if (!T().forceBossMove('slam')) return { failed: true };
    for (let i = 0; i < 240; i++) {
      T().step(1, 1 / 60);
      const b = T().boss();
      if (!b.move) break;
      if (hold && b.t > after) key(hold, true);
      const me = T().player, s = b.slam, d = Math.hypot(me[0] - s.center[0], me[2] - s.center[2]);
      frames.push({
        t: b.t, yaw: b.yaw, warned: s.warned, dangerous: s.dangerous, struck: b.struck, dist: d,
        drift: s.tele ? Math.hypot(s.tele.position[0] - s.center[0], s.tele.position[2] - s.center[2]) : null,
        ahead: (s.center[0] - b.position[0]) * Math.sin(b.yaw) + (s.center[2] - b.position[2]) * Math.cos(b.yaw),
        side: (s.center[0] - b.position[0]) * Math.cos(b.yaw) - (s.center[2] - b.position[2]) * Math.sin(b.yaw),
        inside: d < s.radius, hp: T().hp,
      });
    }
    if (hold) key(hold, false);
    return { hp0, hpEnd: T().hp, frames };
  };
  // Only `stand` is meant to connect: the health budget here is one slam.
  const stand = run(null, 0);        // stays put inside the circle
  const flee = run('KeyS', 0);       // backs straight out of the circle during the wind-up
  const strafe = run('KeyD', 0);     // forces the boss to turn, dragging ground zero round with it
  return { spec: T().boss().moves.slam, stand, flee, strafe };
});

const S = slam.spec;
const impact = S.wind + S.strike;
assert.ok(S.active > 0.05, `the hitbox has a readable active window (${S.active}s)`);
for (const [name, run] of Object.entries({ stand: slam.stand, flee: slam.flee, strafe: slam.strafe })) {
  assert.ok(!run.failed, `${name}: the slam started`);
  const f = run.frames, danger = f.filter(r => r.dangerous), warned = f.filter(r => r.warned);
  const lost = run.hp0 - run.hpEnd;
  console.log(`slam/${name}: warned ${warned[0]?.t.toFixed(3)}..${warned.at(-1)?.t.toFixed(3)}s (${warned.length}f), `
    + `dangerous ${danger[0]?.t.toFixed(3)}..${danger.at(-1)?.t.toFixed(3)}s (${danger.length}f), `
    + `drift<=${Math.max(...warned.map(r => r.drift ?? 0)).toFixed(4)}m, `
    + `dist on active frames ${Math.min(...danger.map(r => r.dist)).toFixed(2)}..${Math.max(...danger.map(r => r.dist)).toFixed(2)}m, hp -${lost.toFixed(1)}`);

  // Timing: the hitbox may never be live without the ring under it, and never before the palm lands.
  assert.ok(danger.length >= 5, `${name}: the hitbox is live across a window, not one frame (${danger.length} frames)`);
  assert.equal(danger.filter(r => !r.warned).length, 0,
    `${name}: every dangerous frame still has the warning ring on the ground`);
  assert.ok(danger.every(r => r.t >= impact - 1e-6), `${name}: nothing is dangerous before the palm lands`);
  assert.ok(warned.at(-1).t >= danger.at(-1).t, `${name}: the ring outlasts the last dangerous frame`);

  // Space: the drawn ring sits on the hitbox centre, which stays pinned ahead of the boss.
  assert.ok(Math.max(...warned.map(r => r.drift ?? 0)) < 0.02, `${name}: the ring sits on the hitbox centre`);
  const wind = f.filter(r => r.t < S.wind);
  assert.ok(Math.max(...wind.map(r => Math.abs(r.ahead - S.reach))) < 0.02,
    `${name}: ground zero stays ${S.reach}m ahead of the boss`);
  assert.ok(Math.max(...wind.map(r => Math.abs(r.side))) < 0.02,
    `${name}: ground zero stays on the boss's centre line`);

  // The circle is a promise: you are hurt exactly when you were inside it while it was live.
  const exposed = danger.some(r => r.inside);
  assert.equal(lost > 0, exposed, `${name}: damage matches the warned circle (inside=${exposed}, lost ${lost.toFixed(1)}hp)`);
  if (exposed) assert.ok(Math.abs(lost - S.damage) < 0.01, `${name}: one slam deals ${S.damage}, not ${lost.toFixed(1)}`);
}
// Each run only proves its case if it actually did the thing it was set up to do.
const active = run => run.frames.filter(r => r.dangerous);
assert.ok(active(slam.stand).every(r => r.inside),
  'the standing run really was inside the circle on the active frames');
assert.ok(Math.abs((slam.stand.hp0 - slam.stand.hpEnd) - S.damage) < 0.01,
  `standing in the warned circle through the active frames takes the ${S.damage} hit`);
assert.ok(active(slam.flee).every(r => r.dist > S.radius),
  'the dodging run really was outside the circle on the active frames');
assert.equal(slam.flee.hp0 - slam.flee.hpEnd, 0, 'leaving the warned circle before impact takes no slam damage');
const yawSpread = fs => Math.max(...fs.map(r => Math.abs(((r.yaw - fs[0].yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI)));
assert.ok(yawSpread(slam.strafe.frames) > 0.25,
  `the boss really turned while winding up (${yawSpread(slam.strafe.frames).toFixed(2)} rad)`);

// A frame from inside the active window, to see the warning still lit under the impact. The player
// runs clear first, so this proof shot costs no health — one slam is all the budget there is here.
const held = await page.evaluate(() => {
  const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c }));
  const T = () => window.__trial;
  for (let i = 0; i < 900 && T().boss().move; i++) T().step(1, 1 / 60);
  if (!T().forceBossMove('slam')) return null;
  for (let i = 0; i < 300; i++) {
    T().step(1, 1 / 60);
    const b = T().boss();
    if (!b.move) break;
    if (b.t > 0.15) key('KeyS', true);
    if (b.slam.dangerous) { T().step(3, 1 / 60); break; }
  }
  key('KeyS', false);
  return T().boss().slam;
});
assert.ok(held, 'the proof-shot slam started');
assert.ok(held.dangerous && held.warned, 'the proof shot is a frame that is both warned and dangerous');
assert.ok(held.dealt === false, 'the proof shot cost no health');
await shot('boss-slam-active');
for (let i = 0; i < 400 && (await boss()).move !== null; i++) await step(6);

const after = await page.evaluate(() => window.__trial);
assert.ok(after.enemies[0].hp > 0, 'the boss survived this diagnostic pass');
assert.ok(after.running, 'the trial is still running');
assert.deepEqual(errors, []);
console.log('\ncombat OK');
await browser.close();
