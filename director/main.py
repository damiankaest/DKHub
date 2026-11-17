"""DKDirector: loopback-only API for a small set of managed Docker services."""

import ipaddress
import json
import os
import re
import secrets
import subprocess
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="DKDirector", docs_url=None, redoc_url=None, openapi_url=None)
LABEL = "io.dkhub.director=managed"
IMAGE = re.compile(r"^[a-z0-9]+(?:[._/-][a-z0-9]+)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})$")
SERVICE = re.compile(r"^dkhub-[a-f0-9]{32}$")


def check_token(token: str) -> None:
    expected = os.environ.get("DKDIRECTOR_TOKEN", "")
    if not expected or not secrets.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(403, "Director access denied")


def docker(*args: str, timeout: int = 30) -> str:
    try:
        result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(503, "Docker unavailable or operation timed out; check the service before retrying") from exc
    if result.returncode != 0:
        raise HTTPException(502, "Docker operation failed; check Docker and the image on the server")
    return result.stdout


def binding_ip() -> str:
    raw = os.environ.get("DKDIRECTOR_BIND_IP", "127.0.0.1")
    try:
        ip = ipaddress.ip_address(raw)
        if ip.version != 4 or ip.is_unspecified or ip.is_multicast:
            raise ValueError()
        return str(ip)
    except ValueError as exc:
        raise HTTPException(503, "Set DKDIRECTOR_BIND_IP to one explicit IPv4 address") from exc


def service_view(item: dict) -> dict:
    labels = item.get("Config", {}).get("Labels") or {}
    if labels.get("io.dkhub.director") != "managed":
        raise HTTPException(404, "Service not found")
    name = item.get("Name", "").lstrip("/")
    if not SERVICE.fullmatch(name):
        raise HTTPException(404, "Service not found")
    port = labels.get("io.dkhub.port", "")
    ports = item.get("NetworkSettings", {}).get("Ports") or {}
    binding = ports.get(f"{port}/tcp") or []
    mapped = binding[0].get("HostPort") if binding else None
    return {"id": name, "name": labels.get("io.dkhub.name", name),
            "image": item.get("Config", {}).get("Image", ""),
            "state": item.get("State", {}).get("Status", "unknown"),
            "host_port": int(mapped) if mapped and mapped.isdigit() else None,
            "host_ip": binding[0].get("HostIp") if binding else None}


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


class InstallRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    image: str = Field(min_length=3, max_length=200)
    port: int = Field(ge=1, le=65535)


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
    return [inspect_service(name) for name in raw.splitlines() if SERVICE.fullmatch(name)]


@app.post('/services', status_code=201)
def install(payload: InstallRequest, x_director_token: str = Header(default="")):
    check_token(x_director_token)
    if not IMAGE.fullmatch(payload.image) or '..' in payload.image or '//' in payload.image:
        raise HTTPException(422, "Use a Docker Hub image with an explicit tag")
    name = payload.name.strip()
    if not name or any(ord(char) < 32 for char in name):
        raise HTTPException(422, "Invalid service name")
    ip = binding_ip()
    service_id = f"dkhub-{uuid4().hex}"
    # Generated names, fixed labels and no user-supplied Docker flags or host mounts.
    docker("run", "-d", "--name", service_id, "--label", LABEL,
           "--label", f"io.dkhub.name={name}", "--label", f"io.dkhub.port={payload.port}",
           "--publish", f"{ip}::{payload.port}", "--", payload.image, timeout=300)
    return inspect_service(service_id)


@app.post('/services/{service_id}/{action}')
def change_state(service_id: str, action: str, x_director_token: str = Header(default="")):
    check_token(x_director_token)
    if action not in {"start", "stop"}:
        raise HTTPException(404, "Unknown action")
    inspect_service(service_id)
    docker(action, "--", service_id, timeout=60)
    return inspect_service(service_id)
