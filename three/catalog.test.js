import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld } from './layout.js';
import { matchesApi, impactOf, signalColor, readiness, contactEntries } from './catalog.js';
import { directRelations } from './relations-view.js';

const source = JSON.parse(readFileSync(new URL('./public/get-apis.sample.json', import.meta.url)));

test('relations directes : sens, doublons, cycles et destinations absentes explicites', () => {
  const a = { api: { id: 'a', dependencies: [{ apiId: 'b' }, { apiId: 'b' }, { apiId: 'missing' }, { apiId: 'a' }] } };
  const b = { api: { id: 'b', dependencies: [{ apiId: 'a', source: 'DECLARED' }] } };
  const c = { api: { id: 'c', dependencies: [{ apiId: 'b' }] } };
  const world = { byId: new Map([a, b, c].map(item => [item.api.id, item])),
    consumers: new Map([['a', [a, b, b]], ['b', [a, c]]]) };
  const result = directRelations(world, a);
  assert.deepEqual(result.suppliers.map(item => item.id), ['b', 'missing']);
  assert.equal(result.suppliers[1].building, undefined);
  assert.deepEqual(result.consumers.map(item => item.id), ['b']);
  assert.equal(result.consumers[0].dependency.source, 'DECLARED');
  assert.deepEqual(directRelations(world, c).consumers, []);
});

test('contacts : personnes nommées, emails et absences explicites sans objet brut', () => {
  const api = source.apis[0];
  const entries = contactEntries(api);
  assert.ok(entries.some(([label, value]) => label === 'RESPONSABLE' && value.includes(api.contact.owner.name) && value.includes(api.contact.owner.email)));
  assert.ok(entries.every(([, value]) => typeof value === 'string' && !value.includes('[object Object]')));
  assert.ok(contactEntries({}).every(([, value]) => /non renseign/.test(value)));
});

test('recherche par capacité, accents, descriptions et filtres combinés', () => {
  const api = source.apis.find(a => a.name.includes('Jeton OAuth2'));
  assert.ok(matchesApi(api, { query: 'authentification' }));
  assert.ok(matchesApi(api, { query: 'IDENTITÉ' }));
  assert.ok(matchesApi(api, { query: api.id, city: api.entity.id, domain: api.pole.domain, status: api.status }));
  assert.equal(matchesApi(api, { city: 'inexistante' }), false);
  assert.equal(matchesApi(api, { query: 'inconnue' }), false);
  const described = { ...api, description: 'Transformer des documents en PDF' };
  assert.ok(matchesApi(described, { query: 'document pdf' }));
});

test('analyse d’impact : cycles, diamants, profondeur, graphe sans consommateur', () => {
  const building = id => ({ api: { id } });
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(building);
  const world = { byId: new Map([a, b, c, d].map(x => [x.api.id, x])),
    consumers: new Map([['a', [b, c]], ['b', [d]], ['c', [d]], ['d', [a]]]) };
  assert.deepEqual(impactOf(world, 'a').map(x => x.building.api.id), ['b', 'c']);
  const all = impactOf(world, 'a', true);
  assert.deepEqual(all.map(x => [x.building.api.id, x.depth, x.via]), [['b', 1, 'a'], ['c', 1, 'a'], ['d', 2, 'b']]);
  assert.throws(() => impactOf(world, 'x'), /inconnue/);
  world.consumers.set('a', []);
  assert.deepEqual(impactOf(world, 'a', true), []);
});

test('métriques absentes : aucun état rassurant inventé et bornes inclusives', () => {
  assert.equal(signalColor({ compliance: {} }, 'governance', 100), '#8492a2');
  assert.equal(signalColor({}, 'usage', 100), '#8492a2');
  assert.equal(signalColor({ compliance: { score: 80 } }, 'governance'), '#ed8a32');
  assert.equal(signalColor({ compliance: { score: 60 } }, 'governance'), '#ed8a32');
  assert.match(readiness({}).access, /non renseignée/);
  assert.match(readiness({}).documentation, /non fournie/);
});

test('analyse complète du catalogue finie, sans doublon ni racine dans les résultats', () => {
  const world = makeWorld(source);
  const result = impactOf(world, source.apis[0].id, true);
  assert.ok(result.length <= world.buildings.length - 1);
  assert.equal(result.length, new Set(result.map(x => x.building.api.id)).size);
  assert.ok(result.every(x => x.building.api.id !== source.apis[0].id && x.depth >= 1));
});
