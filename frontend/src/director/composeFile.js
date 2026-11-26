// Turns a pasted docker-compose.yml into the fields of the install form.
// Nothing is executed: only image, ports, volumes and environment are read,
// and the user checks everything before installing.
import { load } from 'js-yaml';

const MAX_VOLUMES = 16;
const MAX_ENV = 64;
const SECRET = /SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE|API_?KEY|_KEY$|_PASS$/i;
const PLACEHOLDER = /change[-_ ]?me|^replace|^your[-_ ]|^<.*>$|long-random/i;
const TARGET = /^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const IGNORED = ['command', 'entrypoint', 'privileged', 'cap_add', 'devices', 'network_mode', 'user', 'env_file', 'extra_hosts', 'links', 'shm_size', 'sysctls', 'secrets', 'configs'];
// ${NAME}, ${NAME:-default}, ${NAME:?message}, $NAME and the escaped $$.
const VARIABLE = /\$(?:(\$)|\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?+])([^}]*))?\}|([A-Za-z_][A-Za-z0-9_]*))/g;

function interpolate(text) {
  const missing = [];
  let required = false;
  const value = String(text).replace(VARIABLE, (_, dollar, braced, operator = '', fallback = '', bare) => {
    if (dollar) return '$';
    if (operator.endsWith('-')) return fallback;
    if (operator.endsWith('+')) return '';
    if (operator.endsWith('?')) required = true;
    missing.push(braced || bare);
    return '';
  });
  return { value, missing, required };
}

// Splits "source:target:mode" without cutting inside ${NAME:-default}.
function splitColons(text) {
  const parts = [''];
  let depth = 0;
  for (const char of String(text)) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (char === ':' && depth <= 0) parts.push('');
    else parts[parts.length - 1] += char;
  }
  return parts;
}

function splitImage(reference) {
  if (reference.includes('@')) throw new Error('Images mit @sha256-Angabe kann DKHub noch nicht installieren. Ersetze sie durch eine Version wie „:latest“.');
  const colon = reference.lastIndexOf(':');
  const hasTag = colon > reference.lastIndexOf('/');
  const image = hasTag ? reference.slice(0, colon) : reference;
  const tag = hasTag ? reference.slice(colon + 1) : 'latest';
  if (!/^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/.test(image) || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(tag)) {
    throw new Error(`Den Image-Namen „${reference}“ kann DKHub nicht verwenden.`);
  }
  return { image, tag };
}

function readPorts(entries, notes) {
  const ports = new Set();
  for (const entry of entries || []) {
    let target, protocol = 'tcp';
    if (entry && typeof entry === 'object') ({ target, protocol = 'tcp' } = entry);
    else {
      const [mapping, suffix = 'tcp'] = String(entry).split('/');
      protocol = suffix;
      target = splitColons(mapping).at(-1);
    }
    const { value } = interpolate(target ?? '');
    const port = Number(value);
    if (protocol !== 'tcp') notes.push(`Port ${value}/${protocol} wird nicht übernommen. DKHub veröffentlicht nur den Web-Port.`);
    else if (Number.isInteger(port) && port > 0 && port <= 65535) ports.add(port);
    else notes.push(`Die Port-Angabe „${typeof entry === 'object' ? target : entry}“ konnte nicht gelesen werden.`);
  }
  return [...ports];
}

const slug = path => (path.split('/').pop() || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28);

function readVolumes(entries, notes) {
  const volumes = [];
  let replaced = false;
  for (const entry of entries || []) {
    let source = '', target = '', type = '', mode = '';
    if (entry && typeof entry === 'object') ({ source = '', target = '', type = '' } = entry), mode = entry.read_only ? 'ro' : '';
    else {
      const parts = splitColons(entry);
      if (parts.length === 1) [target] = parts;
      else [source, target, mode = ''] = parts;
    }
    const raw = String(source);
    source = interpolate(raw).value;
    target = interpolate(target).value.replace(/(.)\/+$/, '$1');
    if (type === 'tmpfs' || /docker\.sock/.test(source + target)) {
      notes.push(type === 'tmpfs' ? `Der flüchtige Speicher ${target} wird nicht übernommen.` : 'Der Zugriff auf Docker selbst (docker.sock) wird aus Sicherheitsgründen nicht übernommen.');
      continue;
    }
    if (/^\/etc\/(localtime|timezone)$/.test(target)) continue;
    if (!TARGET.test(target) || target.split('/').some(part => part === '.' || part === '..')) {
      notes.push(`Der Datenordner „${target || raw}“ konnte nicht übernommen werden.`);
      continue;
    }
    if (/\.(conf|cfg|ini|ya?ml|json|toml|env|crt|pem|key|txt|xml|sh|php|js)$/i.test(target)) {
      notes.push(`Die einzelne Datei ${target} kann DKHub nicht einhängen. Die App braucht sie eventuell.`);
      continue;
    }
    if (/(^|,)ro(,|$)/.test(mode)) {
      notes.push(`${target} ist in der Vorlage nur lesbar gedacht (vorhandene Dateien von dir). Ein leeres Volume hilft dort nicht und wurde ausgelassen.`);
      continue;
    }
    if (volumes.some(other => other.target === target || target.startsWith(other.target + '/') || other.target.startsWith(target + '/'))) {
      notes.push(`Der Datenordner ${target} überschneidet sich mit einem anderen und wurde ausgelassen.`);
      continue;
    }
    // A path on the host (or a variable for one) becomes a volume managed by DKHub.
    if (/^[.~/]/.test(source) || /^[A-Za-z]:/.test(source) || raw.includes('$')) replaced = true;
    let key = slug(target) || `daten-${volumes.length + 1}`;
    if (volumes.some(other => other.key === key)) key = `${key}-${volumes.length + 1}`;
    volumes.push({ key, target });
  }
  if (replaced) notes.push('Ordner von deinem Rechner werden durch neue, leere DKHub-Volumes ersetzt. Vorhandene Dateien werden nicht übernommen.');
  if (volumes.length > MAX_VOLUMES) notes.push(`Nur die ersten ${MAX_VOLUMES} Datenordner wurden übernommen.`);
  return volumes.slice(0, MAX_VOLUMES);
}

