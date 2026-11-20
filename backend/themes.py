"""A theme is data. Only the bundled renderer supplies artwork, CSS and motion."""
import json
from typing import Annotated, Literal, get_args
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

import chat_ai
import settings
from admin_auth import require_admin

Mode = Literal["light", "dark"]
Motif = Literal["grid", "orbit", "manga", "snow", "aurora"]
Shape = Literal["crisp", "soft", "round"]
HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=48, pattern=r"^[^\x00-\x1f\x7f]+$")]


class ThemeSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    name: Name
    mode: Mode
    accent: HexColor
    highlight: HexColor
    motif: Motif
    shape: Shape
    motion: bool


class SavedTheme(ThemeSpec):
    id: str


class ThemeLibrary(BaseModel):
    active: str = "light"
    custom: list[SavedTheme] = Field(default_factory=list, max_length=12)


class Brief(BaseModel):
    prompt: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]


PRESETS = (
    SavedTheme(id="light", name="Hell", mode="light", accent="#137C68", highlight="#E7B363", motif="grid", shape="soft", motion=False),
    SavedTheme(id="dark", name="Dunkel", mode="dark", accent="#73DCC0", highlight="#A79BEC", motif="orbit", shape="soft", motion=True),
    SavedTheme(id="anime", name="Anime", mode="light", accent="#B53372", highlight="#705CE0", motif="manga", shape="crisp", motion=True),
    SavedTheme(id="christmas", name="Weihnachten", mode="dark", accent="#98D9AC", highlight="#ECAC70", motif="snow", shape="round", motion=True),
)
router = APIRouter()
admin = APIRouter(prefix="/api/admin/themes", dependencies=[Depends(require_admin)])


def library(values):
    try:
        return ThemeLibrary.model_validate(values.get("appearance", {}))
    except ValidationError as exc:
        raise HTTPException(500, "Die gespeicherten Designs konnten nicht gelesen werden.") from exc


def catalog(lib):
    return {"active": lib.active, "themes": [*PRESETS, *lib.custom]}


def change_library(edit):
    def change(values):
        lib = library(values)
        result = edit(lib)
        values["appearance"] = lib.model_dump()
        return result
    return settings.change_settings(change)


@router.get("/api/theme", response_model=SavedTheme)
def public_theme(response: Response):
    response.headers["Cache-Control"] = "no-store"
    lib = library(settings.read_settings())
    return next((t for t in (*PRESETS, *lib.custom) if t.id == lib.active), PRESETS[0])


@admin.post("/list")
def list_themes():
    return catalog(library(settings.read_settings()))


@admin.post("", status_code=201, response_model=SavedTheme)
def save_theme(spec: ThemeSpec):
    def add(lib):
        if len(lib.custom) >= 12:
            raise HTTPException(409, "Die Sammlung ist voll. Entferne zuerst ein eigenes Theme.")
        if any(t.name.casefold() == spec.name.casefold() for t in (*PRESETS, *lib.custom)):
            raise HTTPException(409, "Diesen Namen gibt es schon. Wähle einen anderen.")
        theme = SavedTheme(id="custom-" + uuid4().hex, **spec.model_dump())
        lib.custom.append(theme)
        return theme
    return change_library(add)


@admin.post("/{theme_id}/activate", response_model=SavedTheme)
def activate_theme(theme_id: str):
    def activate(lib):
        for theme in (*PRESETS, *lib.custom):
            if theme.id == theme_id:
                lib.active = theme_id
                return theme
        raise HTTPException(404, "Theme nicht gefunden.")
    return change_library(activate)


@admin.delete("/{theme_id}", status_code=204)
def remove_theme(theme_id: str):
    def remove(lib):
        if theme_id == lib.active or any(t.id == theme_id for t in PRESETS):
            raise HTTPException(409, "Aktive Themes und Vorlagen bleiben in der Sammlung.")
        for i, theme in enumerate(lib.custom):
            if theme.id == theme_id:
                lib.custom.pop(i)
                return
        raise HTTPException(404, "Theme nicht gefunden.")
    change_library(remove)


@admin.post("/draft", response_model=ThemeSpec)
def generate_theme(brief: Brief):
    cfg = settings.config()
    if not cfg["enabled"] or not cfg["openai_key"]:
        raise HTTPException(503, "Aktiviere KI und hinterlege einen OpenAI-Schlüssel unter KI-Zugänge.")
    if not chat_ai.AI_LOCK.acquire(blocking=False):
        raise HTTPException(429, "Eine KI-Anfrage läuft bereits. Bitte kurz warten.")
    try:
        props = {key: {"type": "string"} for key in ("name", "accent", "highlight")}
        for key, kind in (("mode", Mode), ("motif", Motif), ("shape", Shape)):
            props[key] = {"type": "string", "enum": list(get_args(kind))}
        props["motion"] = {"type": "boolean"}
        answer = chat_ai.post_json("https://api.openai.com/v1/responses", cfg["openai_key"], {
            "model": cfg["openai_model"], "store": False, "max_output_tokens": 650,
            "instructions": ("Entwirf ein visuelles DKHub-Theme zum Gestaltungswunsch. Gib nur das Rezept zurück. "
                             "Wähle zwei passende Farben im Format #RRGGBB, einen Namen auf Deutsch (max. 48 Zeichen), "
                             "ein Motiv (grid: Raster, orbit: Ringe, manga: Tuschestriche, snow: Schnee, aurora: Lichtbänder), "
                             "eine Form und passende dezente Bewegung. Wünsche ohne Animation respektieren."),
            "input": brief.prompt,
            "text": {"format": {"type": "json_schema", "name": "dkhub_theme", "strict": True,
                                "schema": {"type": "object", "properties": props,
                                           "required": list(props), "additionalProperties": False}}},
        })
        try:
            if answer["status"] != "completed":
                raise ValueError()
            content = "".join(part["text"] for item in answer["output"] if item["type"] == "message"
                              for part in item["content"] if part["type"] == "output_text")
            return ThemeSpec.model_validate(json.loads(content))
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(502, "Kein gültiger Theme-Entwurf. Probiere einen anderen Gestaltungswunsch.") from exc
    finally:
        chat_ai.AI_LOCK.release()


router.include_router(admin)
