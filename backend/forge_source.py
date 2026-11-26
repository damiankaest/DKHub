"""Fingerprint local build sources while ignoring dependencies and runtime data."""

from hashlib import sha256
import os

from forge_project import validate_path

EXCLUDED = {".git", ".local", ".venv", "node_modules", "dist", "__pycache__"}


def is_local(path):
    try:
        return not path.is_symlink() and path.resolve() == path
    except (OSError, RuntimeError):
        return False


def source_digest(folder):
    validate_path(folder)
    digest = sha256()
    files = [folder / name for name in ("Dockerfile", ".dockerignore", "plan.json")]
    for name in ("frontend", "backend", "ui"):
        root = folder / name
        if not root.is_dir() or not is_local(root):
            continue
        for directory, dirs, names in os.walk(root):
            parent = root.joinpath(os.path.relpath(directory, root)).resolve()
            dirs[:] = sorted(item for item in dirs if item not in EXCLUDED
                             and not item.startswith(".") and is_local(parent / item))
            files.extend(parent / item for item in sorted(names)
                         if not item.startswith(".") and not item.endswith((".pyc", ".sqlite3", ".db")))
    for path in sorted(files):
        if not is_local(path) or not path.is_file():
            continue
        digest.update(path.relative_to(folder).as_posix().encode())
        digest.update(b"\0")
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(65536), b""):
                digest.update(chunk)
        digest.update(b"\0")
    return digest.hexdigest()
