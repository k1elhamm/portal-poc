import * as THREE from 'three';
import { hash, BUILDING_SPACING } from './layout.js';

const pose = new THREE.Object3D();

export function apiSignPosition(building) {
  return new THREE.Vector3(building.x + 3.7, 2.35, building.z + 4.9);
}

function instances(scene, geometry, material, placements) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  placements.forEach((p, i) => {
    pose.position.set(p.x, p.y, p.z);
    pose.rotation.set(0, p.rotation ?? 0, 0);
    pose.scale.set(p.w ?? 1, p.h ?? 1, p.d ?? 1);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
    if (p.color) mesh.setColorAt(i, new THREE.Color(p.color));
  });
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

export function buildStreets(scene, world) {
  const box = new THREE.BoxGeometry();
  const pavement = [], lawns = [], lanes = [], markings = [];
  const trunks = [], crowns = [], benches = [], lamps = [], lights = [], posts = [], plinths = [], boards = [];
  for (const city of world.cities) {
    for (const pole of city.poles.values()) {
      const rows = Math.ceil(pole.apis.length / pole.columns);
      for (let r = 0; r < rows; r++) {
        const z = pole.z + 9 + r * BUILDING_SPACING.z;
        lanes.push({ x: pole.x + pole.width / 2 - 3, y: 0.32, z: z + 13,
          w: pole.width - 4, h: 0.05, d: 7 });
        pavement.push({ x: pole.x + pole.width / 2 - 3, y: 0.4, z: z + 7,
          w: pole.width - 4, h: 0.22, d: 4.8 });
        for (let x = pole.x; x < pole.x + pole.width - 8; x += 8) {
          markings.push({ x, y: 0.36, z: z + 13, w: 3, h: 0.02, d: 0.18 });
        }
        for (let c = 0; c < pole.columns; c++) {
          if (r * pole.columns + c >= pole.apis.length) continue;
          const x = pole.x + 6 + c * BUILDING_SPACING.x;
          lawns.push({ x: x + 9.5, y: 0.36, z: z + 1, w: 5.2, h: 0.18, d: 7 });
          trunks.push({ x: x + 9.5, y: 1.5, z: z + 1, w: 0.35, h: 2.4, d: 0.35 });
          crowns.push({ x: x + 9.5, y: 4.3, z: z + 1, w: 2.2, h: 2.7, d: 2.2,
            color: ['#6fa47c', '#4b927b', '#87b385'][c % 3] });
          benches.push({ x: x + 9.5, y: 0.9, z: z + 6, w: 2.5, h: 0.3, d: 0.8 });
          benches.push({ x: x + 9.5, y: 1.35, z: z + 6.4, w: 2.5, h: 0.7, d: 0.16 });
          lamps.push({ x: x - 6.5, y: 2.7, z: z + 7, w: 0.16, h: 4.7, d: 0.16 });
          lights.push({ x: x - 6.5, y: 5.1, z: z + 7, w: 0.9, h: 0.3, d: 0.9 });
        }
      }
    }
  }
  for (const b of world.buildings) {
    plinths.push({ x: b.x, y: 0.43, z: b.z, w: 8.2, h: 0.35, d: 8.2 });
    const p = apiSignPosition(b);
    boards.push({ x: p.x, y: p.y, z: p.z, w: 5.8, h: 2.7, d: 0.28 });
    for (const dx of [-1.9, 1.9]) {
      posts.push({ x: p.x + dx, y: 0.75, z: p.z, w: 0.16, h: 0.8, d: 0.16 });
      posts.push({ x: p.x + dx, y: 0.36, z: p.z, w: 0.6, h: 0.16, d: 0.6 });
    }
  }
  instances(scene, box, new THREE.MeshStandardMaterial({ color: '#c1c9c3', roughness: 1 }), pavement);
  instances(scene, box, new THREE.MeshStandardMaterial({ color: '#758f75', roughness: 1 }), lawns);
  instances(scene, box, new THREE.MeshStandardMaterial({ color: '#354552', roughness: 1 }), lanes);
  instances(scene, box, new THREE.MeshBasicMaterial({ color: '#b1b8b3' }), markings);
  instances(scene, box, new THREE.MeshStandardMaterial({ color: '#e1ded0', roughness: 1 }), plinths);
  instances(scene, box, new THREE.MeshStandardMaterial({ color: '#736050' }), trunks);
  instances(scene, new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), crowns);
  instances(scene, box, new THREE.MeshStandardMaterial({ color: '#b79165' }), benches);
  instances(scene, box, new THREE.MeshStandardMaterial({ color: '#3f5262', metalness: 0.35 }), [...lamps, ...posts]);
  const signBoards = instances(scene, box, new THREE.MeshStandardMaterial({
    color: '#244451', roughness: 0.55, metalness: 0.3,
  }), boards);
  signBoards.userData.buildings = world.buildings;
  const lampMaterial = new THREE.MeshStandardMaterial({ color: '#fff1c2', emissive: '#ffd581', emissiveIntensity: 1 });
  instances(scene, box, lampMaterial, lights);
  const doors = [], caps = [], rooftop = [], shadows = [];
  for (const b of world.buildings) {
    doors.push({ x: b.x, y: 1.35, z: b.z + 2.65, w: 1.3, h: 1.8, d: 0.1 });
    caps.push({ x: b.x, y: 2.4, z: b.z + 3.2, w: 3.3, h: 0.12, d: 1.8 });
    rooftop.push({ x: b.x + 1, y: b.height + 0.5, z: b.z - 0.6, w: 1.3, h: 0.7, d: 1.8 });
    shadows.push({ x: b.x + 1, y: 0.3, z: b.z + 1.4, w: 10, h: 0.01, d: 11 });
  }
  instances(scene, box, new THREE.MeshStandardMaterial({ color: '#244b62', metalness: 0.25 }), doors);
  instances(scene, box, new THREE.MeshStandardMaterial({ color: '#e0ceb1', roughness: 0.65 }), caps);
  instances(scene, box, new THREE.MeshStandardMaterial({ color: '#92a0a3' }), rooftop);
  instances(scene, box, new THREE.MeshBasicMaterial({ color: '#203c38',
    transparent: true, opacity: 0.12, depthWrite: false }), shadows);
  return { pickMeshes: [signBoards], setNight(night) { lampMaterial.emissiveIntensity = night ? 2 : 0.1; } };
}

