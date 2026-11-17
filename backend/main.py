"""Small app catalog and static frontend server."""

import json
import os
import re
import secrets
import tempfile
import unicodedata
from pathlib import Path
from threading import Lock
from typing import Literal
from urllib.parse import urlsplit, urlencode
from urllib.request import Request as URLRequest, urlopen
from urllib.error import HTTPError, URLError
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from starlette.exceptions import HTTPException as StarletteHTTPException

ROOT = Path(__file__).resolve().parent
CATALOG = Path(os.environ.get("DKHUB_APPS_FILE", ROOT / ".local" / "apps.json"))
SEED = ROOT / "apps.json"
CATALOG_LOCK = Lock()
FRONTEND = ROOT.parent / "frontend" / "dist"
RESERVED = {"api", "assets", "docs", "redoc", "openapi", "demo"}
ROUTE_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class AppEntry(BaseModel):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9-]+$")
    route: str | None = Field(default=None, min_length=1, max_length=80, pattern=ROUTE_PATTERN)
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(max_length=300)
    category: str = Field(min_length=1, max_length=80)
    icon: Literal["spark", "globe"]
    color: Literal["sage", "sand"]
    url: str = Field(min_length=1, max_length=2048)
    mode: Literal["embed", "external"]
    label: str = Field(min_length=1, max_length=80)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        if any(ord(char) < 32 or char == "\\" for char in value):
            raise ValueError("Invalid URL")
        parsed = urlsplit(value)
        if value.startswith("/") and not value.startswith("//"):
            return value
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
            raise ValueError("Use an HTTP(S) URL or an absolute local path")
        try:
            _ = parsed.port
        except ValueError as exc:
            raise ValueError("Invalid URL port") from exc
        return value


def route_from_name(name: str) -> str:
    name = name.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")[:55].strip("-") or "app"


def authorize(request: Request, password: str) -> None:
    configured = os.environ.get("DKHUB_ADMIN_PASSWORD", "")
    if not configured:
        raise HTTPException(503, "Admin password not configured")
    if not secrets.compare_digest(password.encode(), configured.encode()):
        raise HTTPException(403, "Incorrect admin password")
    expected = f"{request.url.scheme}://{request.headers.get('host', '')}"
    if request.headers.get("origin") != expected:
        raise HTTPException(403, "Invalid origin")


def save_catalog(entries: list[AppEntry]) -> None:
    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=CATALOG.parent, delete=False) as output:
            tmp_path = Path(output.name)
            json.dump([item.model_dump() for item in entries], output, ensure_ascii=False, indent=2)
            output.write("\n")
        os.replace(tmp_path, CATALOG)
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)


