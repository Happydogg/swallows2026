/** Shared session form unit conversion and nullable-field handling. */
export const cleanVal = value => (value === '' || value === undefined ? null : value);

export function convertSpeedValue(value, toMph) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return toMph ? Number((num / 1.60934).toFixed(1)) : Number((num * 1.60934).toFixed(1));
}

export function normalizeToKmh(value, currentUnit) {
  const cleaned = cleanVal(value);
  if (cleaned === null) return null;
  const num = Number(cleaned);
  if (Number.isNaN(num)) return null;
  return currentUnit === 'mph' ? Number((num * 1.60934).toFixed(1)) : Number(num.toFixed(1));
}