export function createDevelopers(scene, world, reducedMotion) {
  const routes = [];
  for (const city of world.cities) {
    for (const pole of city.poles.values()) {
      for (let i = 0; i < 3; i++) {
        const row = i % Math.ceil(pole.apis.length / pole.columns);
        routes.push({ x: pole.x + 4, z: pole.z + 16 + row * BUILDING_SPACING.z,
          length: Math.max(8, (pole.columns - 1) * BUILDING_SPACING.x + 4),
          phase: hash(`${pole.id}:${i}`) % 1000 / 1000, city,
          color: ['#547fba', '#cb876e', '#9176b5', '#d3ad56', '#5f9e91'][hash(pole.id + i) % 5] });
      }
    }
  }
  const count = routes.length;
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.66, 0.33),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), count);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), count);
  const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.23, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#3a302d' }), count);
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.56, 0.21),
    new THREE.MeshStandardMaterial({ color: '#293c53' }), count * 2);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.6, 0.19),
    new THREE.MeshStandardMaterial({ color: '#ffffff' }), count * 2);
  const packs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.45, 0.18),
    new THREE.MeshStandardMaterial({ color: '#283749' }), count);
  const meshes = [body, head, hair, legs, arms, packs];
  const sampleMatrix = new THREE.Matrix4();
  for (const mesh of meshes) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  routes.forEach((r, i) => {
    body.setColorAt(i, new THREE.Color(r.color));
    head.setColorAt(i, new THREE.Color(['#d6a580', '#a47559', '#efc6a4', '#8d614b'][i % 4]));
    arms.setColorAt(i * 2, new THREE.Color(r.color));
    arms.setColorAt(i * 2 + 1, new THREE.Color(r.color));
  });
  function part(mesh, index, x, y, z, angle, swing = 0, show = true) {
    pose.position.set(x, y, z);
    pose.rotation.set(swing, angle, 0);
    pose.scale.setScalar(show ? 1 : 0);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
  }
  return {
    count,
    update(time, camera) {
      let visibleCount = 0;
      let sample = '';
      routes.forEach((r, i) => {
        const phase = (r.phase + (reducedMotion ? 0 : time * 0.00011)) % 1;
        const forward = phase < 0.5;
        const x = r.x + (forward ? phase * 2 : (1 - phase) * 2) * r.length;
        const angle = forward ? Math.PI / 2 : -Math.PI / 2;
        const visible = Math.hypot(camera.position.x - x, camera.position.z - r.z) < 400 && camera.position.y < 240;
        if (visible) visibleCount++;
        const stride = reducedMotion ? 0 : Math.sin(time * 0.009 + i) * 0.5;
        const y = 0.6;
        part(body, i, x, y + 0.93, r.z, angle, 0, visible);
        if (visible && !sample) {
          body.getMatrixAt(i, sampleMatrix);
          sample = `${sampleMatrix.elements[12].toFixed(3)},${sampleMatrix.elements[14].toFixed(3)}`;
        }
        part(head, i, x, y + 1.5, r.z, angle, 0, visible);
        part(hair, i, x, y + 1.57, r.z, angle, 0, visible);
        part(packs, i, x - (forward ? 0.24 : -0.24), y + 0.93, r.z, angle, 0, visible);
        for (const side of [-1, 1]) {
          const index = i * 2 + (side === 1 ? 1 : 0);
          part(legs, index, x, y + 0.32, r.z + side * 0.15, angle, side * stride, visible);
          part(arms, index, x, y + 0.92, r.z + side * 0.37, angle, -side * stride, visible);
        }
      });
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
      return { visible: visibleCount, sample };
    },
  };
}

