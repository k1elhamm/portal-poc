import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, BUILDING_SPACING } from './layout.js';
import * as THREE from 'three';
import { buildStreets, apiSignPosition } from './city-life.js';

const source = JSON.parse(readFileSync(new URL('./public/get-apis.sample.json', import.meta.url)));
const world = makeWorld(source);

test('chaque panneau est fixe au pied de son bâtiment, hors de la porte et sélectionnable', () => {
  const scene = new THREE.Scene();
  const { pickMeshes: [boards] } = buildStreets(scene, world);
  assert.equal(boards.count, world.buildings.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  for (const [i, building] of world.buildings.entries()) {
    boards.getMatrixAt(i, matrix);
    matrix.decompose(position, rotation, scale);
    assert.ok(position.distanceTo(apiSignPosition(building)) < 0.001);
    assert.deepEqual(boards.userData.buildings[i], building);
    assert.ok(position.x - scale.x / 2 > building.x + 0.65, 'la porte reste dégagée');
    assert.ok(position.z - scale.z / 2 > building.z + 2.6, 'devant la façade');
    assert.equal(rotation.y, 0, 'orientation fixe, pas de billboard');
  }
  const b = world.buildings[0];
  const p = apiSignPosition(b);
  scene.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(p.clone().add(new THREE.Vector3(0, 0, 4)), new THREE.Vector3(0, 0, -1));
  assert.equal(raycaster.intersectObject(boards)[0].instanceId, 0);
  const geometries = new Set(), materials = new Set();
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
    if (object.isInstancedMesh) object.dispose();
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
});

test('25 villes, 153 pôles et exactement 1500 bâtiments issus de getAPIs', () => {
  assert.equal(world.cities.length, 25);
  assert.equal(world.cities.reduce((sum, c) => sum + c.poles.size, 0), 153);
  assert.equal(world.buildings.length, 1500);
  assert.equal(world.byId.size, 1500);
});

test('les bâtiments de 5,2 unités réservent 22,8 unités latérales et 28,8 entre rangées', () => {
  assert.equal(BUILDING_SPACING.x - 5.2, 22.8);
  assert.equal(BUILDING_SPACING.z - 5.2, 28.8);
  for (const city of world.cities) {
    for (const pole of city.poles.values()) {
      const buildings = world.buildings.filter(b => b.pole === pole);
      for (let i = 0; i < buildings.length; i++) {
        const a = buildings[i];
        assert.equal(a.height, 4 + a.api.endpoints.length * 1.25);
        for (const b of buildings.slice(i + 1)) {
          assert.ok(Math.abs(a.x - b.x) >= BUILDING_SPACING.x || Math.abs(a.z - b.z) >= BUILDING_SPACING.z);
        }
        assert.ok(a.x - 2.6 >= pole.x - 3);
        assert.ok(a.x + 2.6 <= pole.x - 3 + pole.width);
        assert.ok(a.z - 2.6 >= pole.z - 2);
        assert.ok(a.z + 2.6 <= pole.z - 2 + pole.depth);
      }
    }
  }
});

test('les villes ne se recouvrent pas', () => {
  for (let i = 0; i < world.cities.length; i++) {
    const a = world.cities[i];
    for (const b of world.cities.slice(i + 1)) {
      assert.ok(Math.abs(a.x - b.x) > (a.width + b.width) / 2 ||
        Math.abs(a.z - b.z) > (a.depth + b.depth) / 2);
    }
  }
});

test('les consommateurs sont les relations inverses du catalogue', () => {
  const expected = source.apis.filter(a => a.dependencies.some(d => d.apiId === 'bpcesi-1-a1'));
  assert.deepEqual(world.consumers.get('bpcesi-1-a1').map(b => b.api.id).sort(), expected.map(a => a.id).sort());
});

test('les entrées vides et les identifiants dupliqués sont refusés explicitement', () => {
  assert.throws(() => makeWorld({ apis: [] }), /vide ou invalide/);
  assert.throws(() => makeWorld({ apis: [source.apis[0], source.apis[0]] }), /dupliquée/);
});

test('un score de conformité absent ne bloque pas la cité ni ne devient zéro', () => {
  const api = { ...source.apis[0], compliance: undefined };
  const result = makeWorld({ apis: [api] });
  assert.equal(result.buildings.length, 1);
  assert.equal(result.buildings[0].api.compliance, undefined);
});
