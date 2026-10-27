import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { makeWorld } from './layout.js';
import { buildStreets, createDevelopers, createApiSigns, apiSignPosition } from './city-life.js';
import { MODES, DOMAINS, matchesApi, normalize, finite, impactOf, readiness, contactEntries } from './catalog.js';
import { createCitySignals } from './city-signals.js';
import { createCityArchitecture } from './city-architecture.js';
import { buildingKind, complianceColor, complianceLabel, floorProfile } from './building-profile.js';
import { createRelationsView } from './relations-view.js';

const $ = (id) => document.getElementById(id);
const statusName = { PRODUCTION: 'Production', CONSTRUCTION: 'Construction', DEPRECATED: 'Dépréciée' };
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = (n) => new Intl.NumberFormat('fr', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
} catch (error) {
  $('loading').textContent = `WebGL2 ne peut pas démarrer dans ce navigateur. Après plusieurs pertes de contexte, le navigateur peut bloquer son initialisation. Fermez cet onglet et ouvrez http://localhost:4333 dans un navigateur externe compatible WebGL2. Détail : ${error.message}`;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
$('world').append(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Monde 3D : utiliser les commandes de navigation ou la recherche pour sélectionner une API');
renderer.domElement.tabIndex = 0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.3, 14000);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.09;
orbit.maxPolarAngle = Math.PI / 2 - 0.025;
orbit.minDistance = 5;
orbit.maxDistance = 7000;
orbit.screenSpacePanning = false;
const fly = new PointerLockControls(camera, renderer.domElement);
fly.pointerSpeed = 0.65;
fly.minPolarAngle = 0.03;
fly.maxPolarAngle = Math.PI - 0.03;
const hemi = new THREE.HemisphereLight('#bdd8fc', '#222d29', 2);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffe6b6', 3);
sun.position.set(-300, 700, 400);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(18000, 18000),
  new THREE.MeshStandardMaterial({ color: '#8b9f85', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.35;
scene.add(ground);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dummy = new THREE.Object3D();
const pickMeshes = [];
const facadeMaterials = [];
const visualMeshes = [];
const labels = [];
const cityLabels = [];
const history = [];
const keys = new Set();
let world, selected = null, hovered = null, currentCity = null;
let transition = null, dark = true, disposed = false, frame = 0, hoverTimer;
let contextLost = false, ready = false;
let streets, developers, apiSigns, signals, architecture, relationsView;
let contactBuilding = null, contactView = null;
let endpointFocus = null, spatialBuilding = null;
let mode = 'discovery', activeTab = 'overview', resultLimit = 24;
let matches = new Set(), related = new Map();
let filters = { query: '', domain: '', status: '', city: '' };
let simulation = null;
let animatePeople = true;
let pointerDown = null, moved = false, relationsOn = false;
const selection = new THREE.Box3Helper(new THREE.Box3(), '#ffd365');
selection.visible = false;
scene.add(selection);
const hoverOutline = new THREE.Box3Helper(new THREE.Box3(), '#ffffff');
hoverOutline.visible = false;
scene.add(hoverOutline);
const projected = new THREE.Vector3();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function boxGeometry(width, height, depth) {
  return new THREE.BoxGeometry(width, height, depth);
}

function addBox(x, y, z, w, h, d, color, roughness = 0.9) {
  const mesh = new THREE.Mesh(boxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness }));
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

function facadeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Le dessin des textures canvas est indisponible.');
  ctx.fillStyle = '#d0d2c8';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#9aaeb1';
  ctx.fillRect(0, 58, 128, 6);
  for (let x = 8; x < 120; x += 29) {
    ctx.fillStyle = '#284c61';
    ctx.fillRect(x, 10, 23, 42);
    ctx.fillStyle = '#70a5af';
    ctx.fillRect(x + 2, 12, 19, 17);
    ctx.fillStyle = '#b9d1cc';
    ctx.fillRect(x + 3, 13, 2, 14);
    ctx.fillStyle = '#c4ccc4';
    ctx.fillRect(x + 11, 10, 2, 42);
    ctx.fillRect(x, 30, 23, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

const windows = facadeTexture();
const unitFloor = boxGeometry(5.2, 1.25, 5.2);
const unitRoof = boxGeometry(5.7, 0.35, 5.7);

function buildBuildings() {
  const groups = new Map();
  for (const b of world.buildings) {
    const score = b.api.compliance?.score;
    const kind = buildingKind(score);
    const key = kind;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  for (const buildings of groups.values()) {
    const first = buildings[0];
    const score = first.api.compliance?.score;
    const color = new THREE.Color(complianceColor(score));
    const unlit = new THREE.MeshStandardMaterial({ color, map: windows, roughness: 0.7,
      metalness: 0.08, emissive: color, emissiveIntensity: 0.08 });
    facadeMaterials.push(unlit);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color, metalness: 0.08, roughness: 0.6,
    });
    const floorCount = buildings.reduce((sum, b) => sum + b.api.endpoints.length + 1, 0);
    const floors = new THREE.InstancedMesh(unitFloor, unlit, floorCount);
    const roofs = new THREE.InstancedMesh(unitRoof, roofMaterial, buildings.length);
    floors.userData.buildings = [];
    roofs.userData.buildings = buildings;
    let index = 0;
    buildings.forEach((b, ri) => {
      const n = b.api.endpoints.length;
      for (let f = 0; f <= n; f++) {
        const profile = floorProfile();
        dummy.position.set(b.x + profile.offset, f === 0 ? 2.15 : 3.25 + f * 1.25, b.z);
        dummy.scale.set(profile.width / 5.2, f === 0 ? 2.8 : 1, profile.depth / 5.2);
        dummy.updateMatrix();
        floors.setMatrixAt(index, dummy.matrix);
        floors.setColorAt(index, new THREE.Color('#ffffff'));
        floors.userData.buildings.push(b);
        index++;
      }
      dummy.position.set(b.x, b.height, b.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      roofs.setMatrixAt(ri, dummy.matrix);
      dummy.rotation.y = 0;
    });
    floors.computeBoundingSphere();
    roofs.computeBoundingSphere();
    floors.userData.baseColors = floors.instanceColor.array.slice();
    roofs.userData.baseColors = new Float32Array(buildings.length * 3).fill(1);
    visualMeshes.push(floors, roofs);
    scene.add(floors, roofs);
    pickMeshes.push(floors, roofs);
  }
}

function createLabel(text, x, y, z, type, action, color) {
  const element = document.createElement('button');
  element.className = `world-label ${type}`;
  element.textContent = text;
  element.style.setProperty('--entity', color ?? '#8995aa');
  element.addEventListener('click', action);
  $('labels').append(element);
  const item = { element, position: new THREE.Vector3(x, y, z), type };
  labels.push(item);
  return item;
}

function buildTerrain() {
  for (const city of world.cities) {
    addBox(city.x, -0.08, city.z, city.width, 0.45, city.depth, '#737f82');
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeometry(city.width, 0.5, city.depth)),
      new THREE.LineBasicMaterial({ color: city.color, transparent: true, opacity: 0.7 }));
    edge.position.set(city.x, 0, city.z);
    scene.add(edge);
    cityLabels.push(createLabel(city.shortName ?? city.name, city.x, 6, city.z - city.depth / 2 + 4,
      'city', () => focusCity(city), city.color));
    for (const pole of city.poles.values()) {
      addBox(pole.x + pole.width / 2 - 3, 0.22, pole.z + pole.depth / 2 - 2,
        pole.width, 0.12, pole.depth, new THREE.Color(city.color).lerp(new THREE.Color('#c0c6af'), 0.7).multiplyScalar(pole.tone));
      const label = createLabel(pole.name, pole.x + pole.width / 2 - 3, 1, pole.z + pole.depth,
        'pole', () => travelTo(new THREE.Vector3(pole.x + pole.width / 2, 3, pole.z + pole.depth / 2), 65));
      label.city = city;
    }
  }
  const treeGeometry = new THREE.IcosahedronGeometry(2.6, 1);
  const treePositions = [];
  for (const c of world.cities) {
    for (let x = -c.width / 2; x <= c.width / 2; x += 16) {
      treePositions.push([c.x + x, c.z - c.depth / 2 - 6], [c.x + x, c.z + c.depth / 2 + 6]);
    }
  }
  const trees = new THREE.InstancedMesh(treeGeometry, new THREE.MeshStandardMaterial({ color: '#5c8b70', roughness: 1, flatShading: true }), treePositions.length);
  treePositions.forEach(([x, z], i) => {
    dummy.position.set(x, 3, z);
    dummy.updateMatrix();
    trees.setMatrixAt(i, dummy.matrix);
  });
  scene.add(trees);
  const road = new THREE.MeshStandardMaterial({ color: '#354552', roughness: 1 });
  for (const c of world.cities) {
    const street = new THREE.Mesh(boxGeometry(c.width + 30, 0.03, 6), road);
    street.position.set(c.x, -0.12, c.z + c.depth / 2 + 22);
    scene.add(street);
  }
}

function saveView() {
  history.push({ position: camera.position.clone(), target: orbit.target.clone(), city: currentCity });
  if (history.length > 20) history.shift();
  $('back').disabled = false;
}

function animateCamera(position, target) {
  clearHover();
  // Consume orbit inertia before an explicit trip so the destination and its signs settle.
  const damping = orbit.enableDamping;
  orbit.enableDamping = false;
  orbit.update();
  orbit.enableDamping = damping;
  transition = { start: performance.now(), from: camera.position.clone(), to: position,
    targetFrom: orbit.target.clone(), targetTo: target, duration: reducedMotion ? 0 : 1100 };
}

function travelTo(target, distance, remember = true) {
  if (remember) saveView();
  const direction = camera.position.clone().sub(orbit.target).normalize();
  if (direction.y < 0.25) direction.y = 0.5;
  direction.normalize();
  animateCamera(target.clone().addScaledVector(direction, distance), target);
}

function approachApi(building) {
  saveView();
  const target = apiSignPosition(building);
  animateCamera(target.clone().add(new THREE.Vector3(-6, 5.5, 12)), target);
}

function inspectBuilding(b) {
  clearEndpoint();
  closeContact();
  if (selected !== b) selectApi(b);
  spatialBuilding = b;
  saveView();
  const target = new THREE.Vector3(b.x, b.height / 2 + 1, b.z + 1);
  const distance = Math.max(innerWidth <= 760 ? 32 : 24, b.height * 1.7);
  animateCamera(target.clone().add(new THREE.Vector3(-2, distance * .1, distance)), target);
  $('panel').hidden = true;
  document.body.classList.remove('panel-open', 'panel-full');
  $('panel-full').setAttribute('aria-pressed', 'false');
  $('panel-full').setAttribute('aria-label', 'Agrandir la fiche');
  document.body.classList.add('nav-collapsed');
  $('nav-toggle').setAttribute('aria-expanded', 'false');
  $('state').textContent = `${b.api.name} · Façade technique · Interphone pour l’équipe et les contacts`;
  renderer.domElement.focus();
  writeLocation();
}

function clearEndpoint() {
  clearTimeout(simulation);
  endpointFocus = null;
  $('endpoint-card').hidden = true;
  document.body.classList.remove('endpoint-open');
  $('endpoint-simulator').replaceChildren();
  architecture?.highlightEndpoint(null);
}

function inspectEndpoint(b, index) {
  if (!Number.isInteger(index) || !b.api.endpoints[index]) {
    $('announcement').textContent = 'Cet endpoint est absent du catalogue.';
    return;
  }
  if (selected !== b || !$('panel').hidden) inspectBuilding(b);
  closeContact();
  clearEndpoint();
  $('simulator')?.replaceChildren();
  spatialBuilding = b;
  endpointFocus = { building: b, index };
  const ep = b.api.endpoints[index];
  $('endpoint-title').textContent = `${ep.method} · ${ep.summary}`;
  $('endpoint-path').textContent = ep.path;
  const parameters = [...ep.path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
  $('endpoint-parameters').textContent = parameters.length ?
    `Paramètres de chemin : ${parameters.join(', ')}. Types et contraintes non fournis.` :
    'Aucun paramètre de chemin. Paramètres de requête et schémas non fournis.';
  $('endpoint-feedback').textContent = 'Données fictives · aucun appel réseau.';
  $('endpoint-card').hidden = false;
  document.body.classList.add('endpoint-open');
  $('endpoint-card').scrollTop = 0;
  $('endpoint-card').dataset.index = String(index);
  $('focus-endpoint').value = String(index);
  architecture.highlightEndpoint(b, index);
  const mobile = innerWidth <= 760;
  const distance = mobile ? Math.max(10, 6.6 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)) : 8;
  const target = new THREE.Vector3(b.x, 4.5 + index * 1.25 - (mobile ? distance * .2 : 0), b.z + 2.7);
  animateCamera(target.clone().add(new THREE.Vector3(0, .1, distance)), target);
  $('endpoint-copy').focus();
  $('announcement').textContent = `Endpoint ${ep.method} ${ep.summary}. Échap pour revoir le bâtiment.`;
  writeLocation();
}

function clearBuildingFocus() {
  clearEndpoint();
  closeContact();
  clearHover();
  spatialBuilding = null;
  selected = null;
  selection.visible = false;
  $('panel').hidden = true;
  document.body.classList.remove('panel-open', 'panel-full');
  drawRelations();
}

function returnToQuarter() {
  const b = endpointFocus?.building ?? spatialBuilding ?? architecture.activeBuilding ?? selected;
  if (!b) return;
  clearBuildingFocus();
  currentCity = b.city;
  $('entity').value = b.city.id;
  updatePoleOptions(b.city);
  $('pole').value = b.pole.id;
  travelTo(new THREE.Vector3(b.pole.x + b.pole.width / 2 - 3, 2, b.pole.z + b.pole.depth / 2 - 2),
    Math.max(b.pole.width, b.pole.depth) * 1.1);
  $('state').textContent = `${b.city.name} › ${b.pole.name} · Vue du quartier`;
  renderer.domElement.focus();
  writeLocation();
}

function adjacentBuilding(step) {
  const b = spatialBuilding ?? architecture.activeBuilding;
  if (!b) return;
  const neighbors = world.buildings.filter(item => item.pole === b.pole && matches.has(item.api.id));
  const index = neighbors.indexOf(b);
  if (index < 0 || neighbors.length < 2) {
    $('announcement').textContent = 'Aucune autre API ne correspond aux filtres dans ce quartier.';
    return;
  }
  inspectBuilding(neighbors[(index + step + neighbors.length) % neighbors.length]);
}

function showContact(b) {
  if (!b) return;
  clearEndpoint();
  clearHover();
  if (!contactBuilding) contactView = { position: camera.position.clone(), target: orbit.target.clone() };
  contactBuilding = b;
  $('contact-team').textContent = b.api.contact?.team || 'Équipe non renseignée';
  $('contact-list').replaceChildren();
  for (const [label, value] of contactEntries(b.api)) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value;
    $('contact-list').append(dt, dd);
  }
  $('contact-feedback').textContent = 'Données fictives · aucun appel téléphonique ne sera lancé.';
  $('contact-card').hidden = false;
  $('contact-card').dataset.api = b.api.id;
  $('panel').hidden = true;
  document.body.classList.remove('panel-open');
  const target = new THREE.Vector3(b.x - 3.9, 2.2, b.z + 3.85);
  animateCamera(target.clone().add(new THREE.Vector3(0, .2, innerWidth <= 760 ? 6.5 : 5.8)), target);
  $('close-contact').focus();
  $('announcement').textContent = `Interphone de ${b.api.name}. Vous restez dans la cité.`;
}

function closeContact(restore = false) {
  if (!contactBuilding) return;
  if (restore && contactView) animateCamera(contactView.position, contactView.target);
  contactBuilding = null;
  contactView = null;
  $('contact-card').hidden = true;
}

function focusControls() {
  const b = architecture.activeBuilding;
  if (endpointFocus && (fly.isLocked || !transition && endpointFocus.building !== b)) {
    clearEndpoint();
    writeLocation();
  }
  if (endpointFocus) architecture.highlightEndpoint(endpointFocus.building, endpointFocus.index);
  $('building-focus').hidden = !b || !$('panel').hidden || fly.isLocked;
  if (contactBuilding && (b !== contactBuilding || !$('panel').hidden || fly.isLocked)) closeContact();
  if (!b) return;
  $('focus-name').textContent = b.api.name;
  $('focus-summary').textContent = `${b.api.endpoints.length} endpoints · Conformité : ${complianceLabel(b.api.compliance?.score)} · ${b.api.version}`;
  $('focus-description').textContent = b.api.description || 'Description non renseignée.';
  $('path-city').textContent = b.city.name;
  $('path-pole').textContent = b.pole.name;
  $('reopen-results').hidden = !filters.query;
  if ($('focus-endpoint').dataset.api !== b.api.id) {
    $('focus-endpoint').replaceChildren(new Option('Choisir un étage…', ''),
      ...b.api.endpoints.map((ep, index) => new Option(`${ep.method} · ${ep.summary}`, String(index))));
    $('focus-endpoint').dataset.api = b.api.id;
  }
  $('focus-endpoint').value = endpointFocus?.building === b ? String(endpointFocus.index) : '';
}

function focusCity(city) {
  clearBuildingFocus();
  saveView();
  currentCity = city;
  $('entity').value = city.id;
  updatePoleOptions(city);
  const pole = city.poles.values().next().value;
  travelTo(new THREE.Vector3(pole.x + pole.width / 2 - 3, 2, pole.z + pole.depth / 2 - 2),
    Math.max(pole.width, pole.depth) * 1.35, false);
  $('state').textContent = `${city.name} · ${city.apis.length} API · ${city.poles.size} pôles`;
  writeLocation();
}

function updatePoleOptions(city) {
  $('pole').replaceChildren(new Option('Choisir un quartier', ''));
  if (city) {
    for (const p of city.poles.values()) $('pole').append(new Option(`${p.name} · ${p.apis.length} API`, p.id));
  }
  $('pole').disabled = !city;
}

function overview(remember = true) {
  clearBuildingFocus();
  if (remember) saveView();
  currentCity = null;
  $('entity').value = '';
  updatePoleOptions(null);
  const e = world.extent;
  animateCamera(new THREE.Vector3(e * 0.54, e * 0.8, e * 0.76), new THREE.Vector3());
  $('state').textContent = 'Vue du monde · 25 villes · Rotation libre à 360°';
  writeLocation();
}

function setBounds(helper, b) {
  helper.box.set(new THREE.Vector3(b.x - 2.9, 0, b.z - 2.9),
    new THREE.Vector3(b.x + 2.9, b.height + 0.4, b.z + 2.9));
  helper.visible = true;
}

function pickHit(event) {
  pointer.set(event.clientX / innerWidth * 2 - 1, 1 - event.clientY / innerHeight * 2);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects([...pickMeshes, ...architecture.pickMeshes], false)[0];
}

function pick(event) {
  const hit = pickHit(event);
  return hit ? hit.object.userData.building ?? hit.object.userData.buildings[hit.instanceId] : null;
}

function clearHover() {
  clearTimeout(hoverTimer);
  hovered = null;
  hoverOutline.visible = false;
  $('hover').hidden = true;
}

function showHover(b, event) {
  clearTimeout(hoverTimer);
  hovered = b;
  setBounds(hoverOutline, b);
  const bar = $('hover');
  bar.querySelector('strong').textContent = b.api.name;
  bar.querySelector('span').textContent = `${statusName[b.api.status]} · ${b.api.version} · Conformité : ${complianceLabel(b.api.compliance?.score)}`;
  bar.querySelector('.hover-description').textContent = b.api.description;
  bar.querySelector('.hover-access').textContent = `${readiness(b.api).access} · Essais simulés disponibles`;
  bar.style.left = `${Math.max(8, Math.min(innerWidth - 330, event.clientX + 12))}px`;
  bar.style.top = `${Math.max(135, Math.min(innerHeight - 270, event.clientY - 180))}px`;
  bar.hidden = false;
}

const tabs = { overview: 'Présentation', functional: 'Fonctionnel', technical: 'Endpoints',
  consumers: 'Consommateurs', contact: 'Contact', governance: 'Gouvernance' };

function writeLocation() {
  if (!world) return;
  const params = new URLSearchParams({ mode });
  if (selected) { params.set('api', selected.api.id); params.set('tab', activeTab); }
  else if (currentCity) params.set('city', currentCity.id);
  if (endpointFocus) {
    params.set('api', endpointFocus.building.api.id);
    params.set('endpoint', String(endpointFocus.index));
    params.set('view', 'facade');
  } else if (spatialBuilding && selected === spatialBuilding && $('panel').hidden) params.set('view', 'facade');
  window.history.replaceState(null, '', `#${params}`);
}

function restoreLocation() {
  closeContact();
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('mode') && !MODES[params.get('mode')]) {
    $('announcement').textContent = 'Mode du lien inconnu : affichage Découverte.';
  }
  mode = MODES[params.get('mode')] ? params.get('mode') : 'discovery';
  const building = world.byId.get(params.get('api'));
  const city = world.cities.find(c => c.id === params.get('city'));
  if (building) {
    selectApi(building, tabs[params.get('tab')] ? params.get('tab') : 'overview', true);
    if (params.get('view') === 'facade' || params.has('endpoint')) inspectBuilding(building);
    if (params.has('endpoint')) {
      const value = params.get('endpoint');
      if (/^\d+$/.test(value) && building.api.endpoints[Number(value)]) inspectEndpoint(building, Number(value));
      else $('announcement').textContent = 'Endpoint du lien absent : affichage du bâtiment.';
    }
  }
  else if (city) focusCity(city);
  else {
    overview(false);
    if (params.has('api') || params.has('city')) $('announcement').textContent = 'La destination de ce lien est absente du catalogue.';
  }
  setMode(mode);
}

