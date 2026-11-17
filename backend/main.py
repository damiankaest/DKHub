"""Small app catalog and static frontend server."""

import json
import os
import secrets
import tempfile
from threading import Lock
from uuid import uuid4
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

ROOT = Path(__file__).resolve().parent
CATALOG = Path(os.environ.get("DKHUB_APPS_FILE", ROOT / ".local" / "apps.json"))
SEED = ROOT / "apps.json"
CATALOG_LOCK = Lock()
FRONTEND = ROOT.parent / "frontend" / "dist"


class AppEntry(BaseModel):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9-]+$")
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
        return entries
    except (OSError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=500, detail="Unable to read app catalog") from exc


class NewApp(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=2048)
    description: str = Field(default="", max_length=300)
    mode: Literal["embed", "external"] = "external"


@app.post("/api/apps", response_model=AppEntry, status_code=201)
def add_app(
    entry: NewApp,
    request: Request,
    admin_password: str = Header(default="", alias="X-DKHub-Admin"),
) -> AppEntry:
    configured = os.environ.get("DKHUB_ADMIN_PASSWORD", "")
    if not configured:
        raise HTTPException(503, "Admin password not configured")
    if not secrets.compare_digest(admin_password.encode(), configured.encode()):
        raise HTTPException(403, "Incorrect admin password")
    # Browser requests must come from this hub, not from another website.
    origin = request.headers.get("origin")
    expected = f"{request.url.scheme}://{request.headers.get('host', '')}"
    if origin != expected:
        raise HTTPException(403, "Invalid origin")
    name = entry.name.strip()
    if not name:
        raise HTTPException(422, "Name is required")
    try:
        app_entry = AppEntry(
            id=uuid4().hex,
            name=name,
            description=entry.description.strip(),
            category="Meine Apps",
            icon="globe",
            color="sage",
            url=entry.url.strip(),
            mode=entry.mode,
            label="Webseite",
        )
    except ValueError as exc:
        raise HTTPException(422, "Invalid app details") from exc
    # One process owns writes; replace the complete file atomically.
    with CATALOG_LOCK:
        entries = list_apps()
        CATALOG.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=CATALOG.parent, delete=False
            ) as output:
                tmp_path = Path(output.name)
                json.dump([item.model_dump() for item in [*entries, app_entry]], output,
                          ensure_ascii=False, indent=2)
                output.write("\n")
            os.replace(tmp_path, CATALOG)
        finally:
            if tmp_path is not None:
                tmp_path.unlink(missing_ok=True)
    return app_entry


# API routes are registered first so the frontend never intercepts them.
if FRONTEND.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
