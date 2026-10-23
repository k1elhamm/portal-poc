import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { makeWorld, hash } from './layout.js';
import { buildStreets, createDevelopers, createApiSigns, apiSignPosition } from './city-life.js';

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
const labels = [];
const cityLabels = [];
const history = [];
const keys = new Set();
let world, selected = null, hovered = null, currentCity = null;
let transition = null, dark = false, disposed = false, frame = 0, hoverTimer;
let contextLost = false, ready = false;
let streets, developers, apiSigns;
let animatePeople = true;
let pointerDown = null, moved = false, relationsOn = false;
const relations = new THREE.Group();
scene.add(relations);
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
const unitStatus = new THREE.SphereGeometry(0.38, 8, 6);

function buildBuildings() {
  const groups = new Map();
  for (const b of world.buildings) {
    const score = b.api.compliance.score;
    const kind = score >= 100 ? 'lux' : score >= 80 ? 'good' : score >= 60 ? 'fair' : 'poor';
    const key = `${b.city.id}:${kind}:${b.api.status}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const statusGroups = { PRODUCTION: [], CONSTRUCTION: [], DEPRECATED: [] };
  for (const buildings of groups.values()) {
    const first = buildings[0];
    const score = first.api.compliance.score;
    const color = new THREE.Color(first.city.color).lerp(new THREE.Color('#f7f1e2'), 0.55);
    if (first.api.status === 'DEPRECATED') color.lerp(new THREE.Color('#777b83'), 0.7);
    if (score < 60) color.lerp(new THREE.Color('#88745e'), 0.5);
    const unlit = new THREE.MeshStandardMaterial({ color, map: windows, roughness: score >= 100 ? 0.28 : 0.8,
      metalness: score >= 100 ? 0.3 : 0.06, emissive: '#ffbc58', emissiveMap: windows, emissiveIntensity: 0.18 });
    facadeMaterials.push(unlit);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: score >= 100 ? '#edc265' : color.clone().multiplyScalar(0.8), metalness: 0.25, roughness: 0.6,
    });
    const floorCount = buildings.reduce((sum, b) => sum + b.api.endpoints.length + 1, 0);
    const floors = new THREE.InstancedMesh(unitFloor, unlit, floorCount);
    const roofs = new THREE.InstancedMesh(unitRoof, roofMaterial, buildings.length);
    floors.userData.buildings = [];
    roofs.userData.buildings = buildings;
    let index = 0;
    buildings.forEach((b, ri) => {
      const n = b.api.endpoints.length;
      const ratio = b.api.status === 'DEPRECATED' ? 0.12 : b.api.status === 'CONSTRUCTION' ? 0.5 :
        score >= 100 ? 1 : score >= 80 ? 0.75 : score >= 60 ? 0.45 : 0.18;
      for (let f = 0; f <= n; f++) {
        dummy.position.set(b.x, 0.75 + f * 1.25, b.z);
        dummy.scale.set(1, f === n ? 0.2 : 1, 1);
        dummy.updateMatrix();
        floors.setMatrixAt(index, dummy.matrix);
        const lit = hash(`${b.api.id}:${f}`) / 2 ** 32 < ratio;
        floors.setColorAt(index, new THREE.Color(lit ? '#ffffff' : '#b7c5ca'));
        floors.userData.buildings.push(b);
        index++;
      }
      dummy.position.set(b.x, b.height, b.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      roofs.setMatrixAt(ri, dummy.matrix);
      statusGroups[b.api.status].push(b);
    });
    floors.computeBoundingSphere();
    roofs.computeBoundingSphere();
    scene.add(floors, roofs);
    pickMeshes.push(floors, roofs);
  }
  for (const [status, buildings] of Object.entries(statusGroups)) {
    const color = { PRODUCTION: '#5ce2a0', CONSTRUCTION: '#ffbe4d', DEPRECATED: '#9aa5b7' }[status];
    const mesh = new THREE.InstancedMesh(unitStatus,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.65 }), buildings.length);
    buildings.forEach((b, i) => {
      dummy.position.set(b.x, b.height + 1.3, b.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.userData.buildings = buildings;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    pickMeshes.push(mesh);
  }
  const cranes = [];
  const cracks = [];
  for (const b of world.buildings) {
    if (b.api.status === 'CONSTRUCTION') {
      const y = b.height;
      cranes.push(b.x + 2, 0, b.z, b.x + 2, y + 4, b.z,
        b.x - 3, y + 4, b.z, b.x + 4, y + 4, b.z,
        b.x - 2, y + 4, b.z, b.x - 2, y + 1, b.z);
    }
    if (b.api.compliance.score < 60) {
      for (let f = 1; f < 4; f++) {
        cracks.push(b.x - 0.7 + (f % 2) * 0.5, b.height * f / 5, b.z + 2.61,
          b.x - 0.7 + ((f + 1) % 2) * 0.5, b.height * (f + 1) / 5, b.z + 2.61);
      }
    }
  }
  for (const [vertices, color] of [[cranes, '#ecc166'], [cracks, '#1c2432']]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    scene.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color })));
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

function focusCity(city) {
  saveView();
  currentCity = city;
  $('entity').value = city.id;
  updatePoleOptions(city);
  const pole = city.poles.values().next().value;
  travelTo(new THREE.Vector3(pole.x + pole.width / 2 - 3, 2, pole.z + pole.depth / 2 - 2),
    Math.max(pole.width, pole.depth) * 1.35, false);
  $('state').textContent = `${city.name} · ${city.apis.length} API · ${city.poles.size} pôles`;
}

function updatePoleOptions(city) {
  $('pole').replaceChildren(new Option('Choisir un quartier', ''));
  if (city) {
    for (const p of city.poles.values()) $('pole').append(new Option(`${p.name} · ${p.apis.length} API`, p.id));
  }
  $('pole').disabled = !city;
}

function overview(remember = true) {
  if (remember) saveView();
  currentCity = null;
  $('entity').value = '';
  updatePoleOptions(null);
  const e = world.extent;
  animateCamera(new THREE.Vector3(e * 0.54, e * 0.8, e * 0.76), new THREE.Vector3());
  $('state').textContent = 'Vue du monde · 25 villes · Rotation libre à 360°';
}

function setBounds(helper, b) {
  helper.box.set(new THREE.Vector3(b.x - 2.9, 0, b.z - 2.9),
    new THREE.Vector3(b.x + 2.9, b.height + 0.4, b.z + 2.9));
  helper.visible = true;
}

function pick(event) {
  pointer.set(event.clientX / innerWidth * 2 - 1, 1 - event.clientY / innerHeight * 2);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickMeshes, false)[0];
  return hit ? hit.object.userData.buildings[hit.instanceId] : null;
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
  bar.querySelector('span').textContent = `${statusName[b.api.status]} · ${b.api.endpoints.length} endpoints · ${b.api.compliance.score} %`;
  bar.style.left = `${Math.max(8, Math.min(innerWidth - 320, event.clientX + 12))}px`;
  bar.style.top = `${Math.max(80, Math.min(innerHeight - 120, event.clientY - 85))}px`;
  bar.hidden = false;
}

const tabs = { overview: 'Présentation', functional: 'Fonctionnel', technical: 'Endpoints',
  consumers: 'Consommateurs', contact: 'Contact', governance: 'Gouvernance' };

function selectApi(b, tab = 'overview', navigate = false) {
  selected = b;
  clearHover();
  setBounds(selection, b);
  $('panel').hidden = false;
  $('api-name').textContent = b.api.name;
  $('path').textContent = `${b.city.name} / ${b.pole.name}`;
  $('badges').innerHTML = [statusName[b.api.status], b.api.version, `${b.api.compliance.score} % conformité`,
    `${b.api.endpoints.length} endpoints`].map(v => `<span>${escape(v)}</span>`).join('');
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
  if (navigate) approachApi(b);
}

function showTab(tab) {
  const { api } = selected;
  for (const button of $('tabs').children) button.setAttribute('aria-pressed', String(button.dataset.tab === tab));
  const e = escape;
  if (tab === 'overview') $('content').innerHTML = `<h3>Présentation de l’API</h3><p>${e(api.description || api.name)}</p><p>Service proposé par ${e(selected.city.name)}, au sein du pôle ${e(selected.pole.name)}.</p><h3>Usage et disponibilité</h3><p>${number(api.metrics.callsPerDay)} appels / jour<br>Disponibilité : ${e(api.metrics.availabilityPct ?? '—')} %<br>Latence p95 : ${e(api.metrics.latencyP95Ms ?? '—')} ms</p><p>Catalogue de démonstration : les informations commerciales détaillées restent à enrichir, sans inventer de données métier.</p>`;
  if (tab === 'functional') $('content').innerHTML = `<h3>Capacités fonctionnelles</h3><ul>${api.endpoints.map(ep => `<li>${e(ep.summary)}</li>`).join('')}</ul><p>Tags : ${(api.tags ?? []).map(e).join(', ')}</p>`;
  if (tab === 'technical') $('content').innerHTML = `<p><code>${e(api.basePath)}</code></p>${api.endpoints.map(ep => `<div class="endpoint"><strong>${e(ep.method)}</strong> <code>${e(ep.path)}</code><p>${e(ep.summary)}</p></div>`).join('')}`;
  if (tab === 'contact') $('content').innerHTML = `<h3>Équipe responsable</h3><p>${e(api.contact.team)}</p><p>Responsable : ${e(api.contact.owner.name)}<br>${e(api.contact.owner.email)}</p><p>Référent : ${e(api.contact.lead.name)}<br>${e(api.contact.lead.email)}</p><p>${e(api.contact.phone)}<br>${e(api.contact.channel)}</p>`;
  if (tab === 'governance') $('content').innerHTML = `<h3>Conformité : ${api.compliance.score} %</h3><p>${api.compliance.score >= 100 ? 'Hôtel de luxe : toutes les règles sont respectées.' : 'Règles non respectées :'}</p><ul>${api.compliance.failedRules.map(r => `<li>${e(r)}</li>`).join('')}</ul>`;
  if (tab === 'consumers') {
    $('content').innerHTML = `<h3>Consommateurs internes (${world.consumers.get(api.id).length})</h3><div id="consumer-list"></div><h3>Partenaires externes</h3><ul>${api.externalConsumers.map(c => `<li>${e(c.name)} · ${number(c.callsPerDay)} appels/j</li>`).join('')}</ul>`;
    for (const b of world.consumers.get(api.id)) {
      const button = document.createElement('button');
      button.textContent = `${b.city.shortName ?? b.city.name} · ${b.api.name}`;
      button.onclick = () => selectApi(b, 'overview', true);
      $('consumer-list').append(button);
    }
  }
}

function drawRelations() {
  while (relations.children.length) {
    const child = relations.children[0];
    child.geometry.dispose();
    child.material.dispose();
    relations.remove(child);
  }
  if (!selected || !relationsOn) return;
  const targets = [
    ...selected.api.dependencies.map(d => ({ b: world.byId.get(d.apiId), color: '#67bafa' })),
    ...world.consumers.get(selected.api.id).map(b => ({ b, color: '#f2af6c' })),
  ];
  for (const { b, color } of targets) {
    if (!b) continue;
    const start = new THREE.Vector3(selected.x, selected.height + 1, selected.z);
    const end = new THREE.Vector3(b.x, b.height + 1, b.z);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    mid.y += Math.min(160, start.distanceTo(end) * 0.22) + 12;
    const points = new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(32);
    relations.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })));
  }
}

function setTheme() {
  document.body.classList.toggle('day', !dark);
  scene.background = new THREE.Color(dark ? '#142637' : '#dce7e6');
  scene.fog = new THREE.FogExp2(dark ? '#142637' : '#dce7e6', dark ? 0.00012 : 0.00009);
  ground.material.color.set(dark ? '#344c47' : '#8b9f85');
  hemi.intensity = dark ? 1.3 : 2.5;
  sun.intensity = dark ? 1.5 : 3;
  streets?.setNight(dark);
  for (const m of facadeMaterials) m.emissiveIntensity = dark ? 0.25 : 0.02;
  $('theme').textContent = dark ? '☀ Jour' : '☾ Nuit';
  $('theme').setAttribute('aria-label', dark ? 'Passer en mode jour' : 'Passer en mode nuit');
}

function updateLabels() {
  const visible = [];
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
    if (x < 0 || x > innerWidth || y < 85 || y > innerHeight - 50 ||
        x < 315 && y < innerHeight - 80 || !$('panel').hidden && x > innerWidth - 420) {
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
  $('theme').onclick = () => { dark = !dark; setTheme(); };
  $('overview').onclick = () => overview();
  $('back').onclick = () => {
    const previous = history.pop();
    if (!previous) return;
    currentCity = previous.city;
    $('entity').value = currentCity?.id ?? '';
    updatePoleOptions(currentCity);
    animateCamera(previous.position, previous.target);
    $('back').disabled = !history.length;
    $('state').textContent = currentCity?.name ?? 'Vue précédente';
  };
  $('entity').onchange = () => {
    const city = world.cities.find(c => c.id === $('entity').value);
    if (city) focusCity(city); else overview();
  };
  $('pole').onchange = () => {
    const pole = currentCity?.poles.get($('pole').value);
    if (!pole) return;
    travelTo(new THREE.Vector3(pole.x + pole.width / 2 - 3, 2, pole.z + pole.depth / 2 - 2),
      Math.max(pole.width, pole.depth) * 1.05);
  };
  $('people').onclick = () => {
    animatePeople = !animatePeople;
    $('people').setAttribute('aria-pressed', String(animatePeople));
    $('people').textContent = animatePeople ? 'Mettre les promenades en pause' : 'Reprendre les promenades';
  };
  $('close').onclick = () => { $('panel').hidden = true; selected = null; selection.visible = false; drawRelations(); };
  $('approach').onclick = () => {
    if (selected) approachApi(selected);
  };
  $('relations').onclick = () => {
    relationsOn = !relationsOn;
    $('relations').setAttribute('aria-pressed', String(relationsOn));
    drawRelations();
  };
  $('search').oninput = () => {
    const query = $('search').value.trim().toLocaleLowerCase('fr');
    $('results').replaceChildren();
    $('results').hidden = !query;
    if (!query) return;
    const matches = world.buildings.filter(b =>
      `${b.api.name} ${b.api.id} ${b.city.name} ${b.pole.name}`.toLocaleLowerCase('fr').includes(query)).slice(0, 15);
    if (!matches.length) $('results').textContent = 'Aucune API trouvée.';
    for (const b of matches) {
      const button = document.createElement('button');
      button.innerHTML = `${escape(b.api.name)}<small>${escape(b.city.name)} / ${escape(b.pole.name)}</small>`;
      button.onclick = () => {
        selectApi(b, 'overview', true);
        $('results').hidden = true;
        $('search').value = '';
      };
      $('results').append(button);
    }
  };
  $('search').onkeydown = event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); $('results').querySelector('button')?.focus(); }
    if (event.key === 'Escape') $('results').hidden = true;
  };
  $('hover').onpointerenter = () => clearTimeout(hoverTimer);
  $('hover').onpointerleave = () => { hoverTimer = setTimeout(clearHover, 500); };
  $('hover').onclick = event => {
    const button = event.target.closest('button');
    if (button && hovered) selectApi(hovered, button.dataset.action);
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
    if (b) showHover(b, e);
    else if (hovered) { clearTimeout(hoverTimer); hoverTimer = setTimeout(clearHover, 500); }
  });
  renderer.domElement.addEventListener('pointerleave', () => { hoverTimer = setTimeout(clearHover, 500); });
  renderer.domElement.addEventListener('click', e => {
    if (!moved && pointerDown?.button === 0 && !fly.isLocked) {
      const b = pick(e);
      if (b) selectApi(b);
    }
    pointerDown = null;
  });
  window.addEventListener('pointerup', () => { setTimeout(() => { pointerDown = null; }, 0); });
  renderer.domElement.addEventListener('wheel', () => { transition = null; clearHover(); }, { passive: true });
  renderer.domElement.addEventListener('dblclick', e => {
    if (fly.isLocked) return;
    const b = pick(e);
    if (b) { selectApi(b, 'overview', true); return; }
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
    updateLabels();
    const signs = apiSigns.update(camera, selected?.api.id);
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
  renderer.render(scene, camera);
  if (now - lastStats > 750) {
    $('stats').textContent = `1 500 API · ${developers.count} développeurs · ${renderer.info.render.calls} appels GPU · Alt. ${Math.round(camera.position.y)} m`;
    $('stats').dataset.buildings = String(world.buildings.length);
    $('stats').dataset.camera = camera.position.toArray().map(v => v.toFixed(1)).join(',');
    $('stats').dataset.developers = String(developers.count);
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
    setTheme();
    camera.position.set(world.extent * 0.54, world.extent * 0.8, world.extent * 0.76);
    orbit.target.set(0, 0, 0);
    orbit.update();
    bindEvents();
    ready = true;
    $('loading').hidden = true;
    $('state').textContent = 'Vue du monde · Choisis une ville pour commencer';
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
  cancelAnimationFrame(frame);
  orbit.dispose();
  fly.dispose();
  apiSigns?.dispose();
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
