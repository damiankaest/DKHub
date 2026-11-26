"""Admin API and resumable local DKForge deployment jobs."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import json
import logging
import os
from pathlib import Path
import re
import subprocess
from tempfile import NamedTemporaryFile
from threading import Event, Lock, Thread
from time import monotonic, sleep
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from admin_auth import require_admin
from forge_plan import Idea, Plan, propose
from forge_project import generate, owns_project, project_path, validate_path
from forge_source import source_digest

ID = re.compile(r"[a-f0-9]{32}")
LOGGER = logging.getLogger(__name__)


class Revision(BaseModel):
    revision: int = Field(ge=1)


class UpdatePlan(Revision):
    plan: Plan


class WatchSetting(BaseModel):
    enabled: bool


def forge_root():
    return Path(os.environ.get("DKFORGE_ROOT", Path(__file__).parent / ".local" / "forge")).resolve()


class Store:
    def __init__(self, root):
        self.root = root
        self.state = root / "state"

    def read(self, project_id):
        if not ID.fullmatch(project_id):
            raise HTTPException(404, "Projekt nicht gefunden.")
        try:
            return json.loads((self.state / f"{project_id}.json").read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise HTTPException(404, "Projekt nicht gefunden.") from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(502, "Der Projektstand konnte nicht gelesen werden.") from exc

    def save(self, record):
        path = self.state / f"{record['id']}.json"
        staged = None
        try:
            self.state.mkdir(mode=0o700, parents=True, exist_ok=True)
            with NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.state, delete=False) as stream:
                staged = Path(stream.name)
                json.dump(record, stream, ensure_ascii=False, indent=2)
            os.replace(staged, path)
        except OSError as exc:
            raise HTTPException(502, "Der Projektstand konnte nicht gespeichert werden.") from exc
        finally:
            if staged:
                staged.unlink(missing_ok=True)

    def folder(self, record):
        return project_path(self.root / "projects", record["plan"]["name"])


def build_image(folder, image, log):
    validate_path(folder)
    try:
        with log.open("wb") as output:
            result = subprocess.run(["docker", "build", "--tag", image, "--file", "Dockerfile", "."],
                                    cwd=folder, stdin=subprocess.DEVNULL, stdout=output,
                                    stderr=subprocess.STDOUT, timeout=900, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(502, "Docker ist nicht erreichbar oder der Build lief zu lange. Prüfe Docker Desktop und das lokale Build-Protokoll.") from exc
    if result.returncode:
        with log.open("rb") as output:
            output.seek(max(0, log.stat().st_size - 2200))
            tail = output.read().decode("utf-8", errors="replace").strip()
        raise HTTPException(502, f"Docker-Build fehlgeschlagen (Code {result.returncode}).\n{tail}")


def build_router(director_request, director_host, save_tile):
    lock = Lock()
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="dkforge")
    active = set()

    @asynccontextmanager
    async def lifespan(_app):
        stopped = Event()
        watcher = Thread(target=watch_sources, args=(stopped,), daemon=True, name="dkforge-source-watch")
        watcher.start()
        try:
            yield
        finally:
            stopped.set()
            watcher.join(timeout=2)

    router = APIRouter(prefix="/api/forge", dependencies=[Depends(require_admin)], lifespan=lifespan)

    def check_revision(record, revision):
        if record["revision"] != revision:
            raise HTTPException(409, "Der Plan ist inzwischen geändert. Öffne den aktuellen Projektstand.")

    def view(record):
        if record["status"] in {"queued", "running"} and record["id"] not in active:
            return {**record, "status": "failed",
                    "error": "Der letzte Lauf wurde unterbrochen. Du kannst ab dem gespeicherten Stand fortfahren."}
        return record

    def deploy(store, record):
        project_id = record["id"]
        service_id = record["expected_service_id"]
        released = False

        def checkpoint(phase, status="running", **fields):
            nonlocal released
            record.update(status=status, phase=phase, **fields)
            with lock:
                store.save(record)
                if status in {"failed", "ready"}:
                    active.discard(project_id)
                    released = True

        try:
            if not record["image_built"]:
                log = store.state / f"{project_id}.build.log"
                checkpoint("build", log=str(log))
                build_image(store.folder(record), record["image"], log)
                checkpoint("start", image_built=True)
            else:
                checkpoint("start")
            ip = director_host()
            payload = {
                "name": record["plan"]["name"], "sqlite": record["plan"]["sqlite"],
            }
            if record["plan"].get("postgres"):
                payload["postgres"] = True
            release = record.get("pending_release")
            if release:
                payload["release"] = release
            service = director_request(f"/forge/{project_id}/{'release' if release else 'start'}", "POST", payload)
            port = service.get("host_port")
            if service.get("id") != service_id or service.get("host_ip") != ip or type(port) is not int or not 1 <= port <= 65535:
                raise HTTPException(502, f"Der Dienst {service_id} könnte existieren. Seine Adresse konnte nicht bestätigt werden.")
            address = f"http://{ip}:{port}"
            checkpoint("health", service_id=service_id, url=address)
            deadline = monotonic() + 25
            while True:
                health = director_request(f"/forge/{project_id}/health")
                if health.get("status") == "reachable":
                    break
                if monotonic() >= deadline or health.get("status") in {"exited", "dead", "port_blocked"}:
                    raise HTTPException(502, f"Dienst {service_id} wurde angelegt. Sein Health-Endpunkt antwortet nicht (Status: {health.get('status')}). Prüfe den Dienst und versuche es erneut.")
                sleep(1)
            checkpoint("catalog")
            tile = save_tile(service_id, record["plan"]["name"], record["image"], address)
            checkpoint("catalog", status="ready", tile_id=tile.id, published_image=record["image"],
                       pending_release=None)
        except Exception as exc:
            if not isinstance(exc, HTTPException):
                LOGGER.exception("DKForge deployment failed at %s", record["phase"])
            detail = exc.detail if isinstance(exc, HTTPException) else "Der Schritt ist fehlgeschlagen. Prüfe DKHub und versuche es erneut."
            if record["phase"] == "catalog":
                detail = f"Der Dienst war beim letzten Check erreichbar. Die Registrierung der Kachel konnte nicht bestätigt werden: {detail}"
            checkpoint(record["phase"], status="failed", error=str(detail))
        finally:
            with lock:
                # A terminal checkpoint releases the ID before a retry can be queued.
                if not released:
                    active.discard(project_id)

    def queue(store, record):
        project_id = record["id"]
        record.update(status="queued", error=None)
        store.save(record)
        active.add(project_id)
        executor.submit(deploy, store, dict(record))
        return record

    def project_folder(store, record):
        folder = store.folder(record)
        validate_path(folder)
        if not owns_project(folder, record["id"], record["revision"]):
            raise HTTPException(409, "Der erzeugte Projektordner fehlt oder gehört zu einem anderen Projekt.")
        return folder

    def queue_release(store, record, digest):
        release = "r" + uuid4().hex
        record.update(pending_release=release, image=f"dkforge/project-{record['id']}:{release}",
                      image_built=False, attempted_digest=digest)
        return queue(store, record)

    def watch_sources(stopped):
        seen = {}
        while not stopped.wait(2):
            store = Store(forge_root())
            for path in store.state.glob("*.json"):
                if stopped.is_set():
                    return
                if not ID.fullmatch(path.stem):
                    continue
                try:
                    with lock:
                        record = store.read(path.stem)
                        if (not record.get("watch") or not record.get("published_image")
                                or record["id"] in active):
                            seen.pop(path, None)
                            continue
                        folder = project_folder(store, record)
                    digest = source_digest(folder)
                    stable = seen.get(path) == digest
                    seen[path] = digest
                    if stable:
                        with lock:
                            latest = store.read(path.stem)
                            if (latest.get("watch") and latest["id"] not in active
                                    and latest.get("attempted_digest") != digest):
                                queue_release(store, latest, digest)
                except (OSError, HTTPException):
                    seen.pop(path, None)

    @router.post("/projects", status_code=201)
    def propose_project(idea: Idea):
        plan, source, notice = propose(idea)
        project_id = uuid4().hex
        record = {"id": project_id, "revision": 1, "plan": plan.model_dump(), "source": source, "notice": notice,
                  "status": "draft", "phase": "plan", "generated": False, "path": None,
                  "image": f"dkforge/project-{project_id}:v1", "image_built": False,
                  "expected_service_id": f"dkhub-{project_id}", "service_id": None,
                  "url": None, "tile_id": None, "log": None, "error": None}
        Store(forge_root()).save(record)
        return record

    @router.post("/projects/list")
    def list_projects():
        store = Store(forge_root())
        with lock:
            return [{"id": record["id"], "name": record["plan"]["name"], "status": record["status"]}
                    for path in sorted(store.state.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True)
                    if ID.fullmatch(path.stem) for record in [view(store.read(path.stem))]]

    @router.post("/projects/{project_id}/status")
    def project_status(project_id: str):
        with lock:
            return view(Store(forge_root()).read(project_id))

    @router.put("/projects/{project_id}/plan")
    def update_plan(project_id: str, payload: UpdatePlan):
        with lock:
            store = Store(forge_root())
            record = store.read(project_id)
            check_revision(record, payload.revision)
            if record["generated"]:
                raise HTTPException(409, "Das Projekt wurde bereits erzeugt. Bearbeite es im lokalen Projektordner.")
            plan = payload.plan.model_dump()
            if not (plan["sqlite"] or plan["postgres"]):
                plan["data_model"] = []
            if plan != record["plan"]:
                if plan["name"] != record["plan"]["name"]:
                    record["path"] = None
                record.update(plan=plan, revision=record["revision"] + 1, status="draft", phase="plan", error=None)
                store.save(record)
            return record

    @router.post("/projects/{project_id}/generate")
    def generate_project(project_id: str, payload: Revision):
        with lock:
            store = Store(forge_root())
            record = store.read(project_id)
            check_revision(record, payload.revision)
            if record["generated"]:
                return view(record)
            folder = store.folder(record)
            record.update(status="draft", phase="generate", error=None)
            try:
                validate_path(folder)
                generate(folder, project_id, record["revision"], record["plan"])
            except (OSError, HTTPException) as exc:
                detail = exc.detail if isinstance(exc, HTTPException) else (
                    f"Projektordner konnte nicht vollständig erzeugt werden: {folder}. Prüfe vorhandene Dateien und wähle bei Bedarf einen anderen Namen.")
                record.update(status="failed", error=detail)
                store.save(record)
                raise HTTPException(exc.status_code if isinstance(exc, HTTPException) else 502, detail) from exc
            record.update(status="generated", generated=True, path=str(folder))
            store.save(record)
            return record

    @router.post("/projects/{project_id}/build", status_code=202)
    def start_build(project_id: str, payload: Revision):
        with lock:
            store = Store(forge_root())
            record = store.read(project_id)
            check_revision(record, payload.revision)
            if not record["generated"]:
                raise HTTPException(409, "Erzeuge zuerst den bestätigten Projektplan.")
            if project_id in active:
                return record
            if record["status"] == "ready":
                return record
            project_folder(store, record)
            return queue(store, record)

    @router.post("/projects/{project_id}/redeploy", status_code=202)
    def redeploy(project_id: str, payload: Revision):
        with lock:
            store = Store(forge_root())
            record = store.read(project_id)
            check_revision(record, payload.revision)
            if project_id in active:
                return record
            if not record.get("published_image") and record["status"] != "ready":
                raise HTTPException(409, "Veröffentliche zuerst die erste Version.")
            record.setdefault("published_image", record["image"])
            return queue_release(store, record, source_digest(project_folder(store, record)))

    @router.put("/projects/{project_id}/watch")
    def watch(project_id: str, payload: WatchSetting):
        with lock:
            store = Store(forge_root())
            record = store.read(project_id)
            if payload.enabled:
                if record["status"] != "ready" and not record.get("published_image"):
                    raise HTTPException(409, "Veröffentliche zuerst die erste Version.")
                record.setdefault("published_image", record["image"])
                record["attempted_digest"] = source_digest(project_folder(store, record))
            record["watch"] = payload.enabled
            store.save(record)
            return record

    @router.post("/projects/{project_id}/postgres/backup")
    def backup_postgres(project_id: str):
        with lock:
            record = Store(forge_root()).read(project_id)
            if not record["plan"].get("postgres") or not record.get("service_id"):
                raise HTTPException(409, "Dieses Projekt hat keine bestätigte PostgreSQL-Datenbank.")
        return director_request(f"/forge/{project_id}/postgres/backup", "POST")

    return router