export function createApiSigns(scene, world) {
  const pool = [];
  const geometry = new THREE.BoxGeometry(5.55, 2.45, 0.3);
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  const bounds = new THREE.Box3();
  const size = new THREE.Vector3(5.8, 2.7, 0.32);
  function bindSign(sign, b) {
    sign.building = b;
    sign.mesh.position.copy(apiSignPosition(b));
    const ctx = sign.context;
    ctx.fillStyle = '#fffdf2';
    ctx.fillRect(0, 0, 768, 384);
    ctx.fillStyle = b.city.color;
    ctx.fillRect(0, 0, 12, 384);
    ctx.fillStyle = '#49616a';
    ctx.font = '600 27px system-ui, sans-serif';
    ctx.fillText('API', 32, 43);
    let lines;
    let font = 64;
    do {
      ctx.font = `700 ${font}px system-ui, sans-serif`;
      lines = [''];
      // Split overlong words as well, so the complete API name fits the physical board.
      for (const word of b.api.name.match(/\S+\s*/g) ?? []) {
        if (lines.at(-1).trim() && ctx.measureText(lines.at(-1) + word).width > 704) lines.push('');
        for (const character of word) {
          const i = lines.length - 1;
          if (ctx.measureText(lines[i] + character).width > 704) lines.push(character);
          else lines[i] += character;
        }
      }
      if (lines.length * font * 1.12 <= 244) break;
      font -= 2;
    } while (font > 12);
    ctx.fillStyle = '#173b4b';
    lines.forEach((line, i) => ctx.fillText(line.trim(), 32, 65 + font + i * font * 1.12));
    const state = b.api.status === 'PRODUCTION' ? 'Production' : b.api.status === 'CONSTRUCTION' ? 'Construction' : 'Dépréciée';
    ctx.fillStyle = '#49616a';
    ctx.font = '500 27px system-ui, sans-serif';
    ctx.fillText(`${state} · ${b.api.endpoints.length} endpoints · ${b.api.compliance.score} %`, 32, 356);
    sign.texture.needsUpdate = true;
  }
  return {
    update(camera, selectedId) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const nearby = world.buildings.map(b => ({ b, position: apiSignPosition(b) }))
        .filter(item => item.position.distanceTo(camera.position) < 220 &&
          frustum.intersectsBox(bounds.setFromCenterAndSize(item.position, size)))
        .map(item => ({ ...item, distance: item.position.distanceTo(camera.position) }))
        .sort((a, b) => Number(b.b.api.id === selectedId) - Number(a.b.api.id === selectedId) || a.distance - b.distance);
      const shown = new Set(nearby.slice(0, 48).map(item => item.b));
      for (const sign of pool) sign.mesh.visible = shown.has(sign.building);
      let visibleCount = 0;
      for (const { b } of nearby.slice(0, 48)) {
        let sign = pool.find(item => item.building === b);
        if (!sign) {
          sign = pool.find(item => !item.mesh.visible);
          if (!sign) {
            const canvas = document.createElement('canvas');
            canvas.width = 768;
            canvas.height = 384;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Le dessin des panneaux canvas est indisponible.');
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
            scene.add(mesh);
            sign = { mesh, texture, context };
            pool.push(sign);
          }
          bindSign(sign, b);
        }
        sign.mesh.visible = true;
        visibleCount++;
      }
      return visibleCount;
    },
    dispose() {
      for (const sign of pool) {
        scene.remove(sign.mesh);
        sign.texture.dispose();
        sign.mesh.material.dispose();
      }
      geometry.dispose();
    },
  };
}
