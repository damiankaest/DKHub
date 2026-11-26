"""DKDirector: loopback-only API for a small set of managed Docker services."""

import http.client
from contextlib import nullcontext
import ipaddress
import json
import os
import random
import re
import secrets
import socket
import subprocess
import threading
import time
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

from .service_data import (MountRequest, backup_router, load_definition, save_definition,
                           service_data_operation, set_definition_image, storage_issue, volume_engine, volume_view)
from .volumes import BackupError, Volume, validate_mounts
from .forge_postgres import Postgres

app = FastAPI(title="DKDirector", docs_url=None, redoc_url=None, openapi_url=None)
LABEL = "io.dkhub.director=managed"
FORGE_LABEL = "io.dkhub.forge"
IMAGE = re.compile(r"^[a-z0-9]+(?:[._/-][a-z0-9]+)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})$")
SERVICE = re.compile(r"^dkhub-[a-f0-9]{32}$")
# Below the ephemeral ranges of Linux and Windows, so outgoing connections do not occupy these ports.
PORT_RANGE = range(20000, 30000)
INSTALL_LOCK = threading.Lock()
# Stays below the Hub's 320 s request timeout together with the following run.
PULL_TIMEOUT = 270
PORT_CONFLICTS = ("port is already allocated", "ports are not available", "address already in use")


def check_token(token: str) -> None:
    expected = os.environ.get("DKDIRECTOR_TOKEN", "")
    if not expected or not secrets.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(403, "Director access denied")


