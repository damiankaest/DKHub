# Startet DKHub unter Windows. Beenden mit Strg+C.
# Optional: $env:DKHUB_PORT = 8080; $env:DKHUB_PYTHON = "3.12"
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$port = if ($env:DKHUB_PORT) { $env:DKHUB_PORT } else { '8000' }
$pyVersion = if ($env:DKHUB_PYTHON) { $env:DKHUB_PYTHON } else { '3.12' }

function Invoke-Checked {
    param([scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Befehl fehlgeschlagen (Exit-Code $LASTEXITCODE)." }
}

foreach ($cmd in 'py', 'node', 'npm') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "Fehlt: $cmd. Bitte Python $pyVersion (mit py-Launcher) und Node.js mit npm installieren."
    }
}

$venvPython = Join-Path $root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
    Write-Host "Erstelle virtuelle Python-Umgebung (Python $pyVersion) ..."
    Invoke-Checked { py "-$pyVersion" -m venv (Join-Path $root 'backend\.venv') }
}

Write-Host "`nInstalliere Backend-Abhaengigkeiten ..."
Invoke-Checked { & $venvPython -m pip install --disable-pip-version-check -r (Join-Path $root 'backend\requirements.txt') }

Write-Host "`nInstalliere Frontend-Abhaengigkeiten und baue die Oberflaeche ..."
Push-Location (Join-Path $root 'frontend')
try {
    Invoke-Checked { npm ci --ignore-scripts --no-audit --no-fund }
    Invoke-Checked { npm run build }
}
finally { Pop-Location }

$listeners = Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction SilentlyContinue
foreach ($procId in ($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "Beende Prozess auf Port ${port}: $($proc.ProcessName) (PID $procId)"
        Stop-Process -Id $procId -Force
    }
}

Write-Host "`nDKHub startet auf http://localhost:$port - Beenden mit Strg+C.`n"
Set-Location (Join-Path $root 'backend')
& $venvPython -m uvicorn main:app --host 127.0.0.1 --port $port
