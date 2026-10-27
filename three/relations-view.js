export function directRelations(world, building) {
  const suppliers = new Map();
  for (const dependency of building.api.dependencies) {
    if (dependency.apiId === building.api.id) continue;
    if (!suppliers.has(dependency.apiId)) suppliers.set(dependency.apiId, {
      id: dependency.apiId, building: world.byId.get(dependency.apiId), dependency,
    });
  }
  return {
    suppliers: [...suppliers.values()],
    consumers: [...new Map((world.consumers.get(building.api.id) ?? [])
      .filter(item => item !== building)
      .map(item => [item.api.id, { id: item.api.id, building: item,
        dependency: item.api.dependencies.find(dependency => dependency.apiId === building.api.id) }])).values()],
  };
}

export function createRelationsView(dialog, world, { explore, center }) {
  const $ = id => dialog.querySelector(`#${id}`);
  const pageSize = 6;
  let root, active = null, pages = { consumers: 0, suppliers: 0 };
  let previousFocus;
  const sourceNames = {
    DECLARED_AND_OBSERVED: 'Déclarée et observée', DECLARED: 'Déclarée',
    DECLARED_ONLY: 'Déclarée uniquement', OBSERVED_ONLY: 'Observée uniquement',
  };
  function close() { dialog.close(); }
  function drawLink() {
    const svg = $('relation-wire');
    svg.replaceChildren();
    const node = dialog.querySelector('[data-relation][aria-pressed="true"]');
    if (!node || !active || innerWidth <= 760) return;
    const board = $('relation-board').getBoundingClientRect();
    const a = (active.side === 'consumers' ? node : $('relation-center')).getBoundingClientRect();
    const b = (active.side === 'consumers' ? $('relation-center') : node).getBoundingClientRect();
    const x1 = a.right - board.left, y1 = a.top + a.height / 2 - board.top;
    const x2 = b.left - board.left, y2 = b.top + b.height / 2 - board.top;
    svg.setAttribute('viewBox', `0 0 ${board.width} ${board.height}`);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2 - 9} ${y2}`);
    path.setAttribute('stroke', active.side === 'consumers' ? '#ffbd70' : '#69cfff');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', '3');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', `M ${x2 - 10} ${y2 - 6} L ${x2} ${y2} L ${x2 - 10} ${y2 + 6} Z`);
    arrow.setAttribute('fill', active.side === 'consumers' ? '#ffbd70' : '#69cfff');
    svg.append(path, arrow);
  }
  function activate(side, item, node) {
    active = { side, item };
    for (const button of dialog.querySelectorAll('[data-relation]')) button.setAttribute('aria-pressed', String(button === node));
    const name = item.building?.api.name ?? item.id;
    $('relation-sentence').textContent = side === 'consumers' ?
      `${name} appelle ${root.api.name}` : `${root.api.name} appelle ${name}`;
    const calls = item.dependency?.callsPerDay;
    $('relation-evidence').textContent = [
      sourceNames[item.dependency?.source] ?? 'Provenance non renseignée',
      Number.isFinite(calls) ? `${calls.toLocaleString('fr')} appels/j fictifs` : 'Volume non renseigné',
      item.building ? `${item.building.city.name} / ${item.building.pole.name} · ${item.id}` : 'Destination absente du catalogue',
    ].join(' · ');
    $('relation-explore').disabled = !item.building;
    $('relation-recenter').disabled = !item.building;
    drawLink();
  }
  function render(building) {
    root = building;
    active = null;
    $('relation-root-name').textContent = root.api.name;
    $('relation-root-place').textContent = `${root.city.name} / ${root.pole.name}`;
    $('relation-root-id').textContent = root.api.id;
    $('relations-heading').textContent = `Relations de ${root.api.name}`;
    const entries = directRelations(world, root);
    for (const side of ['consumers', 'suppliers']) {
      const items = entries[side];
      const host = $(`relation-${side}`);
      host.replaceChildren();
      pages[side] = Math.min(pages[side], Math.max(0, Math.ceil(items.length / pageSize) - 1));
      $(`relation-${side}-count`).textContent = String(items.length);
      if (!items.length) {
        const empty = document.createElement('p');
        empty.textContent = side === 'consumers' ? 'Aucun consommateur identifié.' : 'Aucun fournisseur déclaré.';
        host.append(empty);
      }
      for (const item of items.slice(pages[side] * pageSize, (pages[side] + 1) * pageSize)) {
        const node = document.createElement('button');
        node.dataset.relation = side;
        node.dataset.api = item.id;
        node.setAttribute('aria-pressed', 'false');
        const name = document.createElement('strong');
        name.textContent = item.building?.api.name ?? item.id;
        const place = document.createElement('small');
        place.textContent = item.building ? `${item.building.city.name} · ${item.building.pole.name}` : 'Destination absente du catalogue';
        const id = document.createElement('small');
        id.textContent = item.id;
        node.append(name, place, id);
        node.onfocus = node.onmouseenter = () => activate(side, item, node);
        node.onclick = () => {
          activate(side, item, node);
          if (innerWidth <= 760) dialog.querySelector('.relation-reading').scrollIntoView({ block: 'nearest' });
        };
        host.append(node);
      }
      const pager = $(`relation-${side}-pages`);
      pager.replaceChildren();
      if (items.length > pageSize) {
        for (const [step, label] of [[-1, 'Précédents'], [1, 'Suivants']]) {
          const button = document.createElement('button');
          button.textContent = label;
          button.disabled = step < 0 ? pages[side] === 0 : (pages[side] + 1) * pageSize >= items.length;
          button.onclick = () => {
            pages[side] += step;
            render(root);
            $(`relation-${side}`).querySelector('button')?.focus();
          };
          pager.append(button);
        }
        const count = document.createElement('span');
        count.textContent = `${pages[side] + 1} / ${Math.ceil(items.length / pageSize)}`;
        pager.append(count);
      }
    }
    $('relation-sentence').textContent = 'Choisissez une API pour lire sa relation et le sens de l’appel.';
    $('relation-evidence').textContent = 'Relations directes du catalogue fictif. Aucun trafic temps réel. Les filtres de recherche ne masquent pas les voisins.';
    $('relation-explore').disabled = true;
    $('relation-recenter').disabled = true;
    drawLink();
  }
  $('relations-close').onclick = close;
  $('relation-explore').onclick = () => {
    const building = active?.item.building;
    if (building) { close(); explore(building); }
  };
  $('relation-recenter').onclick = () => {
    const building = active?.item.building;
    if (building) {
      center(building);
      pages = { consumers: 0, suppliers: 0 };
      render(building);
      $('relations-close').focus();
    }
  };
  dialog.addEventListener('close', () => previousFocus?.focus());
  const observer = new ResizeObserver(drawLink);
  observer.observe($('relation-board'));
  return {
    open(building) {
      if (!dialog.open) previousFocus = document.activeElement;
      pages = { consumers: 0, suppliers: 0 };
      if (!dialog.open) dialog.showModal();
      render(building);
      $('relations-close').focus();
    },
    dispose() { observer.disconnect(); },
  };
}
