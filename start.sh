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
printf '\nDKHub startet auf Port %s. Beenden mit Strg+C.\n' "$port"
printf 'Auf dem Server: http://localhost:%s · im Heimnetz: http://SERVER-IP:%s\n\n' "$port" "$port"
cd "$root/backend"
exec "$root/backend/.venv/bin/python" -m uvicorn main:app --host 0.0.0.0 --port "$port"