function setMode(next) {
  mode = next;
  relationsOn = mode === 'dependencies';
  $('relations').setAttribute('aria-pressed', String(relationsOn));
  $('relation-tools').hidden = !relationsOn;
  drawRelations();
  writeLocation();
}

function updateSignals() {
  signals?.update({ mode, matches, selected, related });
  architecture?.update({ mode, matches, selected });
  const color = new THREE.Color();
  for (const mesh of visualMeshes) {
    const base = mesh.userData.baseColors;
    mesh.userData.buildings.forEach((b, i) => {
      color.fromArray(base, i * 3);
      if (b !== selected && (!matches.has(b.api.id) || mode === 'dependencies' && selected && !related.has(b.api.id))) color.multiplyScalar(.26);
      mesh.setColorAt(i, color);
    });
    mesh.instanceColor.needsUpdate = true;
  }
}

function refreshMatches(showResults = false) {
  matches = new Set(world.buildings.filter(b => matchesApi(b.api, filters)).map(b => b.api.id));
  $('filter-count').textContent = `· ${matches.size} / ${world.buildings.length}`;
  $('announcement').textContent = `${matches.size} API correspondent aux filtres.`;
  updateSignals();
  if (showResults) { resultLimit = 24; renderResults(); }
}

function renderResults() {
  const all = world.buildings.filter(b => matches.has(b.api.id));
  const exact = normalize(filters.query).trim();
  all.sort((a, b) => Number(normalize(b.api.id) === exact) - Number(normalize(a.api.id) === exact) ||
    Number(normalize(b.api.name) === exact) - Number(normalize(a.api.name) === exact) || a.api.name.localeCompare(b.api.name, 'fr'));
  $('results').hidden = false;
  $('search').setAttribute('aria-expanded', 'true');
  $('results').innerHTML = `<div class="results-head"><span>${all.length} API · catalogue fictif</span><button type="button" id="dismiss-results" aria-label="Fermer les résultats">×</button></div>`;
  $('dismiss-results').onclick = hideResults;
  if (!all.length) $('results').insertAdjacentHTML('beforeend', '<p>Aucune API ne correspond. Essayez une autre capacité ou réinitialisez les filtres.</p>');
  for (const b of all.slice(0, resultLimit)) {
    const button = document.createElement('button');
    button.innerHTML = `<strong>${escape(b.api.name)}</strong><small class="result-description">${escape(b.api.description)}</small><small>${escape(b.city.name)} / ${escape(b.pole.name)}</small><small class="result-tags">${escape(statusName[b.api.status])} · ${escape(readiness(b.api).access)}</small>`;
    button.onclick = () => { hideResults(); selectApi(b, 'overview', true); };
    $('results').append(button);
    const guide = document.createElement('button');
    guide.className = 'result-guide';
    guide.dataset.api = b.api.id;
    guide.textContent = `Me guider vers ${b.api.name} →`;
    guide.onclick = () => { hideResults(); inspectBuilding(b); };
    $('results').append(guide);
  }
  if (all.length > resultLimit) {
    const button = document.createElement('button');
    button.textContent = `Afficher les suivantes (${all.length - resultLimit} restantes)`;
    button.onclick = () => { resultLimit += 24; renderResults(); };
    $('results').append(button);
  }
}

