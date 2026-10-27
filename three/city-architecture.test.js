import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { makeWorld } from './layout.js';
import { createCityArchitecture, nearbyBuildings, usageHeight } from './city-architecture.js';
import { buildingKind, complianceColor, complianceLabel, floorProfile } from './building-profile.js';
import { buildStreets, apiSignPosition } from './city-life.js';

test('conformité : couleur explicite aux seuils, forme uniforme et inconnus gris', () => {
  assert.deepEqual([0, 59, 60, 79, 80, 99, 100].map(buildingKind), ['red', 'red', 'orange', 'orange', 'orange', 'orange', 'green']);
  assert.deepEqual([59, 60, 99, 100].map(complianceColor), ['#d94e4e', '#ed8a32', '#ed8a32', '#56c98a']);
  for (const score of [undefined, null, NaN, Infinity, -1, 101, '100']) {
    assert.equal(buildingKind(score), 'unknown');
    assert.equal(complianceColor(score), '#8492a2');
    assert.equal(complianceLabel(score), 'Inconnue');
  }
  assert.equal(complianceLabel(100), '100 %');
  const silhouettes = [100, 80, 60, 30].map(score => [0, 1, 2, 3, 4].map(f => floorProfile(score, f, 4)));
  assert.equal(new Set(silhouettes.map(shape => JSON.stringify(shape))).size, 1);
  for (const floors of silhouettes) for (const floor of floors) {
    assert.ok(floor.width / 2 + Math.abs(floor.offset) <= 2.6);
    assert.ok(floor.depth <= 5.2);
  }
});

test('lecture de proximité : un seul bâtiment devant la caméra, priorité stable et filtres respectés', () => {
  const buildings = [1, 2, 3, 4, 100].map(x => ({ x, z: 0, height: 4, api: { id: String(x) } }));
  const camera = new THREE.PerspectiveCamera();
  camera.lookAt(10, 2, 0);
  const matches = new Set(buildings.map(b => b.api.id));
  assert.deepEqual(nearbyBuildings({ buildings }, camera, matches).map(b => b.api.id), ['1']);
  assert.deepEqual(nearbyBuildings({ buildings }, camera, matches, buildings[3]).map(b => b.api.id), ['4']);
  assert.deepEqual(nearbyBuildings({ buildings }, camera, new Set(['100'])), []);
  assert.deepEqual(nearbyBuildings({ buildings }, camera, new Set()), []);
  camera.lookAt(-10, 0, 0);
  assert.deepEqual(nearbyBuildings({ buildings }, camera, matches), []);
});

test('hauteur des appels : échelle logarithmique commune et absence explicite', () => {
  assert.equal(usageHeight(undefined, 100), 0);
  assert.equal(usageHeight(-1, 100), 0);
  assert.equal(usageHeight(0, 100), 0);
  assert.equal(usageHeight(100, 100), 12);
  assert.ok(usageHeight(10, 100) > 0 && usageHeight(10, 100) < 12);
});

