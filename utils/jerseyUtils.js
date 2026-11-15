/** Shared jersey identity rules for the single-club MVP.
 * Display is preserved; normalized identity is used for duplicate detection.
 * The database also enforces normalized uniqueness independently.
 */
export function isValidJersey(value) {
  return /^\d{1,2}$/.test(String(value ?? '').trim());
}
export function normalizeJersey(value) {
  return isValidJersey(value) ? Number(String(value).trim()) : null;
}
export function sameJersey(a, b) {
  const x = normalizeJersey(a);
  const y = normalizeJersey(b);
  return x !== null && y !== null && x === y;
}
export function isJerseyTaken(players, value, excludePlayerId = null) {
  return players.some(p => p.id !== excludePlayerId && sameJersey(p.jersey, value));
}
export function compareJerseys(a, b) {
  const x = String(a.jersey ?? '');
  const y = String(b.jersey ?? '');
  if (!x) return y ? 1 : 0;
  if (!y) return -1;
  const numericOrder = x.localeCompare(y, undefined, { numeric: true });
  return numericOrder || x.localeCompare(y);
}
