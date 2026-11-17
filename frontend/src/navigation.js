// These preferences belong to this browser, not to the shared app catalog.
export function loadIds(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 50) : [];
  } catch { return []; }
}

export function saveIds(key, ids) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* Storage may be disabled. */ }
}

export function rememberRecent(ids, id) {
  return [id, ...ids.filter(item => item !== id)].slice(0, 5);
}

export function toggleFavorite(ids, id) {
  return ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id];
}
