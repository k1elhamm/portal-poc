import * as THREE from 'three';
import { hash } from './layout.js';
import { signalColor } from './catalog.js';

export function createCitySignals(scene, world) {
  const group = new THREE.Group();
  group.name = 'Observatoire du catalogue';
  scene.add(group);
  const pose = new THREE.Object3D();
  const rings = new THREE.InstancedMesh(new THREE.RingGeometry(4.5, 4.85, 24),
    new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, toneMapped: false }), world.buildings.length);
  world.buildings.forEach((b, i) => {
    pose.position.set(b.x, .65, b.z);
    pose.rotation.set(-Math.PI / 2, 0, 0);
    pose.updateMatrix();
    rings.setMatrixAt(i, pose.matrix);
    rings.setColorAt(i, new THREE.Color('#63e6db'));
  });
  rings.computeBoundingSphere();
  group.add(rings);

  const locator = new THREE.Group();
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(6.5, .13, 6, 64),
    new THREE.MeshBasicMaterial({ color: '#ffe3a1', toneMapped: false }));
  orbit.rotation.x = Math.PI / 2;
  const orbit2 = new THREE.Mesh(new THREE.TorusGeometry(7.4, .06, 4, 64),
    new THREE.MeshBasicMaterial({ color: '#5de8e4', toneMapped: false }));
  orbit2.rotation.x = Math.PI / 2;
  locator.add(orbit, orbit2);
  locator.visible = false;
  group.add(locator);

  // Low-cost city gateways mark entrances without adding lights or post-processing.
  const gateGeometry = new THREE.TorusGeometry(9, .25, 6, 48);
  for (const city of world.cities) {
    const gate = new THREE.Mesh(gateGeometry, new THREE.MeshStandardMaterial({
      color: city.color, emissive: city.color, emissiveIntensity: .6, metalness: .6, roughness: .3,
    }));
    gate.position.set(city.x, 10, city.z + city.depth / 2 + 12);
    group.add(gate);
    const pad = new THREE.Mesh(new THREE.RingGeometry(10, 13, 48),
      new THREE.MeshBasicMaterial({ color: city.color, side: THREE.DoubleSide, transparent: true, opacity: .65 }));
    pad.position.set(city.x, .05, gate.position.z);
    pad.rotation.x = -Math.PI / 2;
    group.add(pad);
  }
  const starPositions = [];
  for (let i = 0; i < 650; i++) {
    starPositions.push((hash(`star-x:${i}`) / 2 ** 32 - .5) * 16000,
      1200 + hash(`star-y:${i}`) / 2 ** 32 * 2600,
      (hash(`star-z:${i}`) / 2 ** 32 - .5) * 16000);
  }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3)),
    new THREE.PointsMaterial({ color: '#bbdfed', size: 3, sizeAttenuation: true, transparent: true, opacity: .8, depthWrite: false }));
  group.add(stars);
  let active = null;
  const maxCalls = Math.max(1, ...world.buildings.map(b => b.api.metrics?.callsPerDay ?? 0));
  return {
    update({ mode, matches, selected, related }) {
      active = selected;
      world.buildings.forEach((b, i) => {
        let color = signalColor(b.api, mode, maxCalls);
        if (mode === 'dependencies' && selected) color = related.get(b.api.id) ?? '#334356';
        if (!matches.has(b.api.id)) color = '#334356';
        if (b === selected) color = '#ffe3a1';
        rings.setColorAt(i, new THREE.Color(color));
      });
      rings.instanceColor.needsUpdate = true;
      locator.visible = Boolean(selected);
      if (selected) {
        locator.position.set(selected.x, .85, selected.z);
      }
    },
    animate(time, reducedMotion) {
      if (!active) return;
      orbit2.rotation.z = reducedMotion ? 0 : time * .0003;
    },
    setNight(dark) { stars.visible = dark; },
  };
}