function hideResults() {
  $('results').hidden = true;
  $('search').setAttribute('aria-expanded', 'false');
}

function selectApi(b, tab = 'overview', navigate = false) {
  const openRelations = tab === 'relationships';
  if (!tabs[tab]) tab = 'overview';
  clearEndpoint();
  spatialBuilding = null;
  closeContact();
  clearTimeout(simulation);
  selected = b;
  currentCity = b.city;
  $('entity').value = b.city.id;
  updatePoleOptions(b.city);
  $('pole').value = b.pole.id;
  clearHover();
  setBounds(selection, b);
  $('panel').hidden = false;
  document.body.classList.add('panel-open');
  if (innerWidth <= 760) {
    document.body.classList.add('nav-collapsed');
    $('nav-toggle').setAttribute('aria-expanded', 'false');
  }
  $('api-name').textContent = b.api.name;
  $('path').textContent = `${b.city.name} / ${b.pole.name}`;
  $('badges').innerHTML = `<span class="${b.api.status === 'DEPRECATED' ? 'deprecated' : ''}">${escape(statusName[b.api.status])}</span>` +
    [b.api.version, `${b.api.endpoints.length} endpoints`, 'Données fictives'].map(v => `<span>${escape(v)}</span>`).join('');
  $('tabs').replaceChildren();
  for (const [id, label] of Object.entries(tabs)) {
    const button = document.createElement('button');
    button.textContent = label;
    button.dataset.tab = id;
    button.onclick = () => showTab(id);
    $('tabs').append(button);
  }
  showTab(tab);
  drawRelations();
  $('announcement').textContent = `API sélectionnée : ${b.api.name}`;
  $('state').textContent = `${b.city.name} › ${b.pole.name} › ${b.api.name}`;
  if (navigate) approachApi(b);
  writeLocation();
  if (openRelations) fitRelations();
}

