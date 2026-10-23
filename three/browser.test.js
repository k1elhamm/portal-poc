import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.POC_URL || 'http://localhost:4333');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('#stats')).toHaveAttribute('data-buildings', '1500');
  await expect(page.locator('#entity option')).toHaveCount(26);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/world-day.png' });
  await page.locator('#entity').selectOption('bpcesi');
  await page.waitForTimeout(1500);
  await expect(page.locator('#state')).toContainText('167 API');
  await page.screenshot({ path: 'test-results/city-day.png' });
  await expect(page.locator('#pole option')).toHaveCount(11);
  await page.locator('#pole').selectOption('bpcesi-1');
  await page.waitForTimeout(1500);
  await expect.poll(async () => Number(await page.locator('#stats').getAttribute('data-signs'))).toBeGreaterThan(0);
  await expect(page.locator('.api-sign,#api-signs,.sign-connections')).toHaveCount(0);
  await expect(page.locator('#stats')).toHaveAttribute('data-developers', '459');
  await expect.poll(async () => Number(await page.locator('#stats').getAttribute('data-people-visible'))).toBeGreaterThan(0);
  const walkBefore = await page.locator('#stats').getAttribute('data-walk');
  await expect(page.locator('#stats')).not.toHaveAttribute('data-walk', walkBefore, { timeout: 15000 });
  await page.locator('#people').click();
  await page.waitForTimeout(300);
  const paused = await page.locator('#stats').getAttribute('data-walk');
  await page.waitForTimeout(600);
  await expect(page.locator('#stats')).toHaveAttribute('data-walk', paused);
  await page.locator('#people').click();

  const beforeOrbit = await page.locator('#stats').getAttribute('data-camera');
  const orbitPoint = await page.evaluate(() => {
    for (let y = 800; y >= 300; y -= 50) {
      for (let x = 700; x <= 1100; x += 50) {
        if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y };
      }
    }
    throw new Error('No unobstructed canvas point for orbit');
  });
  await page.mouse.move(orbitPoint.x, orbitPoint.y);
  await page.mouse.down();
  await page.mouse.move(orbitPoint.x + 250, orbitPoint.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('#stats')).not.toHaveAttribute('data-camera', beforeOrbit, { timeout: 15000 });
  const afterOrbit = await page.locator('#stats').getAttribute('data-camera');
  assert.notEqual(afterOrbit, beforeOrbit, 'orbit must change camera position');
  await page.locator('#search').fill('bpcesi-1-a1');
  await page.locator('#results button').first().click();
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#api-name')).not.toHaveText('');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/api-day.png' });
  for (const [tab, text] of [['functional', 'Capacités fonctionnelles'],
    ['technical', 'GET'], ['consumers', 'Consommateurs internes'],
    ['contact', 'Équipe responsable'], ['governance', 'Conformité']]) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await expect(page.locator('#content')).toContainText(text);
  }
  await page.locator('#relations').click();
  await expect(page.locator('#relations')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#theme').click();
  await expect(page.locator('body')).not.toHaveClass('day');
  await page.screenshot({ path: 'test-results/api-night.png' });
  await page.locator('#close').click();
  await expect(page.locator('#panel')).toBeHidden();
  await page.waitForTimeout(400);
  const signName = await page.locator('#api-name').textContent();
  const signPoint = await page.evaluate(async name => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { makeWorld } = await import('/layout.js');
    const { apiSignPosition } = await import('/city-life.js');
    const world = makeWorld(await (await fetch('/get-apis.sample.json')).json());
    const building = world.buildings.find(b => b.api.name === name);
    const snapshot = JSON.parse(document.getElementById('stats').dataset.projection);
    const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.3, 14000);
    camera.position.fromArray(snapshot.position);
    camera.lookAt(new THREE.Vector3().fromArray(snapshot.target));
    camera.updateMatrixWorld();
    const point = apiSignPosition(building).project(camera);
    return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2 };
  }, signName);
  await page.mouse.move(signPoint.x, signPoint.y);
  await expect(page.locator('#hover strong')).toHaveText(signName);
  await page.screenshot({ path: 'test-results/physical-sign-night.png' });
  await page.mouse.click(signPoint.x, signPoint.y);
  await expect(page.locator('#api-name')).toHaveText(signName);
  await expect(page.locator('#panel')).toBeVisible();
  await page.locator('#close').click();

  // Real raycasting: scan canvas points until a visible volume is hit, then click it.
  let point;
  for (let y = 400; y <= 700 && !point; y += 25) {
    for (let x = 500; x <= 1000; x += 25) {
      if (!await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', { x, y })) continue;
      await page.mouse.move(x, y);
      if (await page.locator('#hover').isVisible()) { point = { x, y }; break; }
    }
  }
  assert.ok(point, 'at least one real building must be raycast-selectable');
  const hoverName = await page.locator('#hover strong').textContent();
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#api-name')).toHaveText(hoverName);
  await page.locator('#close').click();

  const beforeFly = await page.locator('#stats').getAttribute('data-camera');
  await page.locator('#fly').click();
  await expect(page.locator('body')).toHaveClass(/flying/);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyE');
  await expect(page.locator('#stats')).not.toHaveAttribute('data-camera', beforeFly, { timeout: 15000 });
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyE');
  const afterFly = await page.locator('#stats').getAttribute('data-camera');
  assert.notEqual(afterFly, beforeFly, 'free flight must move the camera');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/flying/);
  await page.locator('#overview').click();
  await page.waitForTimeout(1500);
  await expect(page.locator('#entity')).toHaveValue('');
  await page.locator('#back').click();
  await page.waitForTimeout(1500);
  await expect(page.locator('#entity')).toHaveValue('bpcesi');
  await expect(page.locator('#loading')).toBeHidden();
  const lossExtension = await page.evaluateHandle(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context loss simulation is unavailable');
    extension.loseContext();
    return extension;
  });
  await expect(page.locator('#loading')).toContainText('Rendu suspendu');
  await lossExtension.evaluate(extension => extension.restoreContext());
  await lossExtension.dispose();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#state')).toContainText('Contexte graphique restauré');
  assert.deepEqual(errors, [], 'no JavaScript errors');
  console.log('PASS: dataset, orbit, search, six API sections, relations, day/night, raycast click, free flight, Escape and history.');
  console.log(await page.locator('#stats').textContent());
  await page.close();
  const reducedPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await reducedPage.goto(process.env.POC_URL || 'http://localhost:4333');
  await expect(reducedPage.locator('#loading')).toBeHidden({ timeout: 30000 });
  await reducedPage.locator('#entity').selectOption('bpcesi');
  await expect.poll(async () => Number(await reducedPage.locator('#stats').getAttribute('data-people-visible')), { timeout: 20000 }).toBeGreaterThan(0);
  await reducedPage.waitForTimeout(500);
  const still = await reducedPage.locator('#stats').getAttribute('data-walk');
  await reducedPage.waitForTimeout(900);
  await expect(reducedPage.locator('#stats')).toHaveAttribute('data-walk', still);
  await reducedPage.screenshot({ path: 'test-results/campus-reduced-motion.png' });
  await reducedPage.close();
  console.log('PASS: physical entrance signs open the correct API; no floating cards; reduced-motion keeps developers still.');
} finally {
  await browser.close();
}