app = FastAPI(title="DKHub API", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/api/apps", response_model=list[AppEntry])
def list_apps() -> list[AppEntry]:
    try:
        source = CATALOG if CATALOG.exists() else SEED
        data = json.loads(source.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Catalog must be a list")
        entries = [AppEntry.model_validate(item) for item in data]
        if len({entry.id for entry in entries}) != len(entries):
            raise ValueError("Duplicate app ID")
        used = set(RESERVED)
        for entry in entries:
            if entry.route:
                if entry.route in used:
                    raise ValueError("Duplicate or reserved route")
                used.add(entry.route)
        for entry in entries:
            if not entry.route:
                base = route_from_name(entry.name)
                route = base if base not in used else f"{base[:46]}-{entry.id[:8]}"
                if route in used:
                    raise ValueError("Duplicate route")
                entry.route = route
                used.add(route)
        return entries
    except (OSError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=500, detail="Unable to read app catalog") from exc


class NewApp(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=2048)
    description: str = Field(default="", max_length=300)
    mode: Literal["embed", "external"] = "external"
    route: str | None = Field(default=None, max_length=80, pattern=ROUTE_PATTERN)


@app.post("/api/apps", response_model=AppEntry, status_code=201)
def add_app(entry: NewApp, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")) -> AppEntry:
    authorize(request, admin_password)
    name = entry.name.strip()
    if not name:
        raise HTTPException(422, "Name is required")
    try:
        app_entry = AppEntry(id=uuid4().hex, route=entry.route, name=name,
                             description=entry.description.strip(), category="Meine Apps",
                             icon="globe", color="sage", url=entry.url.strip(),
                             mode=entry.mode, label="Webseite")
    except ValueError as exc:
        raise HTTPException(422, "Invalid app details") from exc
    with CATALOG_LOCK:
        entries = list_apps()
        used = {item.route for item in entries} | RESERVED
        chosen = app_entry.route or route_from_name(name)
        if chosen in used:
            if entry.route:
                raise HTTPException(409, "Route already in use")
            chosen = f"{chosen[:46]}-{app_entry.id[:8]}"
        app_entry.route = chosen
        save_catalog([*entries, app_entry])
    return app_entry


@app.put("/api/apps/{app_id}", response_model=AppEntry)
def update_app(app_id: str, entry: NewApp, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")) -> AppEntry:
    authorize(request, admin_password)
    name = entry.name.strip()
    if not name:
        raise HTTPException(422, "Name is required")
    with CATALOG_LOCK:
        entries = list_apps()
        old = next((item for item in entries if item.id == app_id), None)
        if old is None:
            raise HTTPException(404, "App not found")
        route = entry.route or old.route
        if route in RESERVED or any(item.id != app_id and item.route == route for item in entries):
            raise HTTPException(409, "Route already in use")
        try:
            updated = AppEntry.model_validate({**old.model_dump(), "name": name,
                "url": entry.url.strip(), "description": entry.description.strip(),
                "mode": entry.mode, "route": route})
        except ValueError as exc:
            raise HTTPException(422, "Invalid app details") from exc
        save_catalog([updated if item.id == app_id else item for item in entries])
    return updated


@app.delete("/api/apps/{app_id}", status_code=204)
def remove_app(app_id: str, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")) -> None:
    authorize(request, admin_password)
    with CATALOG_LOCK:
        entries = list_apps()
        remaining = [item for item in entries if item.id != app_id]
        if len(remaining) == len(entries):
            raise HTTPException(404, "App not found")
        save_catalog(remaining)


class DirectorRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    image: str = Field(min_length=3, max_length=200)
    port: int = Field(ge=1, le=65535)


def director_request(path: str, method: str = "GET", payload: dict | None = None) -> dict | list:
    token = os.environ.get("DKDIRECTOR_TOKEN", "")
    if not token:
        raise HTTPException(503, "DKDirector is not enabled")
    port = os.environ.get("DKDIRECTOR_PORT", "8765")
    if not port.isdigit() or not 1 <= int(port) <= 65535:
        raise HTTPException(503, "Invalid DKDirector port")
    data = json.dumps(payload).encode() if payload is not None else None
    req = URLRequest(f"http://127.0.0.1:{port}{path}", data=data, method=method,
                     headers={"X-Director-Token": token, "Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=320 if method == "POST" else 40) as response:
            return json.load(response)
    except HTTPError as exc:
        status = exc.code if exc.code in {404, 409, 422, 503} else 502
        raise HTTPException(status, "DKDirector request failed; check the service before retrying") from exc
    except (URLError, OSError, ValueError) as exc:
        raise HTTPException(503, "DKDirector unavailable; check service state before retrying") from exc


@app.post("/api/director/search")
def director_search(request: Request, q: str, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return director_request("/search?" + urlencode({"q": q}))


@app.post("/api/director/list")
def director_list(request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return director_request("/services")


@app.post("/api/director/install", status_code=201)
def director_install(payload: DirectorRequest, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    # An explicit address avoids publishing on all interfaces and creating localhost links for other devices.
    import ipaddress
    host = os.environ.get("DKDIRECTOR_BIND_IP", "")
    try:
        ip = ipaddress.ip_address(host)
        if ip.version != 4 or ip.is_unspecified or ip.is_multicast:
            raise ValueError()
    except ValueError as exc:
        raise HTTPException(503, "Set DKDIRECTOR_BIND_IP to the server's explicit IPv4 address") from exc
    result = director_request("/services", "POST", payload.model_dump())
    if not isinstance(result, dict) or not result.get("host_port") or result.get("host_ip") != host:
        raise HTTPException(502, "Service may exist but has no verified port; check DKDirector before retrying")
    try:
        with CATALOG_LOCK:
            entries = list_apps()
            service_id = result["id"]
            if not re.fullmatch(r"dkhub-[a-f0-9]{32}", service_id):
                raise ValueError("Invalid service ID")
            app_id = "director-" + service_id[6:]
            route = route_from_name(payload.name)
            if route in ({item.route for item in entries} | RESERVED):
                route = f"{route[:46]}-{service_id[6:14]}"
            new = AppEntry(id=app_id, route=route, name=payload.name.strip(),
                description=f"Docker: {payload.image}", category="Dienste", icon="globe", color="sage",
                url=f"http://{host}:{int(result['host_port'])}", mode="embed", label="Docker")
            save_catalog([*entries, new])
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(500, "Service may be running but its tile could not be saved; check DKDirector") from exc
    return result


@app.post("/api/director/services/{service_id}/{action}")
def director_action(service_id: str, action: str, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    if not re.fullmatch(r"dkhub-[a-f0-9]{32}", service_id) or action not in {"start", "stop"}:
        raise HTTPException(404, "Service not found")
    return director_request(f"/services/{service_id}/{action}", "POST", {})


class HubStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or scope["method"] not in {"GET", "HEAD"}:
                raise
            if "/" not in path and any(item.route == path for item in list_apps()):
                return await super().get_response("index.html", scope)
            raise


if FRONTEND.is_dir():
    app.mount("/", HubStaticFiles(directory=FRONTEND, html=True), name="frontend")
