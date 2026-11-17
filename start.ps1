# Startet DKHub unter Windows. Beenden mit Strg+C.
# Optional: $env:DKHUB_PORT = 8080; $env:DKHUB_PYTHON = "3.12"
# Mit DKDirector (Docker-Dienste), vorher in derselben Sitzung setzen:
#   $env:DKHUB_ADMIN_PASSWORD = 'DEIN-PASSWORT'
#   $env:DKDIRECTOR_BIND_IP   = '192.168.1.50'   # eigene IPv4 des Rechners
#   $env:DKHUB_ENABLE_DIRECTOR = '1'
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

function Stop-PortListeners {
    param([int]$LocalPort)
    $listeners = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
    foreach ($procId in ($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Beende Prozess auf Port ${LocalPort}: $($proc.ProcessName) (PID $procId)"
            Stop-Process -Id $procId -Force
        }
    }
}

$enableDirector = $env:DKHUB_ENABLE_DIRECTOR -eq '1'
$directorProc = $null

try {
    Stop-PortListeners -LocalPort ([int]$port)

    if ($enableDirector) {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker fehlt (Docker Desktop starten/installieren).' }
        if (-not $env:DKHUB_ADMIN_PASSWORD -or -not $env:DKDIRECTOR_BIND_IP) {
            throw 'Fuer DKDirector bitte $env:DKHUB_ADMIN_PASSWORD und $env:DKDIRECTOR_BIND_IP setzen.'
        }
        $env:DKDIRECTOR_TOKEN = (& $venvPython -c 'import secrets; print(secrets.token_urlsafe(32))').Trim()
        $env:DKDIRECTOR_PORT = if ($env:DKDIRECTOR_PORT) { $env:DKDIRECTOR_PORT } else { '8765' }
        Stop-PortListeners -LocalPort ([int]$env:DKDIRECTOR_PORT)

        Write-Host "`nStarte DKDirector auf 127.0.0.1:$($env:DKDIRECTOR_PORT) ..."
        $directorProc = Start-Process -FilePath $venvPython -PassThru -NoNewWindow `
            -WorkingDirectory $root `
            -ArgumentList '-m', 'uvicorn', 'director.main:app', '--app-dir', $root, '--host', '127.0.0.1', '--port', $env:DKDIRECTOR_PORT

        $ready = $false
        for ($i = 0; $i -lt 30 -and -not $directorProc.HasExited; $i++) {
            try {
                Invoke-WebRequest "http://127.0.0.1:$($env:DKDIRECTOR_PORT)/health" -UseBasicParsing -TimeoutSec 1 `
                    -Headers @{ 'X-Director-Token' = $env:DKDIRECTOR_TOKEN } | Out-Null
                $ready = $true; break
            } catch { Start-Sleep -Seconds 1 }
        }
        if (-not $ready) { throw 'DKDirector konnte nicht gestartet werden.' }
    }

    Write-Host "`nDKHub startet auf http://localhost:$port - Beenden mit Strg+C.`n"
    Set-Location (Join-Path $root 'backend')
    & $venvPython -m uvicorn main:app --host 127.0.0.1 --port $port
}
finally {
    if ($directorProc -and -not $directorProc.HasExited) {
        Stop-Process -Id $directorProc.Id -Force -ErrorAction SilentlyContinue
    }
}
