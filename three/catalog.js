import { complianceColor } from './building-profile.js';

export const MODES = {
  discovery: { name: 'Découverte', icon: '01', description: 'Une seule façade technique se révèle à proximité : endpoints aux étages, services et interphone au rez-de-chaussée. Aucun intérieur à ouvrir.', legend: 'GET bleu · POST vert · PUT ambre · PATCH violet · DELETE rose' },
  usage: { name: 'Usage', icon: '02', description: 'Les colonnes lumineuses mesurent les appels/jour du jeu fictif, sur une échelle logarithmique commune. Aucun trafic temps réel.', legend: 'Hauteur = log(appels + 1) · Bleu → violet → rose · Gris : non renseigné' },
  governance: { name: 'Gouvernance', icon: '03', description: 'La couleur du bâtiment indique sa conformité. Le score exact reste lisible à proximité. La conformité ne mesure pas la disponibilité.', legend: 'Vert : 100 % · Orange : 60–99 % · Rouge : < 60 % · Gris : inconnu' },
  lifecycle: { name: 'Cycle de vie', icon: '04', description: 'Des totems à l’entrée des quartiers empilent leur répartition par statut. Une même hauteur représente toujours le même nombre d’API.', legend: 'Totem : 0,65 unité / API · Vert : production · Ambre : construction · Gris : dépréciée' },
  dependencies: { name: 'Dépendances', icon: '05', description: 'Choisissez une API puis ouvrez la vue des relations : consommateurs à gauche, API au centre et fournisseurs à droite. Une liaison nommée à la fois.', legend: 'Consommateur → API → fournisseur · Relations directes · Pas de trafic réel' },
};

export const DOMAINS = {
  comptes: 'Comptes', paiements: 'Paiements', cartes: 'Cartes', credits: 'Crédits',
  assurance: 'Assurance', epargne: 'Épargne', marches: 'Marchés', cib: 'Financement',
  identite: 'Identité', conformite: 'Conformité', donnees: 'Données',
  canaux: 'Notifications & relation client', plateforme: 'Plateforme',
};

const ALIASES = {
  paiement: ['virement', 'payment', 'encaissement'],
  authentification: ['oauth', 'jeton', 'identite'],
  notification: ['sms', 'email', 'push', 'webhook'],
  document: ['pdf', 'releve', 'attestation', 'archivage'],
  iban: ['iban'], client: ['client', 'kyc'],
};

export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const finite = value => typeof value === 'number' && Number.isFinite(value);

export function matchesApi(api, { query = '', domain = '', status = '', city = '' } = {}) {
  if (domain && api.pole.domain !== domain || status && api.status !== status || city && api.entity.id !== city) return false;
  const text = normalize([api.id, api.name, api.description, api.entity.name, api.pole.name,
    DOMAINS[api.pole.domain], ...(api.tags ?? []),
    ...api.endpoints.flatMap(ep => [ep.path, ep.summary])].join(' '));
  return normalize(query).trim().split(/\s+/).filter(Boolean).every(term =>
    [term, ...(ALIASES[term] ?? [])].some(word => text.includes(word)));
}

export function impactOf(world, id, indirect = false) {
  if (!world.byId.has(id)) throw new Error(`API inconnue : ${id}`);
  const visited = new Set([id]);
  const result = [];
  const queue = [{ id, depth: 0 }];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (!indirect && current.depth >= 1) continue;
    for (const building of world.consumers.get(current.id) ?? []) {
      if (visited.has(building.api.id)) continue;
      visited.add(building.api.id);
      const item = { building, depth: current.depth + 1, via: current.id };
      result.push(item);
      queue.push({ id: building.api.id, depth: item.depth });
    }
  }
  return result;
}

export function signalColor(api, mode, maxCalls) {
  if (mode === 'governance') {
    return complianceColor(api.compliance?.score);
  }
  if (mode === 'lifecycle') return { PRODUCTION: '#56dfb0', CONSTRUCTION: '#ffd075', DEPRECATED: '#8492a2' }[api.status] ?? '#8492a2';
  if (mode === 'usage') {
    if (!finite(api.metrics?.callsPerDay)) return '#8492a2';
    const ratio = Math.log1p(Math.max(0, api.metrics.callsPerDay)) / Math.log1p(Math.max(1, maxCalls));
    return ratio > .75 ? '#ff70b6' : ratio > .45 ? '#aa9aff' : '#62caff';
  }
  return '#63e6db';
}

export function readiness(api) {
  return {
    access: api.access?.policy || 'Procédure d’accès non renseignée',
    sandbox: api.sandbox?.url ? 'Sandbox déclarée' : 'Sandbox non renseignée',
    documentation: api.documentation?.url ? 'Documentation déclarée' : 'Spécification OpenAPI non fournie',
  };
}

export function contactEntries(api) {
  const person = (value, missing) => {
    if (typeof value === 'string' && value.trim()) return value;
    if (value && typeof value === 'object') {
      const parts = [value.name, value.email].filter(part => typeof part === 'string' && part.trim());
      if (parts.length) return parts.join(' · ');
    }
    return missing;
  };
  return [
    ['ÉQUIPE', api.contact?.team || 'Équipe non renseignée'],
    ['RESPONSABLE', person(api.contact?.owner, 'Responsable non renseigné')],
    ['RÉFÉRENT', person(api.contact?.lead, 'Référent non renseigné')],
    ['TÉLÉPHONE', api.contact?.phone || 'Téléphone non renseigné'],
    ['CANAL', api.contact?.channel || 'Canal non renseigné'],
  ];
}
