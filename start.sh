#!/usr/bin/env bash
# Start DKHub from any working directory. Stop it with Ctrl+C.
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
python="${DKHUB_PYTHON:-python3}"
port="${DKHUB_PORT:-8000}"

for command in "$python" node npm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Fehlt: %s. Bitte Python 3.12 und Node.js 24 mit npm installieren.\n' "$command" >&2
    exit 1
  fi
done
"$python" -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 12) else 1)' || {
  echo 'DKHub benötigt Python 3.12. Optional: DKHUB_PYTHON auf Python 3.12 setzen.' >&2
  exit 1
}
node -e 'process.exit(Number(process.versions.node.split(".")[0]) === 24 ? 0 : 1)' || {
  echo 'DKHub benötigt Node.js 24.' >&2
  exit 1
}

if [[ ! -x "$root/backend/.venv/bin/python" ]]; then
  echo 'Erstelle virtuelle Python-Umgebung …'
  "$python" -m venv "$root/backend/.venv"
fi
printf '\nInstalliere Backend-Abhängigkeiten …\n'
"$root/backend/.venv/bin/python" -m pip install -r "$root/backend/requirements.txt"
printf '\nInstalliere Frontend-Abhängigkeiten und baue die Oberfläche …\n'
(cd "$root/frontend" && npm ci --ignore-scripts --no-audit --no-fund && npm run build)
if [[ "${DKHUB_ENABLE_DIRECTOR:-0}" == "1" ]]; then
  command -v docker >/dev/null 2>&1 || { echo 'Docker fehlt.' >&2; exit 1; }
  [[ -n "${DKHUB_ADMIN_PASSWORD:-}" && -n "${DKDIRECTOR_BIND_IP:-}" ]] || {
    echo 'Für DKDirector bitte DKHUB_ADMIN_PASSWORD und DKDIRECTOR_BIND_IP setzen.' >&2; exit 1;
  }
  export DKDIRECTOR_TOKEN="$("$root/backend/.venv/bin/python" -c 'import secrets; print(secrets.token_urlsafe(32))')"
  export DKDIRECTOR_PORT="${DKDIRECTOR_PORT:-8765}"
  "$root/backend/.venv/bin/python" -m uvicorn director.main:app --app-dir "$root" --host 127.0.0.1 --port "$DKDIRECTOR_PORT" &
  director_pid=$!
  trap 'kill "$director_pid" 2>/dev/null || true' EXIT
  director_ready=0
  for attempt in {1..30}; do
    if "$root/backend/.venv/bin/python" -c 'import os,urllib.request; r=urllib.request.Request("http://127.0.0.1:"+os.environ["DKDIRECTOR_PORT"]+"/health",headers={"X-Director-Token":os.environ["DKDIRECTOR_TOKEN"]}); urllib.request.urlopen(r,timeout=1).close()' 2>/dev/null; then director_ready=1; break; fi
    kill -0 "$director_pid" 2>/dev/null || break
    sleep 1
  done
  [[ "$director_ready" == "1" ]] || { echo 'DKDirector konnte nicht gestartet werden.' >&2; exit 1; }
fi
printf '\nDKHub startet auf Port %s. Beenden mit Strg+C.\n' "$port"
printf 'Auf dem Server: http://localhost:%s · im Heimnetz: http://SERVER-IP:%s\n\n' "$port" "$port"
cd "$root/backend"
if [[ "${DKHUB_ENABLE_DIRECTOR:-0}" == "1" ]]; then
  "$root/backend/.venv/bin/python" -m uvicorn main:app --host 0.0.0.0 --port "$port"
else
  exec "$root/backend/.venv/bin/python" -m uvicorn main:app --host 0.0.0.0 --port "$port"
fi
