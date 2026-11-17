export async function getApps(signal) {
  const response = await fetch('/api/apps', { signal });
  if (!response.ok) throw new Error('Unable to load apps');
  const apps = await response.json();
  if (!Array.isArray(apps)) throw new Error('Invalid app list');
  return apps;
}