function showTab(tab) {
  if (!selected) return;
  clearTimeout(simulation);
  activeTab = tab;
  const { api } = selected;
  for (const button of $('tabs').children) button.setAttribute('aria-pressed', String(button.dataset.tab === tab));
  const e = escape;
  if (tab === 'overview') $('content').innerHTML = `<h3>Une capacité à intégrer</h3><p>${e(api.description || api.name)}</p><p>Service proposé par <b>${e(selected.city.name)}</b>, au sein du pôle ${e(selected.pole.name)}.</p>
    ${api.status === 'DEPRECATED' ? '<div class="callout warning">API dépréciée. Vérifiez la stratégie de remplacement avec le responsable avant toute nouvelle intégration. Date de retrait non renseignée.</div>' : ''}
    <div class="fact-grid"><div><b>${api.endpoints.length}</b><small>opérations déclarées</small></div><div><b>${complianceLabel(api.compliance?.score)}</b><small>conformité · pas un état de santé</small></div></div>
    <p>Version ${e(api.version)} · ${e(statusName[api.status])} · Catalogue fictif.</p>`;
  if (tab === 'functional') $('content').innerHTML = `<h3>Capacités fonctionnelles</h3><p>${e(api.description)}</p><ul>${api.endpoints.map(ep => `<li>${e(ep.summary)}</li>`).join('')}</ul><p>Tags : ${(api.tags ?? []).map(e).join(', ')}</p><div class="callout">Les règles métier détaillées, schémas de données et limites fonctionnelles ne sont pas fournis dans le jeu de démonstration.</div>`;
  if (tab === 'technical') {
    $('content').innerHTML = `<h3>Endpoints & atelier d’essais</h3><div class="callout">Simulation locale uniquement. Pas de requête envoyée, pas de schémas contractuels ni de réponse métier réelle.</div><p>Chemin de base : <code>${e(api.basePath)}</code></p>
      ${api.endpoints.map((ep, i) => `<div class="endpoint"><strong>${e(ep.method)}</strong> <code>${e(ep.path)}</code><p>${e(ep.summary)}</p><button data-simulate="${i}">Préparer cet appel →</button></div>`).join('')}<div id="simulator"></div>`;
    $('content').querySelectorAll('[data-simulate]').forEach(button => {
      button.onclick = () => renderSimulator(api, Number(button.dataset.simulate));
    });
  }
  if (tab === 'contact') $('content').innerHTML = `<h3>Équipe responsable</h3><p>${e(api.contact.team)}</p><p>Responsable : ${e(api.contact.owner.name)}<br>${e(api.contact.owner.email)}</p><p>Référent : ${e(api.contact.lead.name)}<br>${e(api.contact.lead.email)}</p><p>${e(api.contact.phone)}<br>${e(api.contact.channel)}</p>`;
  if (tab === 'governance') {
    const kind = buildingKind(api.compliance?.score);
    $('content').innerHTML = `<h3>Conformité : ${complianceLabel(api.compliance?.score)}</h3><p>${kind === 'unknown' ?
      'Gris : score absent ou invalide. La conformité ne peut pas être déduite.' : kind === 'green' ?
      'Vert : toutes les règles évaluées sont respectées (100 %).' :
      `${kind === 'orange' ? 'Orange : conformité partielle (60–99 %).' : 'Rouge : conformité inférieure à 60 %.'} Règles non respectées :`}</p>
      <ul>${(api.compliance?.failedRules ?? []).map(r => `<li>${e(r)}</li>`).join('')}</ul>`;
  }
  if (tab === 'consumers') {
    $('content').innerHTML = `<h3>Consommateurs internes (${world.consumers.get(api.id).length})</h3><button id="open-api-relations">Qui appelle qui ?</button><div id="consumer-list"></div><h3>Partenaires externes</h3><ul>${api.externalConsumers.map(c => `<li>${e(c.name)} · ${number(c.callsPerDay)} appels/j</li>`).join('')}</ul>`;
    $('open-api-relations').onclick = fitRelations;
    for (const b of world.consumers.get(api.id)) {
      const button = document.createElement('button');
      button.textContent = `${b.city.shortName ?? b.city.name} · ${b.api.name}`;
      button.onclick = () => selectApi(b, 'overview', true);
      $('consumer-list').append(button);
    }
  }
  writeLocation();
}

