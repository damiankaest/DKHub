import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCompose, readService } from '../src/director/composeFile.js';

const secret = () => 'generated';
const read = (text, key) => { const services = parseCompose(text); return readService(services, key || services[0].key, secret); };

// Shape of https://github.com/TraceApps/lifttrace/blob/main/docker-compose.yml
const lifttrace = `
services:
  lifttrace:
    image: ghcr.io/traceapps/lifttrace:latest
    container_name: lifttrace
    ports:
      - "3002:3002"
    volumes:
      - \${DATA_DB_PATH}:/data/db
      - \${DATA_UPLOADS_PATH}:/data/uploads
    environment:
      - DB_PATH=/data/db/lifttrace.db
      - UPLOADS_PATH=/data/uploads
      - JWT_SECRET=\${JWT_SECRET}
      - INSECURE_COOKIES=\${INSECURE_COOKIES:-}
      - RECOVERY_TOKEN=\${RECOVERY_TOKEN:-}
      - LOG_LEVEL=\${LOG_LEVEL:-info}
      - SMTP_PORT=\${SMTP_PORT:-587}
    restart: unless-stopped
`;

test('a typical compose file fills the whole form', () => {
  const result = read(lifttrace);
  assert.equal(result.image, 'ghcr.io/traceapps/lifttrace');
  assert.equal(result.tag, 'latest');
  assert.equal(result.name, 'lifttrace');
  assert.deepEqual(result.ports, [3002]);
  assert.deepEqual(result.volumes, [{ key: 'db', target: '/data/db' }, { key: 'uploads', target: '/data/uploads' }]);
  assert.deepEqual(result.env.map(row => [row.key, row.value]), [
    ['DB_PATH', '/data/db/lifttrace.db'], ['UPLOADS_PATH', '/data/uploads'], ['JWT_SECRET', 'generated'], ['LOG_LEVEL', 'info'], ['SMTP_PORT', '587']]);
  assert.equal(result.env.find(row => row.key === 'JWT_SECRET').secret, true);
  const notes = result.notes.join('\n');
  assert.match(notes, /Ordner von deinem Rechner/);
  assert.match(notes, /INSECURE_COOKIES, RECOVERY_TOKEN/);
  assert.match(notes, /INSECURE_COOKIES mit Wert 1/);
});

test('several containers, long syntax and unsupported parts are explained', () => {
  const text = `
x-defaults: &defaults
  restart: always
services:
  web:
    <<: *defaults
    image: nginx
    privileged: true
    ports:
      - target: 80
        published: 8080
      - "127.0.0.1:\${HTTPS:-8443}:443"
      - "53:53/udp"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./media:/media:ro
      - type: volume
        source: cache
        target: /var/cache/
      - ./nested:/var/cache/inner
      - /etc/localtime:/etc/localtime:ro
    environment:
      DB_PASSWORD: change-me
      APP_SECRET: your-secret-here
      OIDC_CLIENT_SECRET: \${OIDC_CLIENT_SECRET}
      DATABASE_URL: "postgres://app:\${DB_PASSWORD}@db/app"
      PRICE: "5$$"
      FLAG: true
      TZ:
  db:
    image: postgres:17
  worker:
    build: .
`;
  const services = parseCompose(text);
  assert.deepEqual(services.map(s => [s.key, Boolean(s.image)]), [['web', true], ['db', true], ['worker', false]]);
  const result = readService(services, 'web', secret);
  assert.equal(result.tag, 'latest');
  assert.deepEqual(result.ports, [80, 443]);
  assert.deepEqual(result.volumes, [{ key: 'cache', target: '/var/cache' }]);
  const env = Object.fromEntries(result.env.map(row => [row.key, row]));
  assert.equal(env.APP_SECRET.value, 'generated');
  // A password may be shared with another container, so it is asked for, not invented.
  assert.deepEqual([env.DB_PASSWORD.value, env.DB_PASSWORD.required], ['', true]);
  assert.equal(env.OIDC_CLIENT_SECRET.value, '');
  assert.equal(env.DATABASE_URL.value, 'postgres://app:@db/app');
  assert.equal(env.PRICE.value, '5$');
  assert.equal(env.FLAG.value, 'true');
  assert.equal(env.TZ, undefined);
  const notes = result.notes.join('\n');
  for (const expected of [/weitere Container \(db, worker\)/, /privileged/, /docker\.sock/, /nginx\.conf/, /nur lesbar/, /53\/udp/, /überschneidet/, /DATABASE_URL enthielt/]) assert.match(notes, expected);
  assert.throws(() => readService(services, 'worker', secret), /gebaut/);
});

test('broken input gives readable errors', () => {
  assert.throws(() => parseCompose('  '), /Füge zuerst/);
  assert.throws(() => parseCompose('services:\n  a:\n image: [x'), /kein gültiges YAML/);
  assert.throws(() => parseCompose('version: "3"'), /services/);
  assert.throws(() => read('services:\n  a:\n    image: app@sha256:abc'), /sha256/);
  assert.throws(() => read('services:\n  a:\n    image: Bad Name'), /nicht verwenden/);
});
