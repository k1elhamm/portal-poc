export function buildingKind(score) {
  return !Number.isFinite(score) || score < 0 || score > 100 ? 'unknown' :
    score === 100 ? 'green' : score >= 60 ? 'orange' : 'red';
}

export function complianceColor(score) {
  return { green: '#56c98a', orange: '#ed8a32', red: '#d94e4e', unknown: '#8492a2' }[buildingKind(score)];
}

export function complianceLabel(score) {
  return buildingKind(score) === 'unknown' ? 'Inconnue' : `${score} %`;
}

export function floorProfile() {
  return { width: 5.2, depth: 5.2, offset: 0 };
}