function readEnvironment(environment, notes, randomSecret) {
  const pairs = Array.isArray(environment)
    ? environment.map(line => { const at = String(line).indexOf('='); return at < 0 ? [String(line), null] : [String(line).slice(0, at), String(line).slice(at + 1)]; })
    : Object.entries(environment || {});
  const rows = new Map();
  const empty = [];
  for (const [name, raw] of pairs) {
    const key = String(name).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key)) { notes.push(`Die Einstellung „${key}“ hat keinen gültigen Namen.`); continue; }
    let { value, missing, required } = interpolate(raw ?? '');
    if (/[\r\n]/.test(value)) { notes.push(`${key} hat mehrere Zeilen und wurde ausgelassen.`); continue; }
    const secret = SECRET.test(key);
    // Only invent values for secrets the app itself defines, never for keys another service hands out.
    const generate = /SECRET|ENCRYPTION_KEY|_ENC_KEY$/i.test(key) && !/CLIENT|API|_FILE$/i.test(key) && (PLACEHOLDER.test(value) || (!value && missing.length > 0 && String(raw).trim().startsWith('$')));
    if (generate) value = randomSecret();
    else if (PLACEHOLDER.test(value)) { value = ''; required = true; }
    // An optional setting without a value would only clutter the form.
    if (!value && !required && !(secret && missing.length)) { empty.push(key); continue; }
    if (missing.length && value && !generate) notes.push(`${key} enthielt einen Platzhalter (${missing.join(', ')}). Bitte prüfe den Wert.`);
    rows.set(key, { key, value, secret, generate, required, label: generate ? `${key} (neu erzeugt)` : undefined });
  }
  if (empty.length) notes.push(`Leere, optionale Einstellungen ausgelassen: ${empty.join(', ')}.`);
  if (empty.includes('INSECURE_COOKIES')) notes.push('Meldet dich die App über http:// immer wieder ab, füge INSECURE_COOKIES mit Wert 1 hinzu (nur im Heimnetz).');
  if (rows.size > MAX_ENV) notes.push(`Nur die ersten ${MAX_ENV} Einstellungen wurden übernommen.`);
  return [...rows.values()].slice(0, MAX_ENV);
}

// Returns the services of the file; each can be turned into form fields with readService.
export function parseCompose(text) {
  if (!text.trim()) throw new Error('Füge zuerst den Inhalt der docker-compose.yml ein.');
  if (text.length > 100_000) throw new Error('Die Datei ist zu groß.');
  let document;
  try { document = load(text); }
  catch (err) { throw new Error(`Das ist kein gültiges YAML${err.mark ? ` (Zeile ${err.mark.line + 1})` : ''}. Kopiere die Datei vollständig, mit allen Einrückungen.`); }
  const services = Object.entries(document?.services || {}).filter(([, service]) => service && typeof service === 'object');
  if (!services.length) throw new Error('In der Datei steht kein Abschnitt „services“.');
  return services.map(([key, definition]) => ({ key, definition, image: typeof definition.image === 'string' ? interpolate(definition.image).value : '' }));
}

export function readService(services, key, randomSecret) {
  const chosen = services.find(service => service.key === key);
  if (!chosen?.image) throw new Error('Dieser Dienst nennt kein fertiges Image, er müsste erst gebaut werden. Das kann DKHub nicht.');
  const { definition } = chosen;
  const notes = [];
  const others = services.filter(service => service.key !== key).map(service => service.key);
  if (others.length) notes.push(`Die Datei enthält weitere Container (${others.join(', ')}). DKHub installiert nur „${key}“. Braucht die App die anderen, etwa eine Datenbank, läuft sie so noch nicht.`);
  const ignored = IGNORED.filter(name => definition[name] !== undefined);
  if (ignored.length) notes.push(`Nicht übernommen: ${ignored.join(', ')}. Manche Apps brauchen diese Angaben.`);
  const name = typeof definition.container_name === 'string' ? interpolate(definition.container_name).value : '';
  const ports = readPorts([...(definition.ports || [])], notes);
  const volumes = readVolumes(definition.volumes, notes);
  const env = readEnvironment(definition.environment, notes, randomSecret);
  return { ...splitImage(chosen.image), name: (name || key).slice(0, 60), ports, volumes, env, notes: [...new Set(notes)] };
}
