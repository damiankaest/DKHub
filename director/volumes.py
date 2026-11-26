"""Named local Docker volumes for DKDirector services."""

from dataclasses import dataclass
import json
import re
import subprocess
from uuid import uuid4


class BackupError(Exception):
    """An operation could not be completed safely."""


SERVICE = re.compile(r"dkhub-[a-f0-9]{32}")
KEY = re.compile(r"[a-z0-9][a-z0-9-]{0,31}")
TARGET = re.compile(r"/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*")
MANAGED = "io.dkhub.volume"
OWNER = "io.dkhub.service"
SLOT = "io.dkhub.volume-key"
DEST = "io.dkhub.mount"
CLAIM = "io.dkhub.create-id"


def validate_service(service):
    if not isinstance(service, str) or not SERVICE.fullmatch(service):
        raise BackupError("Expected a DKDirector service ID")


@dataclass(frozen=True)
class Volume:
    service: str
    key: str
    target: str
    generation: str = ""

    def __post_init__(self):
        validate_service(self.service)
        if not isinstance(self.key, str) or not KEY.fullmatch(self.key):
            raise BackupError("Invalid volume key")
        if (not isinstance(self.target, str) or not TARGET.fullmatch(self.target)
                or {".", ".."}.intersection(self.target.split("/"))):
            raise BackupError("Expected a normalized absolute Linux mount path")
        if not isinstance(self.generation, str) or (self.generation and not re.fullmatch(
                r"[a-f0-9]{32}", self.generation)):
            raise BackupError("Invalid restore generation")

    @property
    def name(self):
        suffix = f".restore-{self.generation}" if self.generation else ""
        return f"{self.service}.{self.key}{suffix}"

    @property
    def labels(self):
        return {MANAGED: "1", OWNER: self.service, SLOT: self.key, DEST: self.target}

    def mount(self, target=None, readonly=False):
        options = f"type=volume,src={self.name},dst={target or self.target},volume-nocopy"
        return options + (",readonly" if readonly else "")


def validate_mounts(volumes):
    if len({v.key for v in volumes}) != len(volumes):
        raise BackupError("Volume keys must be unique within a service")
    paths = {v.target for v in volumes}
    if len(paths) != len(volumes) or any(
            path.startswith(parent + "/") for path in paths for parent in paths):
        raise BackupError("Volume mount paths must be unique and may not overlap")


class DockerVolumes:
    def __init__(self, helper_image="alpine:3.22"):
        self.helper_image = helper_image

    def run(self, *args, stdin=None, stdout=None, timeout=60, reject_warnings=False):
        try:
            result = subprocess.run(
                ["docker", *args], stdin=stdin or subprocess.DEVNULL,
                stdout=stdout or subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=timeout, check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise BackupError(f"Docker {args[0]} unavailable or timed out") from exc
        if result.returncode:
            detail = result.stderr.decode("utf-8", errors="replace").strip()
            raise BackupError(f"Docker {args[0]} failed (exit {result.returncode}): {detail}")
        if reject_warnings and result.stderr.strip():
            detail = result.stderr.decode("utf-8", errors="replace").strip()
            raise BackupError(f"Docker {args[0]} reported a possible incomplete transfer: {detail}")
        return result.stdout.decode("utf-8") if result.stdout is not None else ""

    def names(self, *filters):
        args = [arg for value in filters for arg in ("--filter", value)]
        return set(self.run("volume", "ls", "--format", "{{.Name}}", *args).splitlines())

    def inspect(self, name):
        try:
            item, = json.loads(self.run("volume", "inspect", "--", name))
            if (item["Name"] != name or item["Driver"] != "local"
                    or item["Scope"] != "local" or item.get("Options")):
                raise BackupError(f"Unsupported or unexpected local volume: {name}")
            return item.get("Labels") or {}
        except (TypeError, ValueError, KeyError) as exc:
            raise BackupError(f"Invalid Docker volume response for {name}") from exc

    def verify(self, volume):
        labels = self.inspect(volume.name)
        if any(labels.get(key) != value for key, value in volume.labels.items()):
            raise BackupError(f"Volume ownership or mount metadata differs: {volume.name}")
        return labels

    def create(self, volume, *, fresh=False):
        if volume.name in self.names():
            if fresh:
                raise BackupError(f"Restore volume already exists: {volume.name}")
            self.verify(volume)
            return
        claim = uuid4().hex
        labels = volume.labels | {CLAIM: claim}
        args = [arg for key, value in labels.items() for arg in ("--label", f"{key}={value}")]
        self.run("volume", "create", "--driver", "local", *args, "--", volume.name)
        # Docker create can return an existing volume after a concurrent create.
        if self.verify(volume).get(CLAIM) != claim:
            raise BackupError(f"Concurrent volume creation detected: {volume.name}")

    def provision(self, service, mounts):
        validate_service(service)
        volumes = [Volume(service, key, target) for key, target in mounts]
        validate_mounts(volumes)
        for volume in volumes:
            self.create(volume)
        return volumes

    def discover(self, service):
        validate_service(service)
        result = []
        for name in sorted(self.names(f"label={MANAGED}=1", f"label={OWNER}={service}")):
            labels = self.inspect(name)
            base = Volume(service, labels.get(SLOT), labels.get(DEST))
            prefix = base.name + ".restore-"
            generation = name.removeprefix(prefix) if name.startswith(prefix) else ""
            volume = Volume(service, base.key, base.target, generation)
            if volume.name != name or any(labels.get(k) != v for k, v in volume.labels.items()):
                raise BackupError(f"Inconsistent volume metadata: {name}")
            result.append(volume)
        return result

    def require_stopped(self, volume):
        if self.run("ps", "--filter", f"volume={volume.name}", "--format", "{{.Names}}").strip():
            raise BackupError(f"Stop all running containers using {volume.name} before backup")

    def helper(self, volume, *command, stdin=None, stdout=None, readonly=False):
        self.run(
            "run", "--rm", "--pull=never", "--network=none", "--read-only",
            "--security-opt=no-new-privileges", "--user=0:0",
            *(("-i",) if stdin is not None else ()),
            "--mount", volume.mount("/data", readonly),
            "--entrypoint", command[0], "--", self.helper_image, *command[1:],
            stdin=stdin, stdout=stdout, timeout=3600,
            reject_warnings=stdin is not None or stdout is not None,
        )

    def export(self, volume, output):
        self.verify(volume)
        self.require_stopped(volume)
        self.helper(volume, "tar", "-cpf", "-", "-C", "/data", ".",
                    stdout=output, readonly=True)

    def import_fresh(self, volume, source):
        self.create(volume, fresh=True)
        self.helper(
            volume, "sh", "-ec",
            'for entry in /data/.[!.]* /data/..?* /data/*; do '
            'if [ -e "$entry" ] || [ -L "$entry" ]; then '
            'echo "Restore volume is not empty" >&2; exit 1; fi; done; '
            'exec tar -xpf - -C /data',
            stdin=source,
        )
