export async function getApps(signal) {
  const response = await fetch('/api/apps', { signal });
  if (!response.ok) throw new Error('Unable to load apps');
  const apps = await response.json();
  if (!Array.isArray(apps)) throw new Error('Invalid app list');
  return apps;
}

export async function addApp(app, password) {
  const response = await fetch('/api/apps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DKHub-Admin': password },
    body: JSON.stringify(app),
  });
  if (response.status === 503) throw new Error('Bitte zuerst das Admin-Passwort auf dem Server einrichten.');
  if (response.status === 403) throw new Error('Admin-Passwort oder Anfrage ist ungültig.');
  if (response.status === 409) throw new Error('Dieser DKHub-Pfad wird bereits verwendet.');
  if (response.status === 422) throw new Error('Bitte Name und eine gültige HTTP- oder HTTPS-Adresse eingeben.');
  if (!response.ok) throw new Error('Die Anwendung konnte nicht gespeichert werden.');
  return response.json();
}

export async function removeApp(id, password) {
  const response = await fetch(`/api/apps/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { 'X-DKHub-Admin': password },
  });
  if (response.status === 503) throw new Error('Bitte zuerst das Admin-Passwort auf dem Server einrichten.');
  if (response.status === 403) throw new Error('Admin-Passwort oder Anfrage ist ungültig.');
  if (!response.ok) throw new Error('Die Anwendung konnte nicht entfernt werden.');
}
