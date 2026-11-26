// Plain-language view of what Docker and the reachability check report about a service.

// The tile of a service shares its ID suffix; see save_service_tile in the backend.
export const tileId = service => 'director-' + service.id.replace(/^dkhub-/, '');

export function outdated(tile, service) {
  if (!tile || !service.host_port) return false;
  try { return new URL(tile.url).host !== `${service.host_ip}:${service.host_port}`; } catch { return false; }
}

export const isActive = service => service.state === 'running' || service.state === 'restarting';

export function describe(service, health) {
  const status = health?.status;
  if (status === 'checking') return { tone: 'busy', label: 'Wird geprüft', text: 'Einen Moment, der Dienst wird gerade geprüft.' };
  if (service.port_blocked || status === 'port_blocked') {
    return { tone: 'bad', label: 'Nicht nutzbar', text: 'Ein anderes Programm belegt den Anschluss dieses Dienstes. Beende das Programm, dann stoppe und starte den Dienst.' };
  }
  if (service.state === 'restarting' || status === 'restarting') {
    return { tone: 'bad', label: 'Startet nicht', text: 'Der Dienst startet immer wieder neu. Meist braucht diese App zusätzliche Einstellungen, die DKHub noch nicht anbietet.' };
  }
  if (service.state !== 'running' || status === 'stopped') return { tone: 'idle', label: 'Gestoppt', text: '' };
  if (status === 'reachable') return { tone: 'ok', label: 'Bereit', text: '' };
  if (status === 'unreachable') {
    return { tone: 'warn', label: 'Antwortet nicht', text: 'Der Dienst läuft, zeigt aber noch keine Webseite. Warte kurz und prüfe erneut. Bleibt es so, wurde vermutlich ein falscher Port gewählt.' };
  }
  if (status === 'error') return { tone: 'warn', label: 'Status unklar', text: health.message };
  return { tone: 'ok', label: 'Läuft', text: '' };
}