function renderSimulator(api, index, host = $('simulator')) {
  const ep = api.endpoints[index];
  host.innerHTML = `<h3>Atelier · ${escape(ep.summary)}</h3><label>Endpoint<select id="simulation-endpoint">${api.endpoints.map((item, i) => `<option value="${i}" ${i === index ? 'selected' : ''}>${escape(item.method)} ${escape(item.summary)}</option>`).join('')}</select></label>
    <p><code>${escape(ep.method)} ${escape(ep.path)}</code></p>
    ${ep.path.includes('{id}') ? '<label>Identifiant de démonstration<input id="simulation-id" value="DEMO-042" maxlength="120"></label>' : ''}
    ${['POST', 'PUT', 'PATCH'].includes(ep.method) ? '<label>Corps JSON de démonstration<textarea id="simulation-body">{\n  "reference": "DEMO-042"\n}</textarea></label>' : ''}
    <label>Scénario de réponse<select id="simulation-scenario"><option value="success">Succès simulé</option><option value="401">401 · Accès refusé simulé</option><option value="429">429 · Quota dépassé simulé</option><option value="500">500 · Erreur fournisseur simulée</option></select></label>
    <button id="simulation-send">Exécuter la simulation locale</button><pre id="simulation-output" class="simulation-output" role="status">Prêt · aucun appel réseau ne sera envoyé.</pre>`;
  $('simulation-endpoint').onchange = () => {
    clearTimeout(simulation);
    const next = Number($('simulation-endpoint').value);
    if (host.id === 'endpoint-simulator' && endpointFocus) inspectEndpoint(endpointFocus.building, next);
    renderSimulator(api, next, host);
  };
  $('simulation-send').onclick = () => {
    const output = $('simulation-output');
    const id = $('simulation-id')?.value ?? '';
    const body = $('simulation-body')?.value;
    if (ep.path.includes('{id}') && !id.trim()) { output.textContent = 'Erreur : saisissez un identifiant.'; return; }
    if (body) {
      try { JSON.parse(body); } catch (error) { output.textContent = `JSON invalide : ${error.message}`; return; }
    }
    const scenario = $('simulation-scenario').value;
    $('simulation-send').disabled = true;
    output.textContent = 'Simulation locale en cours…';
    simulation = setTimeout(() => {
      const code = scenario === 'success' ? ep.method === 'POST' ? 201 : ep.method === 'DELETE' ? 204 : 200 : Number(scenario);
      output.textContent = JSON.stringify({ simulation: true, networkRequestSent: false, status: code,
        method: ep.method, path: ep.path.replaceAll('{id}', encodeURIComponent(id)),
        message: code < 300 ? 'Exemple de succès, sans valeur contractuelle.' : 'Exemple d’erreur simulée, sans appel fournisseur.' }, null, 2);
      $('simulation-send').disabled = false;
    }, reducedMotion ? 0 : 350);
  };
  host.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
}

function drawRelations() {
  related = new Map();
  $('relation-count').textContent = '';
  if (!selected || !relationsOn) {
    $('relation-title').textContent = 'Sélectionnez une API pour révéler le graphe';
    updateSignals();
    return;
  }
  $('relation-title').textContent = selected.api.name;
  const impact = impactOf(world, selected.api.id);
  const targets = [
    ...selected.api.dependencies.map(d => ({ from: selected, to: world.byId.get(d.apiId), color: '#62caff' })),
    ...impact.map(item => ({ from: item.building, to: world.byId.get(item.via), color: item.depth > 1 ? '#ff70b6' : '#f2af6c' })),
  ].filter(item => item.from && item.to);
  for (const item of targets) {
    if (item.from !== selected) related.set(item.from.api.id, item.color);
    if (item.to !== selected) related.set(item.to.api.id, item.color);
  }
  $('relation-count').textContent = `${selected.api.dependencies.length} fournisseurs déclarés · ${impact.length} API potentiellement impactées`;
  updateSignals();
}

function fitRelations() {
  if (!selected) { $('announcement').textContent = 'Sélectionnez d’abord une API.'; return; }
  relationsView.open(selected);
}

