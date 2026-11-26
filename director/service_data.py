"""Persistent deployment records and the service volume backup API."""

from contextlib import contextmanager
from dataclasses import asdict
import json
import os
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from threading import Lock
from time import monotonic
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .backups import MANIFEST, create_backup, execute_restore, linked, prepare_restore
from .volumes import BackupError, DockerVolumes, SERVICE, Volume, validate_mounts

ID = re.compile(r"[a-f0-9]{32}")
PLAN_SECONDS = 600
DATA_LOCK = Lock()


class MountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(max_length=32)
    target: str = Field(max_length=255)


class RestoreConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    confirmation: Literal["RESTORE"]


def data_dir():
    return Path(os.environ.get("DKDIRECTOR_DATA_DIR", Path(__file__).parent / ".local"))


def volume_engine():
    return DockerVolumes(os.environ.get("DKDIRECTOR_BACKUP_IMAGE", "alpine:3.22"))


def volume_view(volume):
    return {"key": volume.key, "target": volume.target, "name": volume.name}


def definition_path(service_id):
    return data_dir() / "services" / f"{service_id}.json"


def save_definition(service_id, name, image, port, ip, host_port, volumes):
    path = definition_path(service_id)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    record = {"version": 1, "id": service_id, "name": name, "image": image,
              "container_port": port, "host_ip": ip, "host_port": host_port,
              "restart_policy": "unless-stopped", "volumes": [asdict(volume) for volume in volumes]}
    write_definition(path, record)


def write_definition(path, record, *, replace=False):
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
        temp = Path(stream.name)
        try:
            json.dump(record, stream, ensure_ascii=False)
            stream.close()
            if replace:
                os.replace(temp, path)
            else:
                os.link(temp, path)
        finally:
            stream.close()
            temp.unlink(missing_ok=True)


def set_definition_image(service_id, image):
    definition = load_definition(service_id, required=False)
    if definition:
        record, _ = definition
        write_definition(definition_path(service_id), {**record, "image": image}, replace=True)


