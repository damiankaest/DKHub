"""A private PostgreSQL instance and isolated databases for DKForge."""

from contextlib import contextmanager
import os
from pathlib import Path
import re
import secrets
from tempfile import NamedTemporaryFile, TemporaryFile
from time import monotonic, sleep
from uuid import uuid4

from fastapi import HTTPException

from .service_data import data_dir, volume_engine
from .volumes import BackupError

LABEL = "io.dkhub.forge-postgres=managed"


@contextmanager
def env_file(values, root):
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = None
    try:
        with NamedTemporaryFile(mode="w", encoding="ascii", dir=root, delete=False) as stream:
            path = Path(stream.name)
            for key, value in values.items():
                stream.write(f"{key}={value}\n")
        yield path
    finally:
        if path:
            path.unlink(missing_ok=True)


class Postgres:
    def __init__(self):
        self.name = os.environ.get("DKFORGE_POSTGRES_INSTANCE", "dkforge-postgres")
        if not re.fullmatch(r"[a-z][a-z0-9-]{2,30}", self.name):
            raise HTTPException(503, "DKFORGE_POSTGRES_INSTANCE ist ungültig.")
        self.network = self.name + "-net"
        self.volume = self.name + "-data"
        self.root = data_dir() / "forge-postgres" / self.name
        self.engine = volume_engine()

    def owned(self, kind, name):
        template = '{{index .Labels "io.dkhub.forge-postgres"}}'
        if kind == "container":
            template = '{{index .Config.Labels "io.dkhub.forge-postgres"}}'
        return self.engine.run(kind, "inspect", "--format", template, "--", name).strip() == "managed"

    def sql(self, statement):
        with TemporaryFile() as source:
            source.write(statement.encode("ascii"))
            source.seek(0)
            return self.engine.run("exec", "-i", "--user", "postgres", self.name, "psql",
                                   "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
                                   "-d", "postgres", stdin=source).strip()

    def ensure_cluster(self):
        engine = self.engine
        networks = engine.run("network", "ls", "--format", "{{.Name}}").splitlines()
        containers = engine.run("ps", "-a", "--filter", f"name=^/{self.name}$",
                                "--format", "{{.Names}}").splitlines()
        existing = self.name in containers
        if existing and not self.owned("container", self.name):
            raise HTTPException(409, "Der PostgreSQL-Containername ist bereits belegt.")
        if self.network in networks:
            if not self.owned("network", self.network):
                raise HTTPException(409, "Das PostgreSQL-Netzwerk ist bereits belegt.")
        elif existing:
            raise HTTPException(409, "Das erwartete PostgreSQL-Netzwerk fehlt.")
        else:
            engine.run("network", "create", "--label", LABEL, "--", self.network)
        if self.volume in engine.names():
            if not self.owned("volume", self.volume):
                raise HTTPException(409, "Das PostgreSQL-Datenvolume ist bereits belegt.")
        elif existing:
            raise HTTPException(409, "Das erwartete PostgreSQL-Datenvolume fehlt.")
        else:
            engine.run("volume", "create", "--label", LABEL, "--", self.volume)
        if not existing:
            with env_file({"POSTGRES_PASSWORD": secrets.token_hex(32)}, self.root) as config:
                engine.run("run", "-d", "--pull", "never", "--name", self.name, "--label", LABEL,
                           "--restart", "unless-stopped", "--network", self.network,
                           "--mount", f"type=volume,src={self.volume},dst=/var/lib/postgresql/data",
                           "--env-file", str(config), "--", "postgres:16-alpine")
        else:
            engine.run("start", "--", self.name)
        deadline = monotonic() + 30
        while True:
            try:
                # The temporary initializer listens only on its socket. Wait for TCP too.
                engine.run("exec", self.name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", timeout=5)
                self.sql("SELECT 1;")
                return
            except BackupError:
                if monotonic() >= deadline:
                    raise
                sleep(.5)

    @contextmanager
    def project_args(self, project_id):
        role = "forge_" + project_id
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        secret = self.root / (project_id + ".secret")
        try:
            fd = os.open(secret, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "w", encoding="ascii") as stream:
                stream.write(secrets.token_hex(32))
        password = secret.read_text(encoding="ascii")
        if not re.fullmatch(r"[a-f0-9]{64}", password):
            raise HTTPException(409, "Die lokalen PostgreSQL-Zugangsdaten sind beschädigt.")
        try:
            self.ensure_cluster()
            self.sql(rf"""REVOKE CONNECT, TEMPORARY ON DATABASE postgres, template1 FROM PUBLIC;
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', '{role}', '{password}')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{role}')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I ALLOW_CONNECTIONS false', '{role}', '{role}')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '{role}')
\gexec
""")
            owner = self.sql(f"SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '{role}';")
            if owner != role:
                raise HTTPException(409, "Die PostgreSQL-Datenbank gehört einer anderen Rolle.")
            self.sql(f"REVOKE CONNECT, TEMPORARY ON DATABASE {role} FROM PUBLIC; "
                     f"ALTER DATABASE {role} ALLOW_CONNECTIONS true;")
        except BackupError as exc:
            raise HTTPException(502, "Gemeinsames PostgreSQL konnte nicht eingerichtet werden. Prüfe PostgreSQL in Docker und das lokale Image postgres:16-alpine.") from exc
        with env_file({"PGHOST": self.name, "PGPORT": "5432", "PGDATABASE": role,
                       "PGUSER": role, "PGPASSWORD": password}, self.root) as config:
            yield ("--network", self.network, "--env-file", str(config),
                   "--label", "io.dkhub.forge-database=postgres")

    def backup(self, project_id):
        folder = self.root / "backups" / project_id
        folder.mkdir(mode=0o700, parents=True, exist_ok=True)
        path = folder / f"{uuid4().hex}.dump"
        staged = None
        try:
            if not self.owned("container", self.name):
                raise HTTPException(409, "Der gemeinsame PostgreSQL-Container gehört nicht DKForge.")
            with NamedTemporaryFile(dir=folder, delete=False) as stream:
                staged = Path(stream.name)
                self.engine.run("exec", "--user", "postgres", self.name, "pg_dump", "-U", "postgres",
                                "-Fc", "-d", f"forge_{project_id}", stdout=stream, timeout=600)
            staged.rename(path)
            return {"path": str(path)}
        except (OSError, BackupError) as exc:
            raise HTTPException(502, "PostgreSQL-Sicherung fehlgeschlagen. Prüfe, ob die Datenbank läuft.") from exc
        finally:
            if staged:
                staged.unlink(missing_ok=True)
