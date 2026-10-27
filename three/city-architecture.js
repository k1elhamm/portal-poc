import * as THREE from 'three';
import { finite, signalColor } from './catalog.js';
import { floorProfile } from './building-profile.js';

export const METHOD_COLORS = {
  GET: '#63caff', POST: '#6de3ab', PUT: '#ffcf70', PATCH: '#bd9aff', DELETE: '#ff80a6',
};

export function usageHeight(calls, maximum) {
  if (!finite(calls) || calls < 0) return 0;
  return 12 * Math.log1p(calls) / Math.log1p(Math.max(1, maximum));
}

export function nearbyBuildings(world, camera, matches, preferred) {
  const distance = b => camera.position.distanceToSquared(new THREE.Vector3(b.x, b.height / 2, b.z));
  const direction = camera.getWorldDirection(new THREE.Vector3());
  return world.buildings.filter(b => matches.has(b.api.id) && distance(b) < 65 ** 2 &&
    new THREE.Vector3(b.x, b.height / 2, b.z).sub(camera.position).normalize().dot(direction) > .3)
    .sort((a, b) => Number(b === preferred) - Number(a === preferred) || distance(a) - distance(b))
    .slice(0, 1);
}

// City-wide marks are instanced; detailed textures belong to one active facade.
export function createCityArchitecture(scene, world) {
  const group = new THREE.Group();
  group.name = 'Architecture des données';
  scene.add(group);
  const pose = new THREE.Object3D();
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const maxCalls = Math.max(1, ...world.buildings.map(b => finite(b.api.metrics?.callsPerDay) ? b.api.metrics.callsPerDay : 0));
  const endpoints = world.buildings.flatMap(b => b.api.endpoints.map((endpoint, index) => ({ b, endpoint, index })));
  const ports = new THREE.InstancedMesh(new THREE.BoxGeometry(.3, .55, 1.6), white, endpoints.length);
  const gauges = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .22, 1, 6), white, world.buildings.length);
  for (const [i, { b, endpoint, index }] of endpoints.entries()) {
    pose.position.set(b.x + 2.85, 1.3 + index * 1.25, b.z);
    pose.rotation.set(0, 0, 0);
    pose.scale.set(1, 1, 1);
    pose.updateMatrix();
    ports.setMatrixAt(i, pose.matrix);
    ports.setColorAt(i, new THREE.Color(METHOD_COLORS[endpoint.method] ?? '#8492a2'));
  }
  group.add(ports, gauges);
  ports.computeBoundingSphere();

  const districtBars = [];
  const columnGeometry = new THREE.BoxGeometry(2.2, 1, 2.2);
  const statusColors = { PRODUCTION: '#56dfb0', CONSTRUCTION: '#ffd075', DEPRECATED: '#8492a2' };
  for (const city of world.cities) {
    for (const pole of city.poles.values()) {
      const sculpture = new THREE.Group();
      sculpture.position.set(pole.x - 4, 0, pole.z + 2);
      let y = .2;
      for (const [status, color] of Object.entries(statusColors)) {
        const count = pole.apis.filter(api => api.status === status).length;
        if (!count) continue;
        const height = count * .65;
        const mesh = new THREE.Mesh(columnGeometry, new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: .35, metalness: .4, roughness: .4,
        }));
        mesh.position.y = y + height / 2;
        mesh.scale.y = height;
        y += height + .15;
        sculpture.add(mesh);
      }
      group.add(sculpture);
      districtBars.push(sculpture);
    }
  }
  const dock = new THREE.Group();
  dock.name = 'Informations de proximité';
  group.add(dock);
  let active = null;
  let focused = null;
  let currentMode = 'discovery';
  let currentMatches = new Set();
  const slots = new Map();
  const labelGeometry = new THREE.PlaneGeometry(6, 1.1);
  const frameGeometry = new THREE.BoxGeometry(1, 1, 1);
  const buttonGeometry = new THREE.CylinderGeometry(1, 1, 1, 32);
  const ringGeometry = new THREE.TorusGeometry(.27, .025, 8, 32);
  const labelMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, toneMapped: false });
  function releaseSlot(id) {
    const slot = slots.get(id);
    slot.group.traverse(child => { if (child.material) child.material.dispose(); });
    for (const texture of slot.textures) texture.dispose();
    dock.remove(slot.group);
    slots.delete(id);
  }
  function showDock(b) {
    const buildingGroup = new THREE.Group();
    buildingGroup.position.set(b.x, 0, b.z);
    buildingGroup.userData.apiId = b.api.id;
    const textures = [];
    slots.set(b.api.id, { group: buildingGroup, textures });
    dock.add(buildingGroup);
    function plate(lines, x, y, width = 6, z = 4.1) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#102637';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#80dece';
      ctx.fillRect(0, 0, 10, canvas.height);
      lines.forEach((line, i) => {
        ctx.font = `${i === 0 ? 'bold 35' : '29'}px sans-serif`;
        ctx.fillText(line, 24, 54 + i * 56, 972);
      });
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      const panel = new THREE.Mesh(labelGeometry, labelMaterial.clone());
      panel.name = 'Services du bâtiment';
      panel.material.map = texture;
      panel.scale.set(width / 6, .7, 1);
      panel.position.set(x, y, z);
      buildingGroup.add(panel);
      return panel;
    }
    plate(['SERVICES', ...[...new Set(b.api.endpoints.map(ep => ep.summary))].reduce((lines, name, i) => {
      if (i % 3 === 0) lines.push(name); else lines[lines.length - 1] += ` · ${name}`;
      return lines;
    }, []).slice(0, 3)], 0, 3.1, 3.5, 3.46);
    b.api.endpoints.forEach((endpoint, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 768;
      canvas.height = 144;
      const ctx = canvas.getContext('2d');
      const color = METHOD_COLORS[endpoint.method] ?? '#8492a2';
      ctx.fillStyle = '#102637';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 8, canvas.height);
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(`${endpoint.method} · ${endpoint.summary}`, 24, 46, 720);
      ctx.font = '23px monospace';
      ctx.fillStyle = '#e1edf2';
      ctx.fillText(endpoint.path, 24, 100, 720);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      const panel = new THREE.Mesh(labelGeometry, labelMaterial.clone());
      panel.name = `Endpoint ${i}`;
      panel.userData.action = 'endpoint';
      panel.userData.building = b;
      panel.userData.endpointIndex = i;
      panel.material.map = texture;
      const profile = floorProfile();
      panel.scale.set((profile.width - .2) / 6, .87, 1);
      panel.position.set(profile.offset, 4.5 + i * 1.25, profile.depth / 2 + .035);
      buildingGroup.add(panel);
    });
    for (const x of [-1.9, 1.9]) {
      const jamb = new THREE.Mesh(frameGeometry, new THREE.MeshStandardMaterial({
        color: '#4aadb2', emissive: '#51d9d2', emissiveIntensity: .25, metalness: .5, roughness: .4,
      }));
      jamb.position.set(x, 1.8, 3.3);
      jamb.scale.set(.16, 2.6, .3);
      buildingGroup.add(jamb);
    }
    const contact = new THREE.Mesh(labelGeometry, labelMaterial.clone());
    buildingGroup.add(contact);
    contact.name = 'Coordonnées de contact';
    // Match the physical label's 2:1 ratio instead of stretching a wide texture vertically.
    contact.scale.set(1.9 / 6, .95 / 1.1, 1);
    contact.position.set(-3.9, 2.05, 3.88);
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Le dessin de l’étiquette de l’interphone est indisponible.');
    ctx.fillStyle = '#f0f4ed';
    ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#18313b';
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText('ÉQUIPE / SUPPORT', 42, 70);
    ctx.font = 'bold 42px sans-serif';
    const words = (b.api.contact?.team || 'Équipe non renseignée').split(' ');
    let line = '', row = 142;
    for (const word of words) {
      if (ctx.measureText(`${line} ${word}`).width > 920 && line) {
        ctx.fillText(line, 42, row);
        row += 55;
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    ctx.fillText(line, 42, row);
    ctx.font = 'bold 55px monospace';
    ctx.fillText(b.api.contact?.phone || 'Téléphone non renseigné', 42, 340);
    ctx.font = '32px sans-serif';
    ctx.fillText('BOUTON : VOIR LES COORDONNÉES', 42, 435);
    const labelTexture = new THREE.CanvasTexture(canvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    labelTexture.anisotropy = 8;
    textures.push(labelTexture);
    contact.material.map = labelTexture;
    contact.userData.action = 'contact';
    contact.userData.building = b;
    const interphone = new THREE.Mesh(frameGeometry, new THREE.MeshStandardMaterial({
      color: '#b4c4c8', metalness: .55, roughness: .38,
    }));
    interphone.name = 'Interphone';
    interphone.position.set(-3.9, 2.2, 3.6);
    interphone.scale.set(2.3, 3.25, .5);
    interphone.userData.action = 'contact';
    interphone.userData.building = b;
    buildingGroup.add(interphone);
    for (let i = 0; i < 6; i++) {
      const speaker = new THREE.Mesh(frameGeometry, new THREE.MeshBasicMaterial({ color: '#1c3039' }));
      speaker.name = 'Grille du haut-parleur';
      speaker.position.set(-3.9, 3.5 - i * .105, 3.86);
      speaker.scale.set(1.35, .045, .025);
      buildingGroup.add(speaker);
    }
    const button = new THREE.Mesh(buttonGeometry, new THREE.MeshStandardMaterial({
      color: '#163846', metalness: .4, roughness: .25,
    }));
    button.name = 'Bouton de l’interphone';
    button.rotation.x = Math.PI / 2;
    button.position.set(-3.9, 1.05, 3.92);
    button.scale.set(.24, .12, .24);
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: '#62e1c4', toneMapped: false }));
    ring.name = 'Anneau du bouton';
    ring.position.set(-3.9, 1.05, 4);
    buildingGroup.add(button, ring);
    for (const x of [-4.88, -2.92]) for (const y of [.78, 3.6]) {
      const screw = new THREE.Mesh(buttonGeometry, new THREE.MeshStandardMaterial({ color: '#52616a', metalness: .8, roughness: .4 }));
      screw.rotation.x = Math.PI / 2;
      screw.position.set(x, y, 3.87);
      screw.scale.set(.04, .015, .04);
      buildingGroup.add(screw);
    }
    const support = new THREE.Mesh(frameGeometry, new THREE.MeshStandardMaterial({ color: '#32515e' }));
    support.position.set(-3.9, 1.7, 3.5);
    support.scale.set(2.5, 2.7, .15);
    buildingGroup.add(support);
  }
  return {
    portCount: endpoints.length,
    get pickMeshes() {
      return [...slots.values()].flatMap(slot => slot.group.children.filter(mesh => mesh.userData.action));
    },
    get activeBuilding() { return focused; },
    get visibleIds() { return [...slots.keys()]; },
    highlightEndpoint(building, index = null) {
      for (const slot of slots.values()) for (const mesh of slot.group.children) {
        if (mesh.userData.action !== 'endpoint') continue;
        mesh.material.color.set(!building || mesh.userData.building !== building ||
          index === null || mesh.userData.endpointIndex === index ? '#ffffff' : '#53606c');
      }
    },
    update({ mode, matches, selected }) {
      currentMode = mode;
      currentMatches = matches;
      ports.visible = mode === 'discovery';
      gauges.visible = mode === 'usage';
      for (const column of districtBars) column.visible = mode === 'lifecycle';
      active = selected;
      endpoints.forEach(({ b, endpoint }, i) => ports.setColorAt(i,
        new THREE.Color(matches.has(b.api.id) ? METHOD_COLORS[endpoint.method] ?? '#8492a2' : '#263341')));
      ports.instanceColor.needsUpdate = true;
      world.buildings.forEach((b, i) => {
        const height = usageHeight(b.api.metrics?.callsPerDay, maxCalls);
        pose.position.set(b.x - 3.7, .7 + height / 2, b.z);
        pose.rotation.set(0, 0, 0);
        pose.scale.set(1, height || .1, 1);
        pose.updateMatrix();
        gauges.setMatrixAt(i, pose.matrix);
        const color = matches.has(b.api.id) ? signalColor(b.api, mode, maxCalls) : '#263341';
        gauges.setColorAt(i, new THREE.Color(color));
      });
      gauges.instanceMatrix.needsUpdate = true;
      gauges.instanceColor.needsUpdate = true;
      gauges.computeBoundingSphere();
    },
    updateView(camera, hovered = null) {
      for (const column of districtBars) {
        column.visible = currentMode === 'lifecycle' && camera.position.distanceToSquared(column.position) < 650 ** 2;
      }
      const preferred = active ?? focused ?? hovered;
      const eligible = active && !currentMatches.has(active.api.id) ?
        new Set([...currentMatches, active.api.id]) : currentMatches;
      const nearby = nearbyBuildings(world, camera, eligible, preferred);
      focused = nearby[0] ?? null;
      const ids = new Set(nearby.map(b => b.api.id));
      for (const id of slots.keys()) if (!ids.has(id)) releaseSlot(id);
      for (const b of nearby) if (!slots.has(b.api.id)) showDock(b);
      dock.visible = true;
    },
    dispose() {
      for (const id of slots.keys()) releaseSlot(id);
      labelGeometry.dispose();
      frameGeometry.dispose();
      buttonGeometry.dispose();
      ringGeometry.dispose();
      labelMaterial.dispose();
    },
  };
}
