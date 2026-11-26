"""Offline backup bundles for DKDirector volumes and DKHub host files."""

from dataclasses import asdict
from datetime import datetime, timezone
from hashlib import file_digest
import json
import os
from pathlib import Path
import re
import shutil
from tempfile import NamedTemporaryFile
from uuid import uuid4

from .volumes import BackupError, Volume, validate_mounts, validate_service


IMAGE = re.compile(r"[a-f0-9]{64}\.(?:png|jpg|webp)")
DIGEST = re.compile(r"[a-f0-9]{64}")
SENSITIVE = {"settings", "dotenv"}
MANIFEST = "manifest.json"


def linked(path):
    return path.is_symlink() or getattr(path, "is_junction", lambda: False)()


def config_paths(root):
    local = root / "backend" / ".local"
    return {
        "catalog": Path(os.environ.get("DKHUB_APPS_FILE", local / "apps.json")),
        "seed": root / "backend" / "apps.json",
        "images": Path(os.environ.get("DKHUB_IMAGE_DIR", local / "images")),
        "settings": Path(os.environ.get("DKHUB_SETTINGS_FILE", local / "settings.json")),
        "dotenv": root / ".env",
    }


def sha256(path):
    if linked(path) or not path.is_file():
        raise BackupError(f"Missing or unsupported backup file: {path}")
    with path.open("rb") as stream:
        return file_digest(stream, "sha256").hexdigest()


def config_sources(paths, include_secrets):
    for kind in ("catalog", "settings", "dotenv"):
        path = paths[kind]
        if kind == "catalog" and not path.exists() and not linked(path):
            path = paths.get("seed", path)
        if (kind not in SENSITIVE or include_secrets) and (path.exists() or linked(path)):
            yield kind, "", path
    images = paths["images"]
    if linked(images) or (images.exists() and not images.is_dir()):
        raise BackupError(f"Unsupported image directory: {images}")
    if images.exists():
        for path in sorted(images.iterdir()):
            if IMAGE.fullmatch(path.name):
                yield "image", path.name, path


def create_backup(bundle, *, docker=None, service=None, generation="", paths=None,
                  include_secrets=False):
    if service is None and paths is None:
        raise BackupError("Select service volumes, local configuration, or both")
    volumes = []
    if service is not None:
        validate_service(service)
        volumes = [v for v in docker.discover(service) if v.generation == generation]
        if not volumes:
            raise BackupError(f"No managed volumes found for {service} and selected generation")
        validate_mounts(volumes)
        for volume in volumes:
            docker.require_stopped(volume)
    files = list(config_sources(paths, include_secrets)) if paths is not None else []
    if not volumes and not files:
        raise BackupError("No selected local configuration files exist")

    bundle.mkdir(mode=0o700)
    entries = []
    try:
        for volume in volumes:
            artifact = bundle / f"{len(entries)}.data"
            with artifact.open("xb") as stream:
                docker.export(volume, stream)
            entries.append({"volume": asdict(volume), "sha256": sha256(artifact)})
        for volume in volumes:
            docker.require_stopped(volume)
        for kind, name, path in files:
            if linked(path) or not path.is_file():
                raise BackupError(f"Unsupported local configuration file: {path}")
            artifact = bundle / f"{len(entries)}.data"
            with path.open("rb") as source, artifact.open("xb") as dest:
                shutil.copyfileobj(source, dest)
            entries.append({"kind": kind, "name": name, "sha256": sha256(artifact)})
        with NamedTemporaryFile(mode="w", encoding="utf-8", dir=bundle, delete=False) as temp:
            staged_manifest = Path(temp.name)
            json.dump({"version": 1, "created_utc": datetime.now(timezone.utc).isoformat(),
                       "entries": entries}, temp, indent=2)
        staged_manifest.rename(bundle / MANIFEST)
    except (BackupError, OSError) as exc:
        raise BackupError(f"Backup incomplete at {bundle}: {exc}") from exc


