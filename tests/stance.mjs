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
console.log('\nstance', JSON.stringify(stance, null, 1));

assert.equal(stance.legs.length, 2, 'both legs resolved from the Tripo bone tree');
const height = stance.bodyMaxY - stance.bodyMinY;

// Feet on ground: the visible body must sit on the floor, never hang above it.
assert.ok(Math.abs(stance.bodyMinY - stance.floorY) < height * 0.05,
  `body sole ${stance.bodyMinY.toFixed(3)} should rest on floor ${stance.floorY.toFixed(3)}`);

for (const leg of stance.legs) {
  const label = leg.names.join(' / ');
  // Upright: hip above knee above ankle, and the leg line aimed at the floor.
  assert.ok(leg.hipY > leg.kneeY + height * 0.05, `${label}: hip above knee`);
  assert.ok(leg.kneeY > leg.ankleY + height * 0.05, `${label}: knee above ankle`);
  assert.ok(leg.uprightness > 0.95, `${label}: leg points down (got ${leg.uprightness.toFixed(3)})`);
  // Grounded: the foot bone sits within a shoe's thickness of the floor.
  assert.ok(Math.abs(leg.toeY - stance.floorY) < height * 0.06,
    `${label}: toe ${leg.toeY.toFixed(3)} near floor ${stance.floorY.toFixed(3)}`);
}

// Both feet share the floor rather than one dangling.
const toes = stance.legs.map(l => l.toeY);
assert.ok(Math.abs(toes[0] - toes[1]) < height * 0.03, 'feet level with each other');

await page.evaluate(() => { document.getElementById('hud').style.display = 'none'; });
await page.waitForTimeout(1500);
// Software rendering needs a generous budget for this scene.
await page.screenshot({ path: 'tests/stance.png', timeout: 120000 });
assert.deepEqual(errors, []);
console.log('\nstance OK');
await browser.close();
