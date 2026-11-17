"""Small read-only app catalog and static frontend server."""

import json
import os
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

ROOT = Path(__file__).resolve().parent
CATALOG = Path(os.environ.get("DKHUB_APPS_FILE", ROOT / "apps.json"))
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
        data = json.loads(CATALOG.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Catalog must be a list")
        entries = [AppEntry.model_validate(item) for item in data]
        if len({entry.id for entry in entries}) != len(entries):
            raise ValueError("Duplicate app ID")
        return entries
    except (OSError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=500, detail="Unable to read app catalog") from exc


# API routes are registered first so the frontend never intercepts them.
if FRONTEND.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