def docker(*args: str, timeout: int = 30) -> str:
    try:
        # Docker writes UTF-8; the Windows default code page would garble umlauts in service names.
        result = subprocess.run(["docker", *args], capture_output=True, text=True, encoding="utf-8",
                                errors="replace", timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(503, "Docker antwortet nicht. Läuft Docker Desktop? Prüfe die Dienstliste, bevor du es erneut versuchst.") from exc
    if result.returncode != 0:
        error = HTTPException(502, "Docker konnte die Aktion nicht ausführen. Prüfe, ob Docker läuft.")
        error.stderr = result.stderr or ""
        raise error
    return result.stdout


def port_conflict(error: HTTPException) -> bool:
    return any(text in getattr(error, "stderr", "").lower() for text in PORT_CONFLICTS)


def binding_ip() -> str:
    raw = os.environ.get("DKDIRECTOR_BIND_IP", "127.0.0.1")
    try:
        ip = ipaddress.ip_address(raw)
        if ip.version != 4 or ip.is_unspecified or ip.is_multicast:
            raise ValueError()
        return str(ip)
    except ValueError as exc:
        raise HTTPException(503, "Set DKDIRECTOR_BIND_IP to one explicit IPv4 address") from exc


def fixed_binding(item: dict, port: str) -> dict | None:
    """The assigned host address. Docker Desktop hides it for stopped containers, so labels come first."""
    labels = item.get("Config", {}).get("Labels") or {}
    if labels.get("io.dkhub.host-port"):
        return {"HostIp": labels.get("io.dkhub.host-ip"), "HostPort": labels["io.dkhub.host-port"]}
    configured = ((item.get("HostConfig") or {}).get("PortBindings") or {}).get(f"{port}/tcp") or []
    return configured[0] if configured and configured[0].get("HostPort") else None


def service_view(item: dict) -> dict:
    labels = item.get("Config", {}).get("Labels") or {}
    if labels.get("io.dkhub.director") != "managed":
        raise HTTPException(404, "Service not found")
    name = item.get("Name", "").lstrip("/")
    if not SERVICE.fullmatch(name):
        raise HTTPException(404, "Service not found")
    port = labels.get("io.dkhub.port", "")
    host_config = item.get("HostConfig") or {}
    actual = ((item.get("NetworkSettings") or {}).get("Ports") or {}).get(f"{port}/tcp") or []
    configured = fixed_binding(item, port)
    fixed = configured is not None
    state = item.get("State", {}).get("Status", "unknown")
    # What Docker really publishes wins; only a service that is not running falls back to its fixed port.
    # Docker Desktop starts a container without publishing it when the port is taken.
    # A crash loop looks similar for a moment, but has restarted before.
    blocked = state == "running" and fixed and not actual and not item.get("RestartCount")
    binding = actual or ([configured] if fixed and state != "running" else [])
    mapped = binding[0].get("HostPort") if binding else None
    volumes = []
    for mount in item.get("Mounts") or []:
        source = mount.get("Name", "")
        if mount.get("Type") == "volume" and mount.get("RW") and source.startswith(name + "."):
            try:
                volume = Volume(name, source[len(name) + 1:], mount.get("Destination"))
            except BackupError:
                continue
            volumes.append(volume_view(volume))
    return {"id": name, "name": labels.get("io.dkhub.name", name),
            "image": item.get("Config", {}).get("Image", ""),
            "state": state,
            "port_blocked": blocked,
            "container_port": int(port) if port.isdigit() else None,
            "fixed_port": fixed,
            "autostart": (host_config.get("RestartPolicy") or {}).get("Name") in {"always", "unless-stopped"},
            "host_port": int(mapped) if mapped and mapped.isdigit() else None,
            "host_ip": binding[0].get("HostIp") if binding else None,
            "volumes": sorted(volumes, key=lambda entry: entry["key"]),
            **({"forge_project": labels[FORGE_LABEL],
                "forge_postgres": labels.get("io.dkhub.forge-database") == "postgres"}
               if FORGE_LABEL in labels else {})}


def inspect_service(service_id: str) -> dict:
    if not SERVICE.fullmatch(service_id):
        raise HTTPException(404, "Service not found")
    try:
        data = json.loads(docker("inspect", "--", service_id))
        if len(data) != 1:
            raise ValueError()
        return service_view(data[0])
    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(502, "Invalid Docker response") from exc


def reserved_ports() -> set[int]:
    """Fixed host ports of managed containers, including stopped ones that are not listening."""
    ids = docker("ps", "-aq", "--filter", f"label={LABEL}").split()
    if not ids:
        return set()
    try:
        ports = set()
        for item in json.loads(docker("inspect", "--", *ids)):
            labels = item.get("Config", {}).get("Labels") or {}
            if labels.get("io.dkhub.host-port"):
                ports.add(int(labels["io.dkhub.host-port"]))
            ports.update(int(binding["HostPort"])
                         for bindings in ((item.get("HostConfig") or {}).get("PortBindings") or {}).values()
                         for binding in bindings or [] if binding.get("HostPort"))
        return ports
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        raise HTTPException(502, "Invalid Docker response") from exc


def port_is_free(ip: str, port: int) -> bool:
    # The wildcard check also finds programs on other addresses; Windows would allow the specific bind.
    for address in (ip, "0.0.0.0"):
        with socket.socket() as sock:
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            try:
                sock.bind((address, port))
            except OSError:
                return False
    return True


def free_port(ip: str, excluded: set[int] = frozenset()) -> int:
    taken = reserved_ports() | excluded
    for port in random.sample(PORT_RANGE, 100):
        if port not in taken and port_is_free(ip, port):
            return port
    raise HTTPException(503, "Kein freier Port gefunden. Stimmt die IP-Adresse in DKDIRECTOR_BIND_IP noch?")


def image_ports(image: str) -> list[int]:
    """TCP ports declared by the image, loading it first if it is not on this machine."""
    inspect = ("image", "inspect", "--format", "{{json .Config.ExposedPorts}}", image)
    try:
        raw = docker(*inspect)
    except HTTPException:
        try:
            docker("pull", "--quiet", image, timeout=PULL_TIMEOUT)
        except HTTPException as exc:
            if exc.status_code != 502:
                raise
            raise HTTPException(502, "Image konnte nicht geladen werden. Prüfe Name, Version, Internetverbindung und Docker.") from exc
        raw = docker(*inspect)
    try:
        declared = json.loads(raw) or {}
        return sorted({int(key.split("/")[0]) for key in declared if key.endswith("/tcp")})
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(502, "Invalid Docker response") from exc


def discard_failed_install(service_id: str) -> None:
    """Remove the container this very request created if it never started."""
    try:
        if docker("inspect", "--format", "{{.State.Status}}", service_id).strip() == "created":
            docker("rm", service_id)
    except HTTPException:
        pass


def port_stays_blocked(service_id: str) -> bool:
    if not inspect_service(service_id)["port_blocked"]:
        return False
    time.sleep(1)
    return inspect_service(service_id)["port_blocked"]


def launch_service(service_id, name, image, port, ip, host_port, volumes, *, forge_id=None, runtime=()):
    mounts = [arg for volume in volumes for arg in ("--mount", volume.mount())]
    forge_label = ("--label", f"{FORGE_LABEL}={forge_id}") if forge_id else ()
    docker("run", "-d", "--pull", "never", "--restart", "unless-stopped",
           "--name", service_id, "--label", LABEL,
           "--label", f"io.dkhub.name={name}", "--label", f"io.dkhub.port={port}",
           "--label", f"io.dkhub.host-ip={ip}", "--label", f"io.dkhub.host-port={host_port}",
           "--publish", f"{ip}:{host_port}:{port}", *forge_label, *mounts, *runtime, "--", image, timeout=30)


def run_service(service_id: str, name: str, image: str, port: int, ip: str, volumes=(), *, forge_id=None, runtime=()) -> int:
    """Start a new service and return the host port assigned to it."""
    rejected: set[int] = set()
    # The lock stops parallel installs from picking the same port.
    with INSTALL_LOCK:
        for _ in range(5):
            # A fixed host port keeps the Hub tile valid across container and Docker restarts.
            host_port = free_port(ip, rejected)
            try:
                # Generated names, fixed labels and no user-supplied Docker flags or host mounts.
                launch_service(service_id, name, image, port, ip, host_port, volumes,
                               forge_id=forge_id, runtime=runtime)
            except HTTPException as exc:
                if exc.status_code != 502:
                    raise
                discard_failed_install(service_id)
                if not port_conflict(exc):
                    raise HTTPException(502, "Der Container konnte nicht gestartet werden. Das Image braucht vermutlich zusätzliche Einstellungen.") from exc
            else:
                if not port_stays_blocked(service_id):
                    return host_port
                # Created by this request a moment ago and unreachable: replace it.
                docker("rm", "-f", service_id)
            rejected.add(host_port)
    raise HTTPException(409, "Docker hat mehrere Ports als belegt abgelehnt. Bitte später erneut versuchen.")


def probe(ip: str, port: int, path="/") -> int | None:
    """HTTP status of the start page, without following redirects. None means no HTTP answer."""
    connection = http.client.HTTPConnection(ip, port, timeout=3)
    try:
        connection.request("GET", path)
        return connection.getresponse().status
    except (OSError, http.client.HTTPException):
        return None
    finally:
        connection.close()


class InstallRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    image: str = Field(min_length=3, max_length=200)
    port: int | None = Field(default=None, ge=1, le=65535)
    volumes: list[MountRequest] = Field(default_factory=list, max_length=16)


@app.get('/health')
def health(x_director_token: str = Header(default="")):
    check_token(x_director_token)
    return {"status": "ok"}


@app.get('/search')
def search(q: str, x_director_token: str = Header(default="")):
    check_token(x_director_token)
    if not re.fullmatch(r"[a-z0-9][a-z0-9._/-]{1,99}", q):
        raise HTTPException(422, "Invalid search term")
    raw = docker("search", "--limit", "10", "--format", "{{json .}}", q, timeout=30)
    try:
        return [{"name": row["Name"], "description": row.get("Description", ""),
                 "stars": row.get("StarCount", "0"), "official": row.get("IsOfficial") == "[OK]"}
                for row in (json.loads(line) for line in raw.splitlines())]
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(502, "Invalid registry response") from exc


@app.get('/services')
def list_services(x_director_token: str = Header(default="")):
    check_token(x_director_token)
    raw = docker("ps", "-a", "--filter", f"label={LABEL}", "--format", "{{.Names}}")
    services = [inspect_service(name) for name in raw.splitlines() if SERVICE.fullmatch(name)]
    for service in services:
        issue = storage_issue(service)
        if issue:
            service["volume_issue"] = issue
    return services


@app.post('/services', status_code=201)
def install(payload: InstallRequest, x_director_token: str = Header(default="")):
    check_token(x_director_token)
    if not IMAGE.fullmatch(payload.image) or '..' in payload.image or '//' in payload.image:
        raise HTTPException(422, "Use a Docker Hub image with an explicit tag")
    name = payload.name.strip()
    if not name or any(ord(char) < 32 for char in name):
        raise HTTPException(422, "Invalid service name")
    service_id = f"dkhub-{uuid4().hex}"
    mounts = [(item.key, item.target) for item in payload.volumes]
    try:
        validate_mounts([Volume(service_id, key, target) for key, target in mounts])
    except BackupError as exc:
        raise HTTPException(422, str(exc)) from exc
    ip = binding_ip()
    port = payload.port
    if port is None:
        declared = image_ports(payload.image)
        if len(declared) != 1:
            return JSONResponse({"port_required": True, "ports": declared})
        port = declared[0]
    else:
        image_ports(payload.image)
    volumes = []
    if mounts:
        try:
            volumes = volume_engine().provision(service_id, mounts)
        except BackupError as exc:
            raise HTTPException(502, f"Could not provision volumes for {service_id}: {exc}") from exc
    host_port = run_service(service_id, name, payload.image, port, ip, volumes)
    if volumes:
        try:
            save_definition(service_id, name, payload.image, port, ip, host_port, volumes)
        except OSError as exc:
            raise HTTPException(502, f"Service {service_id} was created, but its definition could not be saved: {exc}") from exc
    # A crashing app has no live mapping; its tile still belongs to the assigned port.
    return {**inspect_service(service_id), "host_port": host_port, "host_ip": ip}


def port_taken_message(port) -> str:
    return f"Der feste Port {port or ''} ist belegt. Beende das andere Programm und starte den Dienst erneut."


@app.get('/services/{service_id}/health')
def service_health(service_id: str, wait: int = Query(0, ge=0, le=30), x_director_token: str = Header(default="")):
    check_token(x_director_token)
    deadline = time.monotonic() + wait
    while True:
        service = inspect_service(service_id)
        state = service["state"]
        if service.get("port_blocked"):
            return {"status": "port_blocked", "http_status": None}
        if state in {"exited", "dead", "created", "paused"}:
            return {"status": "stopped", "http_status": None}
        if state == "running" and service["host_port"]:
            code = probe(service["host_ip"], service["host_port"])
            if code is not None:
                return {"status": "reachable", "http_status": code}
        if time.monotonic() >= deadline:
            return {"status": "restarting" if state == "restarting" else "unreachable", "http_status": None}
        time.sleep(1)


app.include_router(backup_router(check_token, inspect_service))


@app.post('/services/{service_id}/{action}')
def change_state(service_id: str, action: str, x_director_token: str = Header(default="")):
    check_token(x_director_token)
    if action not in {"start", "stop"}:
        raise HTTPException(404, "Unknown action")
    with service_data_operation():
        return apply_state_change(service_id, action)


def apply_state_change(service_id: str, action: str):
    service = inspect_service(service_id)
    if action == "start":
        issue = storage_issue(service, verify=True)
        if issue:
            raise HTTPException(409, issue)
        if (service["state"] in {"exited", "created", "dead"} and service["fixed_port"]
                and service["host_ip"] and service["host_port"]
                and not port_is_free(service["host_ip"], service["host_port"])):
            raise HTTPException(409, port_taken_message(service["host_port"]))
    try:
        docker(action, "--", service_id, timeout=60)
    except HTTPException as exc:
        if action == "start" and port_conflict(exc):
            raise HTTPException(409, port_taken_message(service["host_port"])) from exc
        raise
    result = inspect_service(service_id)
    if action == "start" and result.get("port_blocked"):
        # Without its port the service is useless; leave it stopped as before.
        docker("stop", "--", service_id, timeout=60)
        raise HTTPException(409, port_taken_message(service["host_port"]))
    return result


class ForgeInstall(BaseModel):
    name: str = Field(min_length=1, max_length=60, pattern=r"^[^\x00-\x1f\x7f]+$")
    sqlite: bool
    postgres: bool = False

    @model_validator(mode="after")
    def one_database(self):
        if self.sqlite and self.postgres:
            raise ValueError("Wähle SQLite oder PostgreSQL.")
        return self


class ForgeRelease(ForgeInstall):
    release: str = Field(pattern=r"^r[a-f0-9]{32}$")


def forge_identity(project_id, release="v1"):
    if not re.fullmatch(r"[a-f0-9]{32}", project_id):
        raise HTTPException(404, "DKForge-Projekt existiert nicht.")
    return f"dkhub-{project_id}", f"dkforge/project-{project_id}:{release}"


def inspect_forge_service(project_id, service_id, image=None):
    service = inspect_service(service_id)
    if (service.get("forge_project") != project_id
            or not re.fullmatch(rf"dkforge/project-{project_id}:(?:v1|r[a-f0-9]{{32}})", service["image"])
            or (image is not None and service["image"] != image)):
        raise HTTPException(409, f"Dienst-ID {service_id} ist bereits anderweitig belegt.")
    return service


def forge_runtime(project_id, payload):
    return Postgres().project_args(project_id) if payload.postgres else nullcontext(())


def forge_storage(service, payload, volumes):
    if (service["volumes"] != list(map(volume_view, volumes))
            or service.get("forge_postgres", False) != payload.postgres):
        raise HTTPException(409, "Die Datenbank- oder Volume-Zuordnung weicht vom Projektplan ab.")


def container_exists(name):
    containers = docker("ps", "-a", "--filter", f"name=^/{name}$", "--format", "{{.Names}}")
    return name in containers.splitlines()


@app.post("/forge/{project_id}/start")
def start_forge(project_id: str, payload: ForgeInstall, x_director_token: str = Header(default="")):
    check_token(x_director_token)
    service_id, image = forge_identity(project_id)
    ip = binding_ip()
    volumes = [Volume(service_id, "data", "/data")] if payload.sqlite else []
    with service_data_operation():
        if container_exists(service_id):
            service = inspect_forge_service(project_id, service_id, image)
        else:
            docker("image", "inspect", image)  # Forge only launches the locally built tag.
            if volumes:
                try:
                    volumes = volume_engine().provision(service_id, [("data", "/data")])
                except BackupError as exc:
                    raise HTTPException(502, f"Volume für {service_id} konnte nicht bereitgestellt werden: {exc}") from exc
            with forge_runtime(project_id, payload) as runtime:
                run_service(service_id, payload.name, image, 8000, ip, volumes, forge_id=project_id, runtime=runtime)
            service = inspect_forge_service(project_id, service_id, image)
        forge_storage(service, payload, volumes)
        if volumes and load_definition(service_id, required=False) is None:
            try:
                volume_engine().verify(volumes[0])
                save_definition(service_id, service["name"], image, 8000,
                                service["host_ip"], service["host_port"], volumes)
            except (OSError, BackupError) as exc:
                raise HTTPException(502, f"Dienst {service_id} existiert, seine Definition konnte nicht gespeichert werden: {exc}") from exc
        if service["state"] in {"created", "exited", "dead"}:
            return apply_state_change(service_id, "start")
        return service


@app.get("/forge/{project_id}/health")
def forge_health(project_id: str, x_director_token: str = Header(default="")):
    check_token(x_director_token)
    service_id, _ = forge_identity(project_id)
    service = inspect_forge_service(project_id, service_id)
    if service["state"] != "running" or not service["host_port"]:
        return {"status": service["state"] if service["state"] != "running" else "port_blocked"}
    code = probe(service["host_ip"], service["host_port"], "/health")
    return {"status": "reachable" if code == 200 else "unreachable", "http_status": code}


def wait_for_forge(project_id, service_id, image=None, *, seconds=25):
    deadline = time.monotonic() + seconds
    while True:
        service = inspect_forge_service(project_id, service_id, image)
        if (service["state"] == "running" and service["host_port"]
                and probe(service["host_ip"], service["host_port"], "/health") == 200):
            return service
        if service["state"] in {"dead", "exited"} or time.monotonic() >= deadline:
            raise HTTPException(502, "Die neue Version besteht den Health-Check nicht.")
        time.sleep(.5)


@app.post("/forge/{project_id}/release")
def release_forge(project_id: str, payload: ForgeRelease, x_director_token: str = Header(default="")):
    check_token(x_director_token)
    service_id, image = forge_identity(project_id, payload.release)
    previous = service_id + "-rollback"

    def restore_previous():
        if container_exists(service_id):
            inspect_forge_service(project_id, service_id)
            docker("rm", "-f", "--", service_id)
        docker("rename", previous, service_id)
        docker("start", "--", service_id)
        old = wait_for_forge(project_id, service_id, seconds=10)
        set_definition_image(service_id, old["image"])

    with service_data_operation():
        if container_exists(previous):
            label = docker("inspect", "--format", '{{index .Config.Labels "io.dkhub.forge"}}', previous)
            if label.strip() != project_id:
                raise HTTPException(409, "Der Rollback-Containername ist bereits belegt.")
            try:
                serving = wait_for_forge(project_id, service_id, seconds=2) if container_exists(service_id) else None
            except HTTPException:
                serving = None
            if serving:
                set_definition_image(service_id, serving["image"])
                docker("rm", "--", previous)
            else:
                restore_previous()
        old = inspect_forge_service(project_id, service_id)
        if old["image"] == image:
            return wait_for_forge(project_id, service_id, image)
        if old["state"] != "running" or not old["fixed_port"] or not old["host_port"]:
            raise HTTPException(409, "Starte den Dienst mit seinem festen Port vor der Neuveröffentlichung.")
        docker("image", "inspect", image)
        volumes = [Volume(service_id, "data", "/data")] if payload.sqlite else []
        forge_storage(old, payload, volumes)
        issue = storage_issue(old, verify=True)
        if issue:
            raise HTTPException(409, issue)
        with forge_runtime(project_id, payload) as runtime:
            docker("rename", service_id, previous)
            try:
                docker("stop", "--", previous, timeout=60)
                launch_service(service_id, old["name"], image, 8000, old["host_ip"], old["host_port"],
                               volumes, forge_id=project_id, runtime=runtime)
                service = wait_for_forge(project_id, service_id, image)
                set_definition_image(service_id, image)
            except (HTTPException, OSError) as exc:
                try:
                    restore_previous()
                except (HTTPException, OSError) as rollback_error:
                    raise HTTPException(502, f"Veröffentlichung und Container-Rollback fehlgeschlagen. Prüfe {service_id} und {previous}. Die Daten wurden nicht gelöscht.") from rollback_error
                raise HTTPException(502, f"Die Neuveröffentlichung ist fehlgeschlagen. Der vorige Container wurde wieder gestartet. {getattr(exc, 'detail', '')}") from exc
        docker("rm", "--", previous)
        return service


@app.post("/forge/{project_id}/postgres/backup")
def backup_forge_postgres(project_id: str, x_director_token: str = Header(default="")):
    check_token(x_director_token)
    forge_identity(project_id)
    with service_data_operation():
        return Postgres().backup(project_id)