function setTheme() {
  document.body.classList.toggle('day', !dark);
  scene.background = new THREE.Color(dark ? '#142637' : '#dce7e6');
  scene.fog = new THREE.FogExp2(dark ? '#142637' : '#dce7e6', dark ? 0.00012 : 0.00009);
  ground.material.color.set(dark ? '#344c47' : '#8b9f85');
  hemi.intensity = dark ? 1.3 : 2.5;
  sun.intensity = dark ? 1.5 : 3;
  streets?.setNight(dark);
  signals?.setNight(dark);
  for (const m of facadeMaterials) m.emissiveIntensity = dark ? 0.12 : 0.02;
  $('theme').textContent = dark ? '☀ Jour' : '☾ Nuit';
  $('theme').setAttribute('aria-label', dark ? 'Passer en mode jour' : 'Passer en mode nuit');
}

function updateLabels() {
  if (architecture.activeBuilding) {
    for (const item of labels) item.element.hidden = true;
    return;
  }
  const visible = [];
  const obstacles = [document.querySelector('header'),
    $('navigation'), $('panel'), $('relation-tools'), $('compliance-key')]
    .filter(element => element.getClientRects().length && getComputedStyle(element).display !== 'none')
    .map(element => element.getBoundingClientRect());
  for (const item of labels) {
    const distance = camera.position.distanceTo(item.position);
    const allowed = !fly.isLocked && (item.type === 'city' ||
      item.type === 'pole' && distance < 700 ||
      item.type === 'api' && (item.building === selected || item.building === hovered));
    if (!allowed) { item.element.hidden = true; continue; }
    projected.copy(item.position).project(camera);
    if (projected.z < -1 || projected.z > 1) { item.element.hidden = true; continue; }
    const x = (projected.x + 1) * innerWidth / 2;
    const y = (1 - projected.y) * innerHeight / 2;
    if (x < 0 || x > innerWidth || y < 105 || y > innerHeight - 50 ||
        obstacles.some(rect => x > rect.left - 25 && x < rect.right + 25 && y > rect.top && y < rect.bottom + 20)) {
      item.element.hidden = true;
      continue;
    }
    visible.push({ item, distance, x, y });
  }
  visible.sort((a, b) => (a.item.type === 'api' ? -1 : 0) - (b.item.type === 'api' ? -1 : 0) || a.distance - b.distance);
  const rects = [];
  let apiCount = 0;
  for (const { item, x, y } of visible) {
    item.element.hidden = false;
    const width = item.element.offsetWidth;
    const height = item.element.offsetHeight;
    const rect = { x: x - width / 2, y: y - height, w: width, h: height };
    if (item.type === 'api' && apiCount >= 24 || rects.some(r =>
      rect.x < r.x + r.w + 5 && rect.x + rect.w + 5 > r.x &&
      rect.y < r.y + r.h + 4 && rect.y + rect.h + 4 > r.y)) {
      item.element.hidden = true;
      continue;
    }
    rects.push(rect);
    if (item.type === 'api') apiCount++;
    item.element.hidden = false;
    item.element.style.left = `${x}px`;
    item.element.style.top = `${y}px`;
  }
}