def read_backup(bundle):
    manifest = bundle / MANIFEST
    if linked(manifest) or not manifest.is_file():
        raise BackupError(f"No completed backup manifest at {bundle}")
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if type(data["version"]) is not int or data["version"] != 1:
            raise BackupError("Unsupported backup version")
        entries = data["entries"]
        if not isinstance(entries, list) or not entries:
            raise BackupError("Backup has no entries")
        volumes = []
        files = set()
        for index, entry in enumerate(entries):
            if set(entry) == {"volume", "sha256"}:
                volumes.append(Volume(**entry["volume"]))
            elif set(entry) == {"kind", "name", "sha256"}:
                kind, name = entry["kind"], entry["name"]
                if kind == "image":
                    if not IMAGE.fullmatch(name):
                        raise BackupError("Invalid backup image filename")
                elif kind not in {"catalog", "settings", "dotenv"} or name != "":
                    raise BackupError("Unknown local configuration entry")
                if (kind, name) in files:
                    raise BackupError("Duplicate local configuration entry")
                files.add((kind, name))
            else:
                raise BackupError("Invalid backup entry")
            checksum = entry["sha256"]
            if not DIGEST.fullmatch(checksum) or sha256(bundle / f"{index}.data") != checksum:
                raise BackupError(f"Backup checksum mismatch for entry {index}")
        if len({(v.service, v.generation) for v in volumes}) > 1:
            raise BackupError("Expected one service and volume generation per backup")
        validate_mounts(volumes)
        return entries
    except (ValueError, TypeError, KeyError) as exc:
        raise BackupError(f"Invalid backup manifest at {manifest}") from exc


def check_file_target(path):
    if linked(path) or path.exists():
        raise BackupError(f"Restore file already exists: {path}")
    for parent in path.parents:
        if linked(parent) or (parent.exists() and not parent.is_dir()):
            raise BackupError(f"Unsupported restore parent directory: {parent}")


def restore_file(artifact, target):
    check_file_target(target)
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    check_file_target(target)
    with NamedTemporaryFile(dir=target.parent, delete=False) as stream:
        temp = Path(stream.name)
        try:
            with artifact.open("rb") as source:
                shutil.copyfileobj(source, stream)
            stream.close()
            # Publish a complete file with exclusive creation on POSIX and NTFS.
            os.link(temp, target)
        finally:
            stream.close()
            temp.unlink()


def restore_backup(bundle, *, paths, approve, docker=None, include_secrets=False):
    """Show a complete plan via approve(lines) before creating any restore target."""
    entries = read_backup(bundle)
    generation = uuid4().hex
    actions = []
    lines = [f"Backup: {bundle.absolute()}"]
    file_targets = set()
    for index, entry in enumerate(entries):
        artifact = bundle / f"{index}.data"
        if "volume" in entry:
            if docker is None:
                raise BackupError("Docker access required for volume restoration")
            original = Volume(**entry["volume"])
            target = Volume(original.service, original.key, original.target, generation)
            actions.append((artifact, target))
            lines.append(f"Volume {original.name} -> {target.name} (mount {target.target})")
            continue
        kind = entry["kind"]
        if kind in SENSITIVE and not include_secrets:
            lines.append(f"Skip {kind} (requires --include-secrets)")
            continue
        path = paths["images"] / entry["name"] if kind == "image" else paths[kind]
        path = Path(os.path.abspath(path))
        check_file_target(path)
        if path in file_targets or any(path in p.parents or p in path.parents for p in file_targets):
            raise BackupError(f"Overlapping restore file target: {path}")
        file_targets.add(path)
        actions.append((artifact, path))
        lines.append(f"File {kind} -> {path}" + (" (contains secrets)" if kind in SENSITIVE else ""))
    if not actions:
        raise BackupError("No restore targets selected")
    volumes = [target for _, target in actions if isinstance(target, Volume)]
    if volumes and docker.names().intersection(v.name for v in volumes):
        raise BackupError("A planned restore volume already exists")
    if not approve(tuple(lines)):
        raise BackupError("Restore cancelled before writing")
    if read_backup(bundle) != entries:
        raise BackupError("Backup changed after restore preview")
    for path in file_targets:
        check_file_target(path)
    completed = []
    for artifact, target in actions:
        name = target.name if isinstance(target, Volume) else str(target)
        try:
            if isinstance(target, Volume):
                with artifact.open("rb") as stream:
                    docker.import_fresh(target, stream)
            else:
                restore_file(artifact, target)
            completed.append(name)
        except (BackupError, OSError) as exc:
            previous = ", ".join(completed) or "none"
            raise BackupError(
                f"Restore incomplete at {name}: {exc}. Completed targets: {previous}. "
                "Inspect the failed target for partial data before using it."
            ) from exc
    return completed
