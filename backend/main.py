"""Small app catalog and static frontend server."""

import json
import hashlib
import os
import re
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
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, field_validator
from starlette.exceptions import HTTPException as StarletteHTTPException

from admin_auth import authorize, password_required
from themes import router as themes_router
from chat_ai import ChatRequest, respond
import settings
from page_analysis import analyze_page
from forge import build_router as forge_router

ROOT = Path(__file__).resolve().parent
CATALOG = Path(os.environ.get("DKHUB_APPS_FILE", ROOT / ".local" / "apps.json"))
SEED = ROOT / "apps.json"
IMAGE_DIR = Path(os.environ.get("DKHUB_IMAGE_DIR", ROOT / ".local" / "images"))
IMAGE_PATTERN = r"^/api/images/[a-f0-9]{64}\.(png|jpg|webp)$"
CATALOG_LOCK = Lock()
FRONTEND = ROOT.parent / "frontend" / "dist"
RESERVED = {"api", "assets", "docs", "redoc", "openapi", "demo"}
ROUTE_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class AppEntry(BaseModel):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9-]+$")
    route: str | None = Field(default=None, min_length=1, max_length=80, pattern=ROUTE_PATTERN)
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(max_length=300)
    image: str = Field(default="", pattern=r"^$|" + IMAGE_PATTERN)
    manifest: str = Field(default="", max_length=3000)
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
app.include_router(themes_router)


@app.get("/api/auth")
def auth_mode():
    return {"password_required": password_required()}


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