function bindEvents() {
  for (const [id, name] of Object.entries(DOMAINS)) $('domain-filter').append(new Option(name, id));
  for (const city of world.cities) $('city-filter').append(new Option(city.name, city.id));
  for (const [id, key] of [['domain-filter', 'domain'], ['status-filter', 'status'], ['city-filter', 'city']]) {
    $(id).onchange = () => { filters[key] = $(id).value; refreshMatches(true); };
  }
  $('browse').onclick = () => { refreshMatches(true); $('search').focus(); };
  $('reset-filters').onclick = () => {
    filters = { query: '', domain: '', status: '', city: '' };
    for (const id of ['search', 'domain-filter', 'status-filter', 'city-filter']) $(id).value = '';
    refreshMatches(true);
  };
  document.querySelectorAll('[data-query]').forEach(button => {
    button.onclick = () => { $('search').value = button.dataset.query; filters.query = button.dataset.query; refreshMatches(true); $('search').focus(); };
  });
  $('nav-toggle').onclick = () => {
    const collapsed = document.body.classList.toggle('nav-collapsed');
    $('nav-toggle').setAttribute('aria-expanded', String(!collapsed));
  };
  if (innerWidth <= 760) {
    document.body.classList.add('nav-collapsed');
    $('nav-toggle').setAttribute('aria-expanded', 'false');
  }
  $('panel-full').onclick = () => {
    const full = document.body.classList.toggle('panel-full');
    $('panel-full').setAttribute('aria-pressed', String(full));
    $('panel-full').setAttribute('aria-label', full ? 'Réduire la fiche' : 'Agrandir la fiche');
  };
  $('focus-frame').onclick = () => { if (architecture.activeBuilding) inspectBuilding(architecture.activeBuilding); };
  $('focus-details').onclick = () => { if (architecture.activeBuilding) selectApi(architecture.activeBuilding); };
  $('focus-contact').onclick = () => showContact(architecture.activeBuilding);
  $('focus-relations').onclick = () => {
    const b = architecture.activeBuilding;
    if (!b) return;
    if (selected !== b) inspectBuilding(b);
    setMode('dependencies');
    fitRelations();
  };
  $('focus-endpoint').onchange = () => {
    const value = $('focus-endpoint').value;
    if (value !== '' && architecture.activeBuilding) inspectEndpoint(architecture.activeBuilding, Number(value));
  };
  $('return-quarter').onclick = returnToQuarter;
  $('path-pole').onclick = returnToQuarter;
  $('path-world').onclick = () => overview();
  $('path-city').onclick = () => { if (architecture.activeBuilding) focusCity(architecture.activeBuilding.city); };
  $('building-previous').onclick = () => adjacentBuilding(-1);
  $('building-next').onclick = () => adjacentBuilding(1);
  $('reopen-results').onclick = () => { renderResults(); $('search').focus(); };
  const wholeBuilding = () => {
    const b = endpointFocus?.building;
    if (b) inspectBuilding(b);
  };
  $('endpoint-close').onclick = wholeBuilding;
  $('endpoint-building').onclick = wholeBuilding;
  $('endpoint-copy').onclick = async () => {
    if (!endpointFocus) return;
    const ep = endpointFocus.building.api.endpoints[endpointFocus.index];
    try {
      if (!navigator.clipboard) throw new Error('Presse-papiers indisponible.');
      await navigator.clipboard.writeText(ep.path);
      $('endpoint-feedback').textContent = 'Chemin copié.';
    } catch (error) {
      console.warn('Copie du chemin impossible', error);
      $('endpoint-feedback').textContent = `Copie impossible : ${error.message} Le chemin reste sélectionnable.`;
    }
  };
  $('endpoint-simulate').onclick = () => {
    if (endpointFocus) renderSimulator(endpointFocus.building.api, endpointFocus.index, $('endpoint-simulator'));
  };
  $('close-contact').onclick = () => { closeContact(true); renderer.domElement.focus(); };
  $('copy-contact').onclick = async () => {
    if (!contactBuilding) return;
    try {
      if (!navigator.clipboard) throw new Error('Presse-papiers indisponible.');
      await navigator.clipboard.writeText(contactEntries(contactBuilding.api).map(([label, value]) => `${label} : ${value}`).join('\n'));
      $('contact-feedback').textContent = 'Coordonnées copiées · catalogue fictif.';
    } catch (error) {
      console.warn('Copie du contact impossible', error);
      $('contact-feedback').textContent = `Copie impossible : ${error.message} Les coordonnées restent sélectionnables ci-dessus.`;
    }
  };
  $('fit-relations').onclick = fitRelations;
  window.addEventListener('hashchange', restoreLocation);
  $('theme').onclick = () => { dark = !dark; setTheme(); };
  $('overview').onclick = () => overview();
  $('back').onclick = () => {
    const previous = history.pop();
    if (!previous) return;
    clearBuildingFocus();
    currentCity = previous.city;
    $('entity').value = currentCity?.id ?? '';
    updatePoleOptions(currentCity);
    animateCamera(previous.position, previous.target);
    $('back').disabled = !history.length;
    $('state').textContent = currentCity?.name ?? 'Vue précédente';
    writeLocation();
  };
  $('entity').onchange = () => {
    const city = world.cities.find(c => c.id === $('entity').value);
    if (city) focusCity(city); else overview();
  };
  $('pole').onchange = () => {
    const pole = currentCity?.poles.get($('pole').value);
    if (!pole) return;
    clearBuildingFocus();
    travelTo(new THREE.Vector3(pole.x + pole.width / 2 - 3, 2, pole.z + pole.depth / 2 - 2),
      Math.max(pole.width, pole.depth) * 1.05);
    writeLocation();
  };
  $('people').onclick = () => {
    animatePeople = !animatePeople;
    $('people').setAttribute('aria-pressed', String(animatePeople));
    $('people').textContent = animatePeople ? 'Mettre les animations en pause' : 'Reprendre les animations';
  };
  $('close').onclick = () => {
    clearTimeout(simulation);
    $('panel').hidden = true;
    document.body.classList.remove('panel-open', 'panel-full');
    $('panel-full').setAttribute('aria-pressed', 'false');
    $('panel-full').setAttribute('aria-label', 'Agrandir la fiche');
    selected = null; selection.visible = false; drawRelations(); writeLocation();
  };
  $('approach').onclick = () => {
    if (selected) inspectBuilding(selected);
  };
  $('relations').onclick = () => {
    setMode(mode === 'dependencies' ? 'discovery' : 'dependencies');
    if (mode === 'dependencies' && selected) fitRelations();
  };
  $('search').oninput = () => {
    filters.query = $('search').value;
    refreshMatches(Boolean(filters.query.trim()));
    if (!filters.query.trim()) hideResults();
  };
  $('search').onkeydown = event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); $('results').querySelector('button:not(#dismiss-results)')?.focus(); }
    if (event.key === 'Escape') hideResults();
  };
  $('results').onkeydown = event => {
    const buttons = [...$('results').querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape') { hideResults(); $('search').focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  };
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.search')) hideResults();
  });
  document.addEventListener('keydown', event => {
    if ($('relations-view').open) return;
    if (endpointFocus && event.key === 'Escape' && !fly.isLocked) {
      event.preventDefault(); wholeBuilding(); return;
    }
    if (contactBuilding && event.key === 'Escape') {
      event.preventDefault(); closeContact(true); renderer.domElement.focus();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('search').focus(); }
    if (event.key === 'Escape' && !fly.isLocked) { hideResults(); if (!$('panel').hidden) $('close').click(); }
  });
  $('hover').onpointerenter = () => clearTimeout(hoverTimer);
  $('hover').onpointerleave = () => { hoverTimer = setTimeout(clearHover, 500); };
  $('hover').onclick = event => {
    const button = event.target.closest('button');
    if (button && hovered) {
      if (button.dataset.action === 'relationships') {
        inspectBuilding(hovered);
        fitRelations();
      } else selectApi(hovered, button.dataset.action);
    }
  };
  renderer.domElement.addEventListener('pointerdown', e => {
    transition = null;
    pointerDown = { x: e.clientX, y: e.clientY, button: e.button };
    moved = false;
    clearHover();
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (fly.isLocked || transition) return;
    if (pointerDown && Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 4) moved = true;
    if (pointerDown) return;
    const b = pick(e);
    renderer.domElement.style.cursor = b ? 'pointer' : 'grab';
    const hit = b ? pickHit(e) : null;
    if (hit?.object.userData.action === 'endpoint') {
      clearHover();
      const index = hit.object.userData.endpointIndex;
      architecture.highlightEndpoint(b, endpointFocus?.index ?? index);
      $('state').textContent = `${b.api.endpoints[index].method} · ${b.api.endpoints[index].summary} · Cliquer pour explorer cet étage`;
    } else if (b) {
      architecture.highlightEndpoint(endpointFocus?.building, endpointFocus?.index);
      showHover(b, e);
    }
    else if (hovered) { clearTimeout(hoverTimer); hoverTimer = setTimeout(clearHover, 500); }
    if (!b) architecture.highlightEndpoint(endpointFocus?.building, endpointFocus?.index);
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    architecture.highlightEndpoint(endpointFocus?.building, endpointFocus?.index);
    hoverTimer = setTimeout(clearHover, 500);
  });
  renderer.domElement.addEventListener('click', e => {
    if (!moved && pointerDown?.button === 0 && !fly.isLocked) {
      const hit = pickHit(e);
      if (hit) {
        const b = hit.object.userData.building ?? hit.object.userData.buildings[hit.instanceId];
        if (hit.object.userData.action === 'contact') showContact(b);
        else if (hit.object.userData.action === 'endpoint') inspectEndpoint(b, hit.object.userData.endpointIndex);
        else inspectBuilding(b);
      }
    }
    pointerDown = null;
  });
  window.addEventListener('pointerup', () => { setTimeout(() => { pointerDown = null; }, 0); });
  renderer.domElement.addEventListener('wheel', () => { transition = null; clearHover(); }, { passive: true });
  renderer.domElement.addEventListener('dblclick', e => {
    if (fly.isLocked) return;
    if (pickHit(e)?.object.userData.action === 'endpoint') return;
    const b = pick(e);
    if (b) { selectApi(b, 'overview', true); return; }
    pointer.set(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(ground)[0];
    if (hit) travelTo(hit.point, 80);
  });
  $('fly').onclick = () => {
    clearHover();
    transition = null;
    fly.lock();
  };
  fly.addEventListener('lock', () => {
    keys.clear();
    orbit.enabled = false;
    $('crosshair').hidden = false;
    document.body.classList.add('flying');
    $('state').textContent = 'Vol libre · WASD / ZQSD · E monter · C descendre · Maj accélérer · Échap quitter';
  });
  fly.addEventListener('unlock', () => {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    orbit.target.copy(camera.position).addScaledVector(direction, 40);
    orbit.target.y = Math.max(0, orbit.target.y);
    camera.position.y = Math.max(2, camera.position.y);
    orbit.enabled = true;
    keys.clear();
    $('crosshair').hidden = true;
    document.body.classList.remove('flying');
    $('state').textContent = 'Navigation orbitale · Clique sur un bâtiment pour ouvrir sa fiche';
  });
  document.addEventListener('pointerlockerror', () => {
    $('announcement').textContent = 'Le navigateur a refusé le vol libre. Utilisez les commandes orbitales à la souris.';
    $('state').textContent = 'Vol libre refusé par le navigateur : navigation orbitale disponible.';
  });
  window.addEventListener('keydown', e => {
    if (!fly.isLocked) return;
    if (e.code === 'Escape') { fly.unlock(); return; }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); if (fly.isLocked) fly.unlock(); });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    clearHover();
    keys.clear();
    if (fly.isLocked) fly.unlock();
    $('loading').hidden = false;
    $('loading').textContent = 'Contexte graphique perdu. Rendu suspendu en attendant sa restauration par le navigateur. Si le problème persiste, ouvrez http://localhost:4333 dans un navigateur externe compatible WebGL2.';
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    if (!ready || disposed) return;
    $('loading').hidden = true;
    $('state').textContent = 'Contexte graphique restauré · Navigation disponible';
    lastTime = 0;
    cancelAnimationFrame(frame);
    if (!document.hidden) frame = requestAnimationFrame(animate);
  });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frame);
    keys.clear();
    if (!document.hidden && ready && !disposed && !contextLost) {
      lastTime = 0;
      frame = requestAnimationFrame(animate);
    }
  });
}

