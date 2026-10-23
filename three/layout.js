export const ENTITY_COLORS = ['#68b6bd', '#ad92d2', '#dfac69', '#7fb68e', '#819ed7',
  '#ca8da8', '#91b3a4', '#c0a3d9', '#c5bc79', '#78a6bd'];

export const BUILDING_SPACING = { x: 20, z: 24 };

export function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function makeWorld(response) {
  if (!response || !Array.isArray(response.apis) || !response.apis.length) {
    throw new Error('Le catalogue getAPIs est vide ou invalide.');
  }
  const ids = new Set();
  const entities = new Map();
  for (const api of response.apis) {
    if (!api.id || ids.has(api.id) || !api.entity?.id || !api.pole?.id ||
        !Array.isArray(api.endpoints) || !Number.isFinite(api.compliance?.score)) {
      throw new Error(`API invalide ou dupliquée : ${api.id ?? 'sans identifiant'}`);
    }
    ids.add(api.id);
    let entity = entities.get(api.entity.id);
    if (!entity) {
      entity = { ...api.entity, poles: new Map(), apis: [] };
      entities.set(entity.id, entity);
    }
    let pole = entity.poles.get(api.pole.id);
    if (!pole) {
      pole = { ...api.pole, apis: [] };
      entity.poles.set(pole.id, pole);
    }
    entity.apis.push(api);
    pole.apis.push(api);
  }
  const cities = [...entities.values()].sort((a, b) => b.apis.length - a.apis.length || a.id.localeCompare(b.id));
  const buildings = [];
  let largest = 0;
  for (const [index, city] of cities.entries()) {
    city.color = ENTITY_COLORS[index % ENTITY_COLORS.length];
    const poles = [...city.poles.values()].sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true }));
    const cols = Math.ceil(Math.sqrt(poles.length));
    const sizes = poles.map(p => {
      const columns = Math.ceil(Math.sqrt(p.apis.length));
      return { columns, width: columns * BUILDING_SPACING.x + 12,
        depth: Math.ceil(p.apis.length / columns) * BUILDING_SPACING.z + 16 };
    });
    const cellW = Math.max(...sizes.map(p => p.width)) + 14;
    const cellD = Math.max(...sizes.map(p => p.depth)) + 14;
    city.width = cols * cellW + 22;
    city.depth = Math.ceil(poles.length / cols) * cellD + 32;
    largest = Math.max(largest, city.width, city.depth);
    poles.forEach((pole, i) => Object.assign(pole, sizes[i], {
      x: -city.width / 2 + 20 + (i % cols) * cellW,
      z: -city.depth / 2 + 24 + Math.floor(i / cols) * cellD,
      tone: 0.78 + i / Math.max(1, poles.length - 1) * 0.35,
    }));
  }
  const stride = largest + 90;
  const cols = Math.ceil(Math.sqrt(cities.length));
  cities.forEach((city, i) => {
    city.x = (i % cols - (cols - 1) / 2) * stride;
    city.z = (Math.floor(i / cols) - (Math.ceil(cities.length / cols) - 1) / 2) * stride;
    for (const pole of city.poles.values()) {
      pole.x += city.x;
      pole.z += city.z;
      [...pole.apis].sort((a, b) => b.endpoints.length - a.endpoints.length || a.id.localeCompare(b.id))
        .forEach((api, j) => buildings.push({
          api, city, pole, index: buildings.length,
          x: pole.x + 6 + j % pole.columns * BUILDING_SPACING.x,
          z: pole.z + 9 + Math.floor(j / pole.columns) * BUILDING_SPACING.z,
          height: 1.5 + api.endpoints.length * 1.25,
        }));
    }
  });
  const byId = new Map(buildings.map(b => [b.api.id, b]));
  const consumers = new Map(buildings.map(b => [b.api.id, []]));
  for (const b of buildings) {
    for (const dep of b.api.dependencies ?? []) {
      if (consumers.has(dep.apiId)) consumers.get(dep.apiId).push(b);
    }
  }
  return { cities, buildings, byId, consumers, extent: stride * cols };
}