test('une façade technique se révèle sans fiche, sans lampadaire dans la lecture et libère ses textures', () => {
  const source = JSON.parse(readFileSync(new URL('./public/get-apis.sample.json', import.meta.url)));
  const world = makeWorld(source);
  const texts = [];
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({
      fillRect() {},
      fillText(text) { texts.push(text); },
      measureText(text) { return { width: text.length * 22 }; },
    }) }),
  };
  const scene = new THREE.Scene();
  const architecture = createCityArchitecture(scene, world);
  try {
    const b = world.buildings[0];
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(b.x, 4, b.z + 12);
    camera.lookAt(b.x, b.height / 2, b.z);
    architecture.update({ mode: 'discovery', matches: new Set([b.api.id]), selected: null });
    architecture.updateView(camera);
    assert.deepEqual(architecture.visibleIds, [b.api.id]);
    for (const endpoint of b.api.endpoints) {
      assert.ok(texts.includes(`${endpoint.method} · ${endpoint.summary}`));
      assert.ok(texts.includes(endpoint.path));
    }
    assert.ok(texts.includes('SERVICES'));
    assert.ok(texts.includes(b.api.contact.phone));
    assert.equal(architecture.pickMeshes.length, 2 + b.api.endpoints.length);
    assert.ok(architecture.pickMeshes.every(mesh => mesh.userData.building === b));
    const endpointMeshes = architecture.pickMeshes.filter(mesh => mesh.userData.action === 'endpoint');
    assert.deepEqual(endpointMeshes.map(mesh => mesh.userData.endpointIndex), b.api.endpoints.map((_, index) => index));
    architecture.highlightEndpoint(b, 0);
    assert.equal(endpointMeshes[0].material.color.getHexString(), 'ffffff');
    assert.notEqual(endpointMeshes[1].material.color.getHexString(), 'ffffff');
    architecture.highlightEndpoint(null);
    assert.ok(endpointMeshes.every(mesh => mesh.material.color.getHexString() === 'ffffff'));
    const interphone = scene.getObjectByName('Interphone');
    assert.equal(interphone.scale.x, 2.3);
    assert.equal(interphone.scale.y, 3.25);
    const label = scene.getObjectByName('Coordonnées de contact');
    assert.ok(Math.abs(6 * label.scale.x / (1.1 * label.scale.y) - 2) < .001);
    assert.equal(label.material.map.image.width, 1024);
    assert.equal(label.material.map.image.height, 512);
    assert.ok(scene.getObjectByName('Bouton de l’interphone'));
    assert.ok(scene.getObjectByName('Grille du haut-parleur'));
    architecture.update({ mode: 'discovery', matches: new Set(), selected: b });
    architecture.updateView(camera);
    assert.deepEqual(architecture.visibleIds, [b.api.id], 'une sélection explicite reste lisible hors filtres');
    assert.equal(architecture.pickMeshes.filter(mesh => mesh.userData.action === 'endpoint').length, b.api.endpoints.length);
    assert.equal(architecture.pickMeshes.filter(mesh => mesh.userData.action === 'contact').length, 2);
    architecture.update({ mode: 'discovery', matches: new Set(), selected: null });
    architecture.updateView(camera);
    assert.deepEqual(architecture.visibleIds, [], 'une proximité seule ne contourne pas les filtres');
    architecture.update({ mode: 'discovery', matches: new Set([b.api.id]), selected: b });
    architecture.updateView(camera);
    const streets = buildStreets(scene, world);
    scene.updateMatrixWorld(true);
    const lighting = [scene.getObjectByName('Mâts des lampadaires'), scene.getObjectByName('Têtes des lampadaires')];
    const slot = scene.getObjectByName('Informations de proximité').children[0];
    const sign = apiSignPosition(b);
    const distance = Math.max(24, b.height * 1.5);
    const viewpoints = [sign.clone().add(new THREE.Vector3(-6, 5.5, 12)),
      new THREE.Vector3(b.x - 10, b.height / 2 + 1 + distance * .18, b.z + 1 + distance)];
    const ray = new THREE.Raycaster();
    for (const origin of viewpoints) {
      for (const object of slot.children.filter(child => child.name.startsWith('Endpoint '))) {
        for (const dx of [-1.8, 0, 1.8]) {
          const target = object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(dx, 0, 0));
          ray.set(origin, target.clone().sub(origin).normalize());
          ray.far = origin.distanceTo(target) - .01;
          assert.equal(ray.intersectObjects(lighting).length, 0, 'les lampadaires ne masquent pas les endpoints');
        }
        for (const object of architecture.pickMeshes) {
          const target = object.getWorldPosition(new THREE.Vector3());
          ray.set(origin, target.clone().sub(origin).normalize());
          ray.far = origin.distanceTo(target) - .15;
          assert.equal(ray.intersectObjects(streets.pickMeshes).length, 0, 'contact dégagé du nom et de la porte');
        }
      }
    }
    const proximity = scene.getObjectByName('Informations de proximité');
    const textures = proximity.children[0].children.filter(mesh => mesh.material.map).map(mesh => mesh.material.map);
    let released = 0;
    for (const texture of textures) texture.addEventListener('dispose', () => released++);
    camera.position.set(100000, 100000, 100000);
    architecture.updateView(camera);
    assert.deepEqual(architecture.visibleIds, []);
    assert.equal(released, textures.length);
    assert.equal(proximity.children.length, 0);
  } finally {
    architecture.dispose();
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('objets 3D : ports, colonnes et totems sans couronne sur les toits', () => {
  const source = JSON.parse(readFileSync(new URL('./public/get-apis.sample.json', import.meta.url)));
  const world = makeWorld(source);
  const scene = new THREE.Scene();
  const architecture = createCityArchitecture(scene, world);
  const group = scene.getObjectByName('Architecture des données');
  const [ports, gauges] = group.children;
  assert.equal(ports.count, source.apis.reduce((count, api) => count + api.endpoints.length, 0));
  assert.equal(gauges.count, 1500);
  assert.equal(group.children.filter(child => child.isInstancedMesh).length, 2);
  const matches = new Set(world.byId.keys());
  architecture.update({ mode: 'governance', matches, selected: null });
  assert.equal(ports.visible, false);
  const color = new THREE.Color();
  architecture.update({ mode: 'usage', matches, selected: null });
  assert.equal(gauges.visible, true);
  const matrix = new THREE.Matrix4();
  const maximum = Math.max(...source.apis.map(api => api.metrics.callsPerDay));
  world.buildings.forEach((building, i) => {
    gauges.getMatrixAt(i, matrix);
    assert.ok(Math.abs(matrix.elements[5] - (usageHeight(building.api.metrics.callsPerDay, maximum) || .1)) < .00001);
  });
  const bars = group.children.slice(2, -1);
  assert.equal(bars.length, 153);
  architecture.update({ mode: 'lifecycle', matches: new Set(), selected: null });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(100000, 10, 100000);
  architecture.updateView(camera);
  assert.ok(bars.every(bar => !bar.visible));
  camera.position.copy(bars[0].position);
  architecture.updateView(camera);
  assert.equal(bars[0].visible, true, 'les totems réapparaissent après un retour dans le quartier');
  const count = group.children.length;
  architecture.update({ mode: 'discovery', matches: new Set(), selected: null });
  assert.equal(group.children.length, count);
  assert.equal(ports.visible, true);
  ports.getColorAt(0, color);
  assert.equal(color.getHexString(), '263341');
  architecture.dispose();
  const geometries = new Set();
  const materials = new Set();
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
    if (object.isInstancedMesh) object.dispose();
  });
  for (const item of [...geometries, ...materials]) item.dispose();
});