def load_definition(service_id, *, required=True):
    path = definition_path(service_id)
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
        volumes = [Volume(**item) for item in record["volumes"]]
        if (record["version"] != 1 or record["id"] != service_id or not volumes
                or any(volume.service != service_id or volume.generation for volume in volumes)):
            raise ValueError("Invalid recorded service")
        validate_mounts(volumes)
        return record, volumes
    except FileNotFoundError as exc:
        if not required:
            return None
        raise HTTPException(409, "This service has no recorded managed volumes") from exc
    except (BackupError, OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(502, "The stored service definition could not be read") from exc


def storage_issue(service, *, verify=False):
    """Detect changes to the stored mapping without creating or replacing Docker volumes."""
    try:
        definition = load_definition(service["id"], required=False)
    except HTTPException:
        return "Die gespeicherte Dienstdefinition ist nicht lesbar. Prüfe sie vor dem Start."
    if definition is None:
        return None  # Legacy services are still managed by Docker.
    _, volumes = definition
    engine = volume_engine()
    try:
        missing = {volume.name for volume in volumes} - engine.names()
        if missing:
            return "Docker-Volumes fehlen: " + ", ".join(sorted(missing)) + ". Prüfe die Daten vor dem Start."
        expected = sorted(map(volume_view, volumes), key=lambda item: item["key"])
        if service.get("volumes", []) != expected:
            return "Die Mounts des Containers weichen von der gespeicherten Dienstdefinition ab."
        if verify:
            for volume in volumes:
                engine.verify(volume)
    except BackupError as exc:
        return f"Die gespeicherten Docker-Volumes konnten nicht bestätigt werden: {exc}"
    return None


@contextmanager
def service_data_operation():
    # Serialize Director state changes with volume operations, across service IDs too.
    if not DATA_LOCK.acquire(blocking=False):
        raise HTTPException(409, "A Director data or service operation is already running")
    try:
        yield
    finally:
        DATA_LOCK.release()


def backup_dir(service_id):
    if not SERVICE.fullmatch(service_id):
        raise HTTPException(404, "Service not found")
    root = data_dir() / "backups"
    folder = root / service_id
    if linked(root) or linked(folder):
        raise HTTPException(409, "Linked backup directories are unsupported")
    return folder


def find_bundle(service_id, backup_id):
    folder = backup_dir(service_id)
    if not ID.fullmatch(backup_id):
        raise HTTPException(404, "Backup not found")
    bundle = folder / backup_id
    manifest = bundle / MANIFEST
    if linked(bundle) or linked(manifest) or not manifest.is_file():
        raise HTTPException(404, "Completed backup not found")
    return bundle


def summary(bundle):
    manifest = json.loads((bundle / MANIFEST).read_text(encoding="utf-8"))
    if manifest["version"] != 1 or not isinstance(manifest["created_utc"], str):
        raise ValueError("Invalid backup metadata")
    volumes = [Volume(**entry["volume"]) for entry in manifest["entries"]]
    if not volumes or any(v.service != bundle.parent.name for v in volumes):
        raise ValueError("Backup belongs to another service")
    validate_mounts(volumes)
    return {"id": bundle.name, "service_id": bundle.parent.name,
            "created_utc": manifest["created_utc"], "volumes": [volume_view(v) for v in volumes]}


def backup_router(check_token, inspect_service):
    def authenticate(x_director_token: str = Header(default="")):
        check_token(x_director_token)

    router = APIRouter(prefix="/services/{service_id}/backups",
                       dependencies=[Depends(authenticate)])
    pending = {}

    @router.get("")
    def list_backups(service_id: str):
        folder = backup_dir(service_id)
        backups = []
        try:
            for item in folder.iterdir():
                if not ID.fullmatch(item.name):
                    continue
                manifest = item / MANIFEST
                if linked(item) or linked(manifest) or not manifest.is_file():
                    continue
                try:
                    backups.append(summary(item))
                except (BackupError, OSError, ValueError, TypeError, KeyError) as exc:
                    raise HTTPException(502, f"Unreadable metadata for backup {item.name}") from exc
        except FileNotFoundError:
            return []
        except OSError as exc:
            raise HTTPException(502, f"Could not list backups: {exc}") from exc
        return sorted(backups, key=lambda item: item["created_utc"], reverse=True)

    @router.post("", status_code=201)
    def create_service_backup(service_id: str):
        folder = backup_dir(service_id)
        with service_data_operation():
            service = inspect_service(service_id)
            if service["state"] not in {"exited", "created", "dead"}:
                raise HTTPException(409, "Stop the service before creating a volume backup")
            record, volumes = load_definition(service_id)
            if sorted(service.get("volumes", []), key=lambda item: item["key"]) != sorted(
                    (volume_view(v) for v in volumes), key=lambda item: item["key"]):
                raise HTTPException(409, "Container mounts differ from the stored service definition")
            try:
                folder.mkdir(mode=0o700, parents=True, exist_ok=True)
                bundle = folder / uuid4().hex
                create_backup(bundle, docker=volume_engine(), service=service_id,
                              expected_volumes=volumes, service_definition=record)
                return summary(bundle)
            except (BackupError, OSError) as exc:
                raise HTTPException(502, str(exc)) from exc

    @router.post("/{backup_id}/restore/preview")
    def preview_service_restore(service_id: str, backup_id: str):
        bundle = find_bundle(service_id, backup_id)
        with service_data_operation():
            try:
                plan = prepare_restore(bundle, paths={}, docker=volume_engine(),
                                       volume_service=service_id)
            except (BackupError, OSError) as exc:
                raise HTTPException(422, str(exc)) from exc
            now = monotonic()
            for key, (_, expires, _) in list(pending.items()):
                if expires <= now:
                    del pending[key]
            if len(pending) >= 32:
                raise HTTPException(409, "Too many pending restore previews; wait for one to expire")
            plan_id = uuid4().hex
            pending[plan_id] = (bundle, now + PLAN_SECONDS, plan)
            return {
                "plan_id": plan_id, "expires_in": PLAN_SECONDS, "confirmation": "RESTORE",
                "targets": [
                    {**volume_view(target), "source": Volume(**entry["volume"]).name}
                    for entry, (_, target) in zip(plan.entries, plan.actions)
                ],
            }

    @router.post("/{backup_id}/restore")
    def confirm_service_restore(service_id: str, backup_id: str, payload: RestoreConfirmation):
        bundle = find_bundle(service_id, backup_id)
        with service_data_operation():
            entry = pending.get(payload.plan_id)
            if entry is None or entry[0] != bundle or entry[1] <= monotonic():
                raise HTTPException(409, "Restore preview expired or does not match this backup")
            del pending[payload.plan_id]
            try:
                execute_restore(entry[2], approve=lambda _: payload.confirmation == "RESTORE",
                                docker=volume_engine())
            except (BackupError, OSError) as exc:
                raise HTTPException(502, str(exc)) from exc
            targets = [target for _, target in entry[2].actions]
            return {"service_id": service_id, "backup_id": backup_id,
                    "generation": targets[0].generation,
                    "volumes": [volume_view(target) for target in targets]}

    return router
