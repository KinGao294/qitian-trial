import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const base = process.env.TRIAL_URL ?? 'http://localhost:5173/qitian-trial/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.text().startsWith('[trial]')) console.log(m.text()); });

await page.goto(base);
await page.waitForFunction(() => window.__trial?.artReady, {}, { timeout: 60000 });
await page.click('#start');
await page.waitForTimeout(600);

const stance = await page.evaluate(() => window.__trial.stance());
console.log('\nbone names as three.js sees them:', stance.boneNames.join(', '));
console.log('\nstance', JSON.stringify({ ...stance, boneNames: undefined }, null, 1));

assert.equal(stance.legs.length, 2, 'both legs resolved from the Tripo bone tree');
const height = stance.bodyMaxY - stance.bodyMinY;

// The idle animation layers on top of this bind pose, so the grounding has to survive it: check the
// stance as loaded, then again after a couple of seconds of idle animation.
function checkStanding(s, when) {
  // Feet on ground: the visible body must sit on the floor, never hang above it.
  assert.ok(Math.abs(s.bodyMinY - s.floorY) < height * 0.05,
    `${when}: body sole ${s.bodyMinY.toFixed(3)} should rest on floor ${s.floorY.toFixed(3)}`);

  for (const leg of s.legs) {
    const label = `${when}: ${leg.names.join(' / ')}`;
    // Upright: hip above knee above ankle, and the leg line aimed at the floor.
    assert.ok(leg.hipY > leg.kneeY + height * 0.05, `${label}: hip above knee`);
    assert.ok(leg.kneeY > leg.ankleY + height * 0.05, `${label}: knee above ankle`);
    assert.ok(leg.uprightness > 0.95, `${label}: leg points down (got ${leg.uprightness.toFixed(3)})`);
    // Grounded: the foot bone sits within a shoe's thickness of the floor.
    assert.ok(Math.abs(leg.toeY - s.floorY) < height * 0.06,
      `${label}: toe ${leg.toeY.toFixed(3)} near floor ${s.floorY.toFixed(3)}`);
  }

  // Both feet share the floor rather than one dangling.
  const toes = s.legs.map(l => l.toeY);
  assert.ok(Math.abs(toes[0] - toes[1]) < height * 0.03, `${when}: feet level with each other`);
}
checkStanding(stance, 'on load');

// The GLB stores `tripo::0_Left_Limb_0`, but GLTFLoader passes every node name through
// PropertyBinding.sanitizeNodeName, whose reserved set ('\\[\\]\\.:\\/') deletes ':'. So a matcher
// written for the on-disk spelling matches nothing at runtime. Pin both halves of that down.
const withColons = stance.boneNames.filter(n => n.includes('::'));
assert.deepEqual(withColons, [], 'three.js strips "::" — a /tripo::0_/ matcher would match nothing');
const legMatchers = stance.boneNames.filter(n => /^tripo0_(Left|Right)_Limb_[0-3]$/.test(n));
assert.equal(legMatchers.length, 8, `colon-less leg bone names are what exist at runtime, got ${JSON.stringify(stance.boneNames)}`);

// Every bone name below must be a real resolved bone, never empty.
for (const names of [...stance.legs, ...stance.arms].map(p => p.names)) {
  assert.ok(names.every(n => n && n.length), `resolved bone names, got ${JSON.stringify(names)}`);
}

// Arms out of the dead T-pose.
assert.equal(stance.arms.length, 2, 'both arms resolved');
for (const arm of stance.arms) {
  assert.ok(arm.drop > 0.35, `${arm.names.join(' > ')}: arm hangs below horizontal (got ${arm.drop.toFixed(3)})`);
}

// Two seconds of breathing later, the warrior must still be standing on his own feet. Stepping the
// simulation directly keeps this honest on software renderers, which draw about one frame a second.
await page.evaluate(() => window.__trial.step(140, 1 / 60));
const settled = await page.evaluate(() => window.__trial.stance());
console.log('\nafter 2s of idle animation', JSON.stringify({ bodyMinY: settled.bodyMinY, toes: settled.legs.map(l => l.toeY) }));
checkStanding(settled, 'after idle animation');
for (const arm of settled.arms) {
  assert.ok(arm.drop > 0.35, `${arm.names.join(' > ')}: arm still hangs below horizontal (got ${arm.drop.toFixed(3)})`);
}

await page.evaluate(() => { document.getElementById('hud').style.display = 'none'; });
await page.waitForTimeout(1500);
// Software rendering needs a generous budget for this scene.
await page.screenshot({ path: 'tests/stance.png', timeout: 120000 });
assert.deepEqual(errors, []);
console.log('\nstance OK');
await browser.close();