@app.post("/api/admin/images", status_code=201)
async def upload_image(request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > 2 * 1024 * 1024:
            raise HTTPException(413, "Image exceeds 2 MB")
    raw = bytes(content)
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        suffix = "png"
    elif raw.startswith(b"\xff\xd8\xff"):
        suffix = "jpg"
    elif len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        suffix = "webp"
    else:
        raise HTTPException(415, "Use PNG, JPEG or WebP")
    name = hashlib.sha256(raw).hexdigest() + "." + suffix
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    path = IMAGE_DIR / name
    if not path.exists():
        tmp = None
        try:
            with tempfile.NamedTemporaryFile(dir=IMAGE_DIR, delete=False) as output:
                tmp = Path(output.name)
                output.write(raw)
            os.replace(tmp, path)
        finally:
            if tmp is not None:
                tmp.unlink(missing_ok=True)
    return {"image": "/api/images/" + name}


@app.get("/api/images/{filename}")
def get_image(filename: str):
    if not re.fullmatch(r"[a-f0-9]{64}\.(png|jpg|webp)", filename):
        raise HTTPException(404, "Image not found")
    path = IMAGE_DIR / filename
    if not path.is_file():
        raise HTTPException(404, "Image not found")
    content_type = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}[filename.rsplit(".", 1)[1]]
    return FileResponse(path, media_type=content_type, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable"})


class ReorderApps(BaseModel):
    ids: list[str] = Field(max_length=1000)


@app.post("/api/apps/reorder", response_model=list[AppEntry])
def reorder_apps(payload: ReorderApps, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")) -> list[AppEntry]:
    authorize(request, admin_password)
    with CATALOG_LOCK:
        entries = list_apps()
        by_id = {entry.id: entry for entry in entries}
        if len(payload.ids) != len(entries) or len(set(payload.ids)) != len(entries) or set(payload.ids) != set(by_id):
            raise HTTPException(409, "Catalog changed; reload and try again")
        ordered = [by_id[app_id] for app_id in payload.ids]
        save_catalog(ordered)
        return ordered


class NewApp(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=2048)
    description: str = Field(default="", max_length=300)
    mode: Literal["embed", "external"] = "external"
    image: str | None = Field(default=None, pattern=r"^$|" + IMAGE_PATTERN)
    manifest: str | None = Field(default=None, max_length=3000)
    category: str | None = Field(default=None, max_length=80)
    route: str | None = Field(default=None, max_length=80, pattern=ROUTE_PATTERN)

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("Category cannot be empty")
        return value


@app.post("/api/apps", response_model=AppEntry, status_code=201)
def add_app(entry: NewApp, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")) -> AppEntry:
    authorize(request, admin_password)
    name = entry.name.strip()
    if not name:
        raise HTTPException(422, "Name is required")
    try:
        app_entry = AppEntry(id=uuid4().hex, route=entry.route, name=name,
                             description=entry.description.strip(), manifest=(entry.manifest or "").strip(), category=entry.category or "Meine Apps",
                             icon="globe", color="sage", image=entry.image or "", url=entry.url.strip(),
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
                "url": entry.url.strip(), "description": entry.description.strip(), "manifest": entry.manifest.strip() if entry.manifest is not None else old.manifest,
                "image": entry.image if entry.image is not None else old.image, "mode": entry.mode, "category": entry.category if entry.category is not None else old.category, "route": route})
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
    port: int | None = Field(default=None, ge=1, le=65535)
    volumes: list[dict[str, str]] = Field(default_factory=list, max_length=16)
    env: list[dict[str, str]] = Field(default_factory=list, max_length=64)


class DirectorRestoreRequest(BaseModel):
    plan_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    confirmation: str = Field(pattern=r"^RESTORE$")


def director_request(path: str, method: str = "GET", payload: dict | None = None) -> dict | list:
    token = os.environ.get("DKDIRECTOR_TOKEN", "")
    if not token:
        raise HTTPException(503, "DKDirector ist nicht aktiviert.")
    port = os.environ.get("DKDIRECTOR_PORT", "8765")
    if not port.isdigit() or not 1 <= int(port) <= 65535:
        raise HTTPException(503, "Invalid DKDirector port")
    data = json.dumps(payload).encode() if payload is not None else None
    req = URLRequest(f"http://127.0.0.1:{port}{path}", data=data, method=method,
                     headers={"X-Director-Token": token, "Content-Type": "application/json"})
    try:
        timeout = 7200 if method == "POST" and "/backups" in path else (320 if method == "POST" else 40)
        if method == "POST" and path.endswith("/postgres/backup"):
            timeout = 650
        with urlopen(req, timeout=timeout) as response:
            return json.load(response)
    except HTTPError as exc:
        status = exc.code if exc.code in {404, 409, 422, 503} else 502
        try:
            detail = json.load(exc)["detail"]
        except (OSError, ValueError, KeyError, TypeError):
            detail = None
        if exc.code == 422 and isinstance(detail, list):
            detail = "; ".join(str(item["msg"]) for item in detail
                               if isinstance(item, dict) and "msg" in item)
        if not isinstance(detail, str) or not detail:
            detail = "DKDirector konnte die Anfrage nicht ausführen. Prüfe den Dienstzustand."
        raise HTTPException(status, detail) from exc
    except (URLError, OSError, ValueError) as exc:
        raise HTTPException(503, "DKDirector ist nicht erreichbar. Prüfe den Dienstzustand, bevor du es erneut versuchst.") from exc


@app.post("/api/director/search")
def director_search(request: Request, q: str, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return director_request("/search?" + urlencode({"q": q}))


@app.post("/api/director/list")
def director_list(request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return director_request("/services")


def director_host() -> str:
    # An explicit address avoids publishing on all interfaces and creating localhost links for other devices.
    import ipaddress
    host = os.environ.get("DKDIRECTOR_BIND_IP", "")
    try:
        ip = ipaddress.ip_address(host)
        if ip.version != 4 or ip.is_unspecified or ip.is_multicast:
            raise ValueError()
    except ValueError as exc:
        raise HTTPException(503, "DKDIRECTOR_BIND_IP muss die IPv4-Adresse dieses Rechners sein.") from exc
    return host


def save_service_tile(service_id: str, name: str, image: str, url: str) -> AppEntry:
    """Create the library tile of a service, or point an existing one at its current address."""
    if not re.fullmatch(r"dkhub-[a-f0-9]{32}", service_id):
        raise ValueError("Invalid service ID")
    app_id = "director-" + service_id[6:]
    with CATALOG_LOCK:
        entries = list_apps()
        old = next((item for item in entries if item.id == app_id), None)
        if old:
            # Keep everything the user configured, including a path or query in the URL.
            previous = urlsplit(old.url)
            scheme = previous.scheme if previous.scheme in {"http", "https"} else "http"
            address = previous._replace(scheme=scheme, netloc=urlsplit(url).netloc).geturl()
            tile = AppEntry.model_validate({**old.model_dump(), "url": address})
            save_catalog([tile if item.id == app_id else item for item in entries])
            return tile
        route = route_from_name(name)
        if route in ({item.route for item in entries} | RESERVED):
            route = f"{route[:46]}-{service_id[6:14]}"
        tile = AppEntry(id=app_id, route=route, name=name.strip(),
            description=f"Docker: {image}"[:300], category="Dienste", icon="globe", color="sage",
            url=url, mode="embed", label="Docker")
        save_catalog([*entries, tile])
        return tile


class DirectorImage(BaseModel):
    image: str = Field(min_length=3, max_length=200)


@app.post("/api/director/image")
def director_image(payload: DirectorImage, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return director_request("/image", "POST", payload.model_dump())


@app.post("/api/director/install", status_code=201)
def director_install(payload: DirectorRequest, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    host = director_host()
    result = director_request("/services", "POST", payload.model_dump())
    if isinstance(result, dict) and result.get("port_required"):
        return JSONResponse({"port_required": True, "ports": result.get("ports", [])})
    if not isinstance(result, dict) or not result.get("host_port") or result.get("host_ip") != host:
        raise HTTPException(502, "Service may exist but has no verified port; check DKDirector before retrying")
    try:
        save_service_tile(result["id"], payload.name, payload.image, f"http://{host}:{int(result['host_port'])}")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(500, "Service may be running but its tile could not be saved; check DKDirector") from exc
    return result


@app.post("/api/director/services/{service_id}/tile", response_model=AppEntry)
def director_tile(service_id: str, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    host = director_host()
    services = director_request("/services")
    service = next((item for item in services if item.get("id") == service_id), None)
    if service is None:
        raise HTTPException(404, "Service not found")
    if not service.get("host_port") or service.get("host_ip") != host:
        raise HTTPException(409, "Start the service first; it has no address on this server")
    try:
        return save_service_tile(service_id, service["name"], service["image"], f"http://{host}:{int(service['host_port'])}")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(500, "The tile could not be saved") from exc


def sync_tile(service: dict) -> None:
    """After a start, keep a tile that points at this server in step with Docker's actual port."""
    host = os.environ.get("DKDIRECTOR_BIND_IP", "")
    try:
        app_id = "director-" + service["id"][6:]
        tile = next((item for item in list_apps() if item.id == app_id), None)
        if tile and service.get("host_port") and service.get("host_ip") == host and urlsplit(tile.url).hostname == host:
            save_service_tile(service["id"], tile.name, service.get("image", ""), f"http://{host}:{int(service['host_port'])}")
    except (OSError, ValueError, KeyError, TypeError):
        pass  # The service list still offers to update an outdated address.


@app.post("/api/director/services/{service_id}/health")
def director_health(service_id: str, request: Request, wait: int = 0, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    if not re.fullmatch(r"dkhub-[a-f0-9]{32}", service_id) or not 0 <= wait <= 30:
        raise HTTPException(404, "Service not found")
    return director_request(f"/services/{service_id}/health?wait={wait}")


def director_backup_path(service_id: str, backup_id: str | None = None) -> str:
    if not re.fullmatch(r"dkhub-[a-f0-9]{32}", service_id):
        raise HTTPException(404, "Service not found")
    path = f"/services/{service_id}/backups"
    if backup_id is not None:
        if not re.fullmatch(r"[a-f0-9]{32}", backup_id):
            raise HTTPException(404, "Backup not found")
        path += f"/{backup_id}"
    return path


@app.post("/api/director/services/{service_id}/backups/list")
def director_backups(service_id: str, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return director_request(director_backup_path(service_id))


@app.post("/api/director/services/{service_id}/backups", status_code=201)
def director_create_backup(service_id: str, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return director_request(director_backup_path(service_id), "POST")


@app.post("/api/director/services/{service_id}/backups/{backup_id}/restore/preview")
def director_restore_preview(service_id: str, backup_id: str, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return director_request(director_backup_path(service_id, backup_id) + "/restore/preview", "POST")


@app.post("/api/director/services/{service_id}/backups/{backup_id}/restore")
def director_restore(service_id: str, backup_id: str, payload: DirectorRestoreRequest, request: Request,
                     admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return director_request(director_backup_path(service_id, backup_id) + "/restore", "POST", payload.model_dump())


@app.post("/api/director/services/{service_id}/{action}")
def director_action(service_id: str, action: str, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    if not re.fullmatch(r"dkhub-[a-f0-9]{32}", service_id) or action not in {"start", "stop"}:
        raise HTTPException(404, "Service not found")
    result = director_request(f"/services/{service_id}/{action}", "POST", {})
    if action == "start" and isinstance(result, dict):
        sync_tile(result)
    return result


app.include_router(forge_router(lambda *args: director_request(*args),
                               lambda: director_host(), lambda *args: save_service_tile(*args)))


class SettingsUpdate(BaseModel):
    enabled: bool | None = None
    typesafe_key: str | None = Field(default=None, max_length=500)
    openai_key: str | None = Field(default=None, max_length=500)
    jev_model: str | None = Field(default=None, min_length=1, max_length=100)
    openai_model: str | None = Field(default=None, min_length=1, max_length=100)


@app.post("/api/admin/settings/read")
def admin_settings(request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return settings.status()


@app.post("/api/admin/settings")
def update_settings(payload: SettingsUpdate, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return settings.save_settings(payload.model_dump(exclude_unset=True))


class AnalyzeRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    name: str = Field(default="", max_length=100)


@app.post("/api/admin/analyze")
def analyze(payload: AnalyzeRequest, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return analyze_page(payload.url, payload.name)


@app.post("/api/chat/ai")
def chat_ai(payload: ChatRequest, request: Request, admin_password: str = Header(default="", alias="X-DKHub-Admin")):
    authorize(request, admin_password)
    return respond(payload, list_apps)


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