let lastTime = 0, lastLabels = 0, lastStats = 0, lastLife = 0, walkingTime = 0;
function animate(now) {
  if (disposed || contextLost || document.hidden) return;
  frame = requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  if (transition) {
    const t = transition.duration ? Math.min(1, (now - transition.start) / transition.duration) : 1;
    const e = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.from, transition.to, e);
    orbit.target.lerpVectors(transition.targetFrom, transition.targetTo, e);
    if (t === 1) transition = null;
  }
  if (fly.isLocked) {
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 180 : 45) * dt;
    fly.moveForward(((keys.has('KeyW') || keys.has('ArrowUp')) - (keys.has('KeyS') || keys.has('ArrowDown'))) * speed);
    fly.moveRight(((keys.has('KeyD') || keys.has('ArrowRight')) - (keys.has('KeyA') || keys.has('ArrowLeft'))) * speed);
    camera.position.y += ((keys.has('KeyE') || keys.has('Space')) - keys.has('KeyC')) * speed;
    camera.position.y = Math.max(2, Math.min(6000, camera.position.y));
  } else orbit.update();
  if (now - lastLabels > 180) {
    const signs = apiSigns.update(camera, selected?.api.id);
    architecture.updateView(camera, hovered);
    updateLabels();
    focusControls();
    $('stats').dataset.projection = JSON.stringify({ position: camera.position.toArray(), target: orbit.target.toArray() });
    $('stats').dataset.signs = String(signs);
    lastLabels = now;
  }
  if (animatePeople && !reducedMotion) walkingTime += dt * 1000;
  if (now - lastLife > 50) {
    const people = developers.update(walkingTime, camera);
    $('stats').dataset.walk = people.sample;
    $('stats').dataset.peopleVisible = String(people.visible);
    lastLife = now;
  }
  signals?.animate(now, reducedMotion || !animatePeople);
  renderer.render(scene, camera);
  if (now - lastStats > 750) {
    $('stats').textContent = `1 500 API · ${developers.count} développeurs · ${renderer.info.render.calls} appels GPU · Alt. ${Math.round(camera.position.y)} m`;
    $('stats').dataset.buildings = String(world.buildings.length);
    $('stats').dataset.camera = camera.position.toArray().map(v => v.toFixed(1)).join(',');
    $('stats').dataset.developers = String(developers.count);
    $('stats').dataset.mode = mode;
    $('stats').dataset.matches = String(matches.size);
    $('stats').dataset.relations = '0';
    $('stats').dataset.ports = String(architecture.portCount);
    $('stats').dataset.endpointBuildings = architecture.visibleIds.join(',');
    lastStats = now;
  }
}

async function start() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}get-apis.sample.json`);
    if (!response.ok) throw new Error(`Chargement getAPIs : HTTP ${response.status}`);
    world = makeWorld(await response.json());
    for (const c of world.cities) {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = `${c.name} · ${c.apis.length} API`;
      $('entity').append(option);
    }
    buildTerrain();
    buildBuildings();
    streets = buildStreets(scene, world);
    pickMeshes.push(...streets.pickMeshes);
    developers = createDevelopers(scene, world, reducedMotion);
    apiSigns = createApiSigns(scene, world);
    signals = createCitySignals(scene, world);
    architecture = createCityArchitecture(scene, world);
    relationsView = createRelationsView($('relations-view'), world, {
      explore: b => {
        const outsideFilters = !matches.has(b.api.id);
        if (outsideFilters) {
          filters = { query: '', domain: '', status: '', city: '' };
          for (const id of ['search', 'domain-filter', 'status-filter', 'city-filter']) $(id).value = '';
          refreshMatches();
          hideResults();
        }
        inspectBuilding(b);
        if (outsideFilters) $('announcement').textContent = `${b.api.name} affichée dans la cité. Les filtres incompatibles ont été réinitialisés.`;
      },
      center: b => selectApi(b, 'consumers'),
    });
    setTheme();
    camera.position.set(world.extent * 0.54, world.extent * 0.8, world.extent * 0.76);
    orbit.target.set(0, 0, 0);
    orbit.update();
    bindEvents();
    refreshMatches();
    if (!location.hash) {
      const city = world.cities[0];
      currentCity = city;
      $('entity').value = city.id;
      updatePoleOptions(city);
      const pole = city.poles.values().next().value;
      const target = new THREE.Vector3(pole.x + pole.width / 2 - 3, 3, pole.z + pole.depth / 2 - 2);
      orbit.target.copy(target);
      camera.position.copy(target).add(new THREE.Vector3(85, 85, 100));
      orbit.update();
    }
    restoreLocation();
    ready = true;
    $('loading').hidden = true;
    if (!selected) $('state').textContent = currentCity ? `${currentCity.name} · Cherchez une capacité ou explorez le quartier` : 'Vue du monde · Choisissez une ville pour commencer';
    frame = requestAnimationFrame(animate);
  } catch (error) {
    console.error('Construction du monde impossible', error);
    $('loading').hidden = false;
    $('loading').textContent = `Le monde ne peut pas être chargé : ${error.message}`;
  }
}

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  disposed = true;
  clearTimeout(simulation);
  cancelAnimationFrame(frame);
  orbit.dispose();
  fly.dispose();
  apiSigns?.dispose();
  architecture?.dispose();
  relationsView?.dispose();
  const geometries = new Set();
  const materials = new Set();
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const m of Array.isArray(object.material) ? object.material : [object.material]) if (m) materials.add(m);
    if (object.isInstancedMesh) object.dispose();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  windows.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
});

void start();
