import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';

const url = process.env.POC_URL || 'http://localhost:4333';
const source = JSON.parse(await readFile(new URL('./public/get-apis.sample.json', import.meta.url)));
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const expect = baseExpect.configure({ timeout: 20000 });
await mkdir('test-results', { recursive: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 45000 });
  await expect(page.locator('#stats')).toHaveAttribute('data-buildings', '1500');
  await expect(page.locator('#entity option')).toHaveCount(26);
  await expect(page.locator('.lens-bar, #lenses, #lens-info')).toHaveCount(0);
  await expect(page.locator('#stats')).toHaveAttribute('data-mode', 'discovery');
  await expect(page.locator('#stats')).toHaveAttribute('data-ports', String(source.apis.reduce((count, api) => count + api.endpoints.length, 0)));
  await page.screenshot({ path: 'test-results/explorer-arrival.png' });

  // Search semantic descriptions, normalize accents, combine factual filters.
  await page.locator('[data-query="authentification"]').click();
  await expect(page.locator('#results')).toContainText('Authentification forte');
  await page.selectOption('#domain-filter', 'identite');
  await page.selectOption('#status-filter', 'PRODUCTION');
  await expect(page.locator('#results')).not.toContainText('Aucune API');
  await expect.poll(async () => Number(await page.locator('#stats').getAttribute('data-matches'))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await page.locator('#stats').getAttribute('data-matches'))).toBeLessThan(1500);
  await page.locator('#search').fill('capacité-qui-nexiste-pas');
  await expect(page.locator('#results')).toContainText('Aucune API');
  await expect(page.locator('#stats')).toHaveAttribute('data-matches', '0');
  await page.locator('#reset-filters').click();
  await expect(page.locator('#stats')).toHaveAttribute('data-matches', '1500');
  await page.locator('#dismiss-results').click();

  // Exact ID must rank ahead of substring matches; shared links preserve tab.
  const id = 'bpcesi-1-a1';
  await page.locator('#search').fill(id);
  await page.locator('#results > button').first().click();
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#api-name')).toHaveText(source.apis.find(api => api.id === id).name);
  assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('api'), id);
  await expect(page.locator('#tabs button')).toHaveText(['Présentation', 'Fonctionnel', 'Endpoints', 'Consommateurs', 'Contact', 'Gouvernance']);
  await page.locator('#approach').click();
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/nav-collapsed/);
  await page.waitForTimeout(1800);
  assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('api'), id);
  await page.screenshot({ path: 'test-results/explorer-3d-ports.png' });
  const exterior = await page.locator('#stats').getAttribute('data-projection');
  await page.locator('#focus-contact').click();
  await expect(page.locator('#contact-card')).toBeVisible();
  await expect(page.locator('#contact-card')).toHaveAttribute('data-api', id);
  await expect(page.locator('#panel')).toBeHidden();
  const sourceApi = source.apis.find(api => api.id === id);
  await expect(page.locator('#contact-list')).toContainText(sourceApi.contact.phone);
  await expect(page.locator('#contact-list')).toContainText(sourceApi.contact.team);
  await expect(page.locator('#contact-list')).toContainText(sourceApi.contact.owner.name);
  await expect(page.locator('#contact-list')).not.toContainText('[object Object]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/exterior-interphone.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#contact-card')).toBeHidden();
  await expect.poll(async () => {
    const before = JSON.parse(exterior);
    const after = JSON.parse(await page.locator('#stats').getAttribute('data-projection'));
    return Math.max(...['position', 'target'].flatMap(key => after[key].map((v, i) => Math.abs(v - before[key][i]))));
  }).toBeLessThan(.01);
  // Raycast the physical interphone without opening the API sheet.
  const interphonePoint = await page.evaluate(async id => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { makeWorld } = await import('/layout.js');
    const world = makeWorld(await (await fetch('/get-apis.sample.json')).json());
    const b = world.byId.get(id);
    const view = JSON.parse(document.getElementById('stats').dataset.projection);
    const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .3, 14000);
    camera.position.fromArray(view.position);
    camera.lookAt(new THREE.Vector3().fromArray(view.target)); camera.updateMatrixWorld();
    const point = new THREE.Vector3(b.x - 3.9, 2.2, b.z + 3.88).project(camera);
    return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2 };
  }, id);
  await page.mouse.click(interphonePoint.x, interphonePoint.y);
  await expect(page.locator('#contact-card')).toBeVisible();
  await page.locator('#close-contact').click();
  await expect(page.locator('#contact-card')).toBeHidden();
  await page.locator('#search').fill('');
  await page.locator('#search').fill(id);
  await page.locator('#results > button').first().click();
  await page.locator('#nav-toggle').click();
  for (const tab of ['functional', 'consumers', 'contact', 'governance']) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await expect(page.locator(`#tabs [data-tab="${tab}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#content')).not.toBeEmpty();
  }

  // Simulation must validate JSON and must NEVER send network requests.
  const apiRequests = [];
  const onRequest = request => {
    if (/sandbox|\/bpcesi\/platform/.test(request.url())) apiRequests.push(request.url());
  };
  page.on('request', onRequest);
  await page.locator('[data-tab="technical"]').click();
  await page.locator('[data-simulate="1"]').click(); // POST
  await page.locator('#simulation-body').fill('{ invalid');
  await page.locator('#simulation-send').click();
  await expect(page.locator('#simulation-output')).toContainText('JSON invalide');
  await page.locator('#simulation-body').fill('{"reference":"DEMO"}');
  await page.locator('#simulation-send').click();
  await expect(page.locator('#simulation-output')).toContainText('"status": 201');
  await expect(page.locator('#simulation-output')).toContainText('"networkRequestSent": false');
  await page.selectOption('#simulation-scenario', '429');
  await page.locator('#simulation-send').click();
  await expect(page.locator('#simulation-output')).toContainText('"status": 429');
  assert.deepEqual(apiRequests, []);
  page.off('request', onRequest);
  await page.screenshot({ path: 'test-results/explorer-workshop.png' });

  await page.locator('[data-tab="consumers"]').click();
  await page.locator('#open-api-relations').click();
  await expect(page.locator('#relations-view')).toBeVisible();
  await expect(page.locator('#relation-root-id')).toHaveText(id);
  await page.locator('#relation-suppliers [data-relation]').first().click();
  await expect(page.locator('#relation-wire path')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/explorer-impact.png' });
  await page.locator('#relations-close').click();
  await expect(page.locator('#stats')).toHaveAttribute('data-relations', '0');
  const shareUrl = page.url();
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 45000 });
  await expect(page.locator('#api-name')).toHaveText(source.apis.find(api => api.id === id).name);
  await expect(page.locator('#tabs [data-tab="consumers"]')).toHaveAttribute('aria-pressed', 'true');
  assert.equal(new URLSearchParams(new URL(shareUrl).hash.slice(1)).get('tab'), 'consumers');
  await page.locator('#panel-full').click();
  await expect(page.locator('body')).toHaveClass(/panel-full/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel')).toBeHidden();

  // A real board remains anchored, raycast-selectable and associated with its API.
  await page.locator('#search').fill(id);
  await page.locator('#results > button').first().click();
  await page.locator('#approach').click();
  await page.waitForTimeout(1700);
  await page.locator('#close').click();
  const signPoint = await page.evaluate(async id => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { makeWorld } = await import('/layout.js');
    const { apiSignPosition } = await import('/city-life.js');
    const world = makeWorld(await (await fetch('/get-apis.sample.json')).json());
    const snapshot = JSON.parse(document.getElementById('stats').dataset.projection);
    const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .3, 14000);
    camera.position.fromArray(snapshot.position);
    camera.lookAt(new THREE.Vector3().fromArray(snapshot.target));
    camera.updateMatrixWorld();
    const point = apiSignPosition(world.byId.get(id)).project(camera);
    return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2 };
  }, id);
  await page.mouse.move(signPoint.x, signPoint.y);
  await expect(page.locator('#hover strong')).toHaveText(source.apis.find(api => api.id === id).name);
  await page.mouse.click(signPoint.x, signPoint.y);
  await page.locator('#focus-details').click();
  await expect(page.locator('#api-name')).toHaveText(source.apis.find(api => api.id === id).name);
  await page.screenshot({ path: 'test-results/explorer-sign.png' });
  await page.locator('#close').click();
  await expect(page.locator('#panel')).toBeHidden();
  assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).has('api'), false);
  await expect.poll(async () => (await page.locator('#stats').getAttribute('data-endpoint-buildings') ?? '').split(',').includes(id)).toBe(true);
  const proximityIds = (await page.locator('#stats').getAttribute('data-endpoint-buildings')).split(',');
  assert.equal(proximityIds.length, 1, 'only one active facade, without an API sheet');
  await page.screenshot({ path: 'test-results/explorer-proximity-contact.png' });
  await page.locator('#theme').click();
  await expect(page.locator('body')).toHaveClass(/day/);
  await page.screenshot({ path: 'test-results/explorer-day.png' });

  await page.locator('.controls summary').click();
  await page.locator('#people').click();
  await page.waitForTimeout(400);
  const paused = await page.locator('#stats').getAttribute('data-walk');
  await page.waitForTimeout(700);
  await expect(page.locator('#stats')).toHaveAttribute('data-walk', paused);
  await page.locator('#people').click();
  const beforeFly = await page.locator('#stats').getAttribute('data-camera');
  await page.locator('#fly').click();
  await expect(page.locator('body')).toHaveClass(/flying/);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyE');
  await expect(page.locator('#stats')).not.toHaveAttribute('data-camera', beforeFly);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyE');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/flying/);

  const lossExtension = await page.evaluateHandle(() => {
    const extension = document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context loss simulation is unavailable');
    extension.loseContext();
    return extension;
  });
  await expect(page.locator('#loading')).toContainText('Rendu suspendu');
  await lossExtension.evaluate(extension => extension.restoreContext());
  await lossExtension.dispose();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('#state')).toContainText('Contexte graphique restauré');
  await page.close();
  console.log('PASS desktop: discovery without mode bar, combined filters, six API sections, local simulation, named relations, shared link, fixed signs, fullscreen, day/night, pause, flight and context restoration.');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(`${url}/#api=${id}&tab=technical`);
  await expect(mobile.locator('#loading')).toBeHidden({ timeout: 45000 });
  await expect(mobile.locator('#panel')).toBeVisible();
  await expect(mobile.locator('#tabs [data-tab="technical"]')).toHaveAttribute('aria-pressed', 'true');
  assert.ok(await mobile.locator('#panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: 'test-results/explorer-mobile.png' });
  await mobile.locator('#close').click();
  await mobile.locator('#focus-contact').click();
  await expect(mobile.locator('#contact-card')).toBeVisible();
  await expect(mobile.locator('#contact-list')).toContainText(source.apis.find(api => api.id === id).contact.phone);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: 'test-results/interphone-mobile.png', timeout: 60000 });
  await mobile.locator('#close-contact').click();
  await mobile.locator('#nav-toggle').click();
  await expect(mobile.locator('#navigation')).toBeVisible();
  await mobile.locator('#entity').selectOption('bpcesi');
  await expect.poll(async () => Number(await mobile.locator('#stats').getAttribute('data-people-visible'))).toBeGreaterThan(0);
  await mobile.waitForTimeout(500);
  const still = await mobile.locator('#stats').getAttribute('data-walk');
  await mobile.waitForTimeout(900);
  await expect(mobile.locator('#stats')).toHaveAttribute('data-walk', still);
  await mobile.close();
  assert.deepEqual(errors, [], 'no JavaScript errors');
  console.log('PASS mobile: shared link, endpoints, no horizontal overflow, navigation and reduced-motion.');
} finally {
  await browser.close();
}
