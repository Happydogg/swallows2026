/** Common player display and position helpers. */
export function getPlayerDisplayName(player) {
  if (!player) return '';
  return player.preferred_name || player.name || `${player.last_name || ''} ${player.given_names || ''}`.trim() || 'Player';
}
export function formatLegalName(player) {
  if (!player) return '--';
  if (player.last_name && player.given_names) return `${player.last_name}, ${player.given_names}`;
  return player.official_name || player.preferred_name || player.name || '--';
}
export function splitPositions(posStr) {
  if (!posStr) return ['IF'];
  return posStr.split(',').map(s => s.trim()).filter(Boolean);
}
export function togglePositionSelection(current, pos) {
  return current.includes(pos)
    ? (current.length > 1 ? current.filter(p => p !== pos) : current)
    : [...current, pos];
}
