import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { makeWorld } from './layout.js';

const expect = baseExpect.configure({ timeout: 20000 });
const base = process.env.POC_URL || 'http://localhost:4333';
const source = JSON.parse(await readFile(new URL('./public/get-apis.sample.json', import.meta.url)));
const api = source.apis.find(item => item.id === 'bpcesi-1-a1');
const fixtureWorld = makeWorld(source);
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
await mkdir('test-results', { recursive: true });
const errors = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 45000 });
    await expect(page.locator('.lens-bar, #lenses, #lens-info')).toHaveCount(0);
    assert.equal(await page.locator('#compliance-key span').nth(1).evaluate(element =>
      getComputedStyle(element).getPropertyValue('--key').trim()), '#56c98a');
    await page.locator('#search').fill(api.id);
    await page.locator(`.result-guide[data-api="${api.id}"]`).click();
    await expect(page.locator('#panel')).toBeHidden();
    await expect(page.locator('#focus-name')).toHaveText(api.name);
    await expect(page.locator('#labels .world-label:visible')).toHaveCount(0);
    await expect(page.locator('#path-city')).toHaveText(api.entity.name);
    await expect(page.locator('#focus-endpoint option')).toHaveCount(api.endpoints.length + 1);
    await page.locator('#focus-details').click();
    await expect(page.locator('#tabs button')).toHaveText(['Présentation', 'Fonctionnel', 'Endpoints', 'Consommateurs', 'Contact', 'Gouvernance']);
    await expect(page.locator('#panel .api-actions')).toHaveCount(0);
    await expect(page.locator('#content')).not.toContainText('Commencez par le premier appel');
    await page.screenshot({ path: `test-results/simplified-sheet-${viewport.width}.png`, timeout: 60000 });
    for (const tab of ['functional', 'technical', 'consumers', 'contact', 'governance']) {
      await page.locator(`[data-tab="${tab}"]`).click();
      await expect(page.locator('#content')).not.toBeEmpty();
    }
    await page.locator('[data-tab="consumers"]').click();
    await page.locator('#open-api-relations').click();
    await expect(page.locator('#relations-view')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('#approach').click();
    await page.locator('#building-next').click();
    await expect(page.locator('#focus-name')).not.toHaveText(api.name);
    await page.locator('#building-previous').click();
    await expect(page.locator('#focus-name')).toHaveText(api.name);
    await page.selectOption('#focus-endpoint', '2');
    await expect(page.locator('#endpoint-card')).toBeVisible();
    await expect(page.locator('#endpoint-path')).toHaveText(api.endpoints[2].path);
    await expect(page.locator('#endpoint-parameters')).toContainText('id');
    await expect(page.locator('#panel')).toBeHidden();
    if (viewport.width <= 760) {
      await expect(page.locator('#building-focus')).toBeHidden();
      await expect.poll(() => page.evaluate(async id => {
        const T = await import('/node_modules/three/build/three.module.js');
        const { makeWorld } = await import('/layout.js');
        const b = makeWorld(await (await fetch('/get-apis.sample.json')).json()).byId.get(id);
        const view = JSON.parse(document.getElementById('stats').dataset.projection);
        const c = new T.PerspectiveCamera(48, innerWidth / innerHeight, .3, 14000);
        c.position.fromArray(view.position); c.lookAt(new T.Vector3().fromArray(view.target)); c.updateMatrixWorld();
        const left = new T.Vector3(b.x - 2.6, 7, b.z + 2.7).project(c);
        const right = new T.Vector3(b.x + 2.6, 7, b.z + 2.7).project(c);
        const y = (1 - left.y) * innerHeight / 2;
        return (left.x + 1) * innerWidth / 2 > 12 &&
          (right.x + 1) * innerWidth / 2 < innerWidth - 12 && y > 122 &&
          y < document.getElementById('endpoint-card').getBoundingClientRect().top;
      }, api.id)).toBe(true);
    }
    await page.screenshot({ path: `test-results/journey-facade-${viewport.width}.png`, timeout: 60000 });
    await page.locator('#endpoint-copy').click();
    await expect(page.locator('#endpoint-feedback')).toHaveText('Chemin copié.');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), api.endpoints[2].path);
    const apiRequests = [];
    page.on('request', request => { if (request.url().includes('example.invalid')) apiRequests.push(request.url()); });
    await page.locator('#endpoint-simulate').click();
    await page.locator('#simulation-id').fill('');
    await page.locator('#simulation-send').click();
    await expect(page.locator('#simulation-output')).toContainText('saisissez un identifiant');
    await page.locator('#simulation-id').fill('DEMO-42');
    await page.locator('#simulation-send').click();
    await expect(page.locator('#simulation-output')).toContainText('"networkRequestSent": false');
    await expect(page.locator('#simulation-output')).toContainText('"status": 200');
    assert.deepEqual(apiRequests, []);
    await page.screenshot({ path: `test-results/journey-endpoint-${viewport.width}.png`, timeout: 60000 });
    await page.selectOption('#simulation-endpoint', '1');
    await expect(page.locator('#endpoint-path')).toHaveText(api.endpoints[1].path);
    await expect(page.locator('#simulation-body')).toBeVisible();
    await page.locator('#simulation-send').click();
    await expect(page.locator('#simulation-output')).toContainText('"status": 201');
    await page.selectOption('#simulation-scenario', '429');
    await page.locator('#simulation-send').click();
    await expect(page.locator('#simulation-output')).toContainText('"status": 429');
    assert.equal(await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      return ids.length === new Set(ids).size;
    }), true, 'The sheet and endpoint card must not duplicate simulator IDs');
    const shared = page.url();
    await page.goto(shared);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 45000 });
    await expect(page.locator('#endpoint-card')).toHaveAttribute('data-index', '1');
    await expect(page.locator('#panel')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#endpoint-card')).toBeHidden();
    // Real raycast against a facade endpoint, not only the accessible selector.
    await expect.poll(async () => page.locator('#stats').getAttribute('data-endpoint-buildings')).toBe(api.id);
    if (viewport.width > 760) {
      const point = await page.evaluate(async id => {
        const T = await import('/node_modules/three/build/three.module.js');
        const { makeWorld } = await import('/layout.js');
        const { floorProfile } = await import('/building-profile.js');
        const b = makeWorld(await (await fetch('/get-apis.sample.json')).json()).byId.get(id);
        const view = JSON.parse(document.getElementById('stats').dataset.projection);
        const c = new T.PerspectiveCamera(48, innerWidth / innerHeight, .3, 14000);
        c.position.fromArray(view.position); c.lookAt(new T.Vector3().fromArray(view.target)); c.updateMatrixWorld();
        const profile = floorProfile(b.api.compliance.score, 3, b.api.endpoints.length);
        const p = new T.Vector3(b.x + profile.offset, 7, b.z + profile.depth / 2 + .04).project(c);
        return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
      }, api.id);
      await page.mouse.click(point.x, point.y);
      await expect(page.locator('#endpoint-card')).toHaveAttribute('data-index', '2');
      await expect(page.locator('#endpoint-card')).toBeVisible();
      await page.locator('#endpoint-building').click();
    }
    await page.locator('#return-quarter').click();
    await expect(page.locator('#endpoint-card')).toBeHidden();
    await expect(page.locator('#panel')).toBeHidden();
    await expect(page.locator('#state')).toContainText('Vue du quartier');
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).has('endpoint'), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goto(shared);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 45000 });
    await page.keyboard.press('Escape');
    await page.locator('#search').fill('');
    await page.locator('#building-next').click();
    await expect(page.locator('#focus-name')).not.toHaveText(api.name);
    await expect(page.locator('#path-pole')).toHaveText(api.pole.name);
    await page.locator('#building-previous').click();
    await expect(page.locator('#focus-name')).toHaveText(api.name);
    await page.locator('#path-city').click();
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).has('api'), false);
    await page.goto(`${base}/#mode=usage&api=${api.id}&endpoint=9999`);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 45000 });
    await expect(page.locator('#announcement')).toContainText('Endpoint du lien absent');
    await expect(page.locator('#endpoint-card')).toBeHidden();
    await expect(page.locator('#panel')).toBeHidden();
    await page.selectOption('#focus-endpoint', '2');
    await page.locator('#search').fill('does-not-exist');
    await expect(page.locator('#endpoint-card')).toBeVisible();
    await expect(page.locator('#stats')).toHaveAttribute('data-endpoint-buildings', api.id);
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('endpoint'), '2');
    await page.locator('#search').fill('');
    await page.goto(`${base}/#mode=discovery&api=${api.id}&view=facade`);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 45000 });
    await expect(page.locator('#compliance-key')).toContainText('60–99 %');
    await page.screenshot({ path: `test-results/clarity-city-${viewport.width}.png`, timeout: 60000 });
    const cameraBefore = await page.evaluate(() => JSON.parse(document.getElementById('stats').dataset.projection).position);
    await page.locator('#focus-relations').click();
    await expect(page.locator('#relations-view')).toBeVisible();
    await expect(page.locator('#relation-root-id')).toHaveText(api.id);
    const suppliers = [...new Set(api.dependencies.map(item => item.apiId).filter(id => id !== api.id))];
    const consumers = fixtureWorld.buildings.map(building => building.api)
      .filter(item => item.id !== api.id && item.dependencies.some(dependency => dependency.apiId === api.id));
    await expect(page.locator('#relation-suppliers-count')).toHaveText(String(suppliers.length));
    await expect(page.locator('#relation-consumers-count')).toHaveText(String(consumers.length));
    const supplier = source.apis.find(item => item.id === suppliers[0]);
    await page.locator('#relation-suppliers [data-relation]').first().click();
    await expect(page.locator('#relation-sentence')).toHaveText(`${api.name} appelle ${supplier.name}`);
    if (viewport.width > 760) await expect(page.locator('#relation-wire path')).toHaveCount(2);
    await expect(page.locator('[data-relation][aria-pressed="true"]')).toHaveCount(1);
    await page.screenshot({ path: `test-results/clarity-relations-${viewport.width}.png`, timeout: 60000 });
    if (consumers.length) {
      await page.locator('#relation-consumers [data-relation]').first().focus();
      await expect(page.locator('#relation-sentence')).toHaveText(`${consumers[0].name} appelle ${api.name}`);
      await expect(page.locator('[data-relation][aria-pressed="true"]')).toHaveCount(1);
      if (consumers.length > 6) {
        await page.locator('#relation-consumers-pages button').last().click();
        await expect(page.locator('#relation-consumers [data-relation]').first()).toHaveAttribute('data-api', consumers[6].id);
      }
    }
    await page.locator('#relation-suppliers [data-relation]').first().click();
    await page.locator('#relation-recenter').click();
    await expect(page.locator('#relation-root-id')).toHaveText(supplier.id);
    await page.keyboard.press('Escape');
    await expect(page.locator('#relations-view')).not.toBeVisible();
    assert.deepEqual(await page.evaluate(() => JSON.parse(document.getElementById('stats').dataset.projection).position), cameraBefore,
      'The dedicated view must not move the city camera');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goto(`${base}/#mode=discovery&api=${api.id}&view=facade`);
    await page.locator('#search').fill(api.id);
    await page.locator('#focus-relations').click();
    await page.locator('#relation-suppliers [data-relation]').first().click();
    await page.locator('#relation-explore').click();
    await expect(page.locator('#relations-view')).not.toBeVisible();
    await expect(page.locator('#focus-name')).toHaveText(supplier.name);
    await expect(page.locator('#labels .world-label:visible')).toHaveCount(0);
    await expect(page.locator('#search')).toHaveValue('');
    await expect(page.locator('#announcement')).toContainText('filtres incompatibles');
    if (viewport.width > 760) {
      for (const kind of ['green', 'red']) {
        const item = source.apis.find(item => kind === 'green' ? item.compliance.score === 100 : item.compliance.score < 60);
        await page.goto(`${base}/#mode=discovery&api=${item.id}&view=facade`);
        await expect(page.locator('#focus-name')).toHaveText(item.name);
        await page.screenshot({ path: `test-results/clarity-${kind}.png`, timeout: 60000 });
      }
    }
    const mandat = source.apis.find(item => item.name === 'Mandat SEPA' && item.entity.id === 'payplug');
    assert.ok(mandat);
    await page.goto(`${base}/#mode=discovery&api=${mandat.id}&view=facade`);
    await expect(page.locator('#focus-name')).toHaveText(mandat.name);
    await expect(page.locator('#labels .world-label:visible')).toHaveCount(0);
    await expect(page.locator('#path-city')).toHaveText(mandat.entity.name);
    await page.screenshot({ path: `test-results/focused-labels-${viewport.width}.png`, timeout: 60000 });
    await page.locator('#path-world').click();
    await expect.poll(() => page.locator('#labels .city:visible').count()).toBeGreaterThan(0);
    await context.close();
    console.log(`PASS ${viewport.width}px: six original tabs, no Observer bar, green conformity, guided endpoints, simulation, shared links and named direct relations.`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
