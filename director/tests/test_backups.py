"""Run the isolated Docker round trip with DKHUB_TEST_DOCKER_IMAGE set."""

import contextlib
import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from uuid import uuid4

from director.backup_cli import main
from director.backups import config_paths, create_backup, restore_backup
from director.volumes import BackupError, DockerVolumes, Volume, validate_mounts


class MemoryVolumes:
    def __init__(self, source):
        self.data = {volume: volume.key.encode() for volume in source}
        self.active = set()
        self.fail_key = None

    def discover(self, service):
        return [volume for volume in self.data if volume.service == service]

    def names(self):
        return {volume.name for volume in self.data}

    def require_stopped(self, volume):
        if volume in self.active:
            raise BackupError("Stop running container")

    def export(self, volume, output):
        output.write(self.data[volume])

    def import_fresh(self, volume, source):
        if volume.name in self.names():
            raise BackupError("Volume already exists")
        if volume.key == self.fail_key:
            raise BackupError("Simulated Docker failure")
        self.data[volume] = source.read()


class BackupTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.service = "dkhub-" + uuid4().hex
        self.volumes = [Volume(self.service, "db", "/data"), Volume(self.service, "logs", "/logs")]
        self.docker = MemoryVolumes(self.volumes)
        self.bundle = self.root / "backup"

    def paths(self, prefix):
        root = self.root / prefix
        return {kind: root / name for kind, name in
                (("catalog", "apps.json"), ("images", "images"),
                 ("settings", "settings.json"), ("dotenv", ".env"))}

    def test_two_volumes_and_configuration_round_trip(self):
        paths = self.paths("source")
        paths["images"].mkdir(parents=True)
        image = "a" * 64 + ".png"
        (paths["images"] / image).write_bytes(b"image")
        paths["catalog"].write_text("[]")
        paths["settings"].write_text('{"openai_key":"test-token"}')
        paths["dotenv"].write_text("PASSWORD=test")
        create_backup(self.bundle, docker=self.docker, service=self.service, paths=paths)
        dest = self.paths("dest")

        def check_preview(lines):
            plan = "\n".join(lines)
            self.assertIn(str(dest["catalog"]), plan)
            for volume in self.volumes:
                self.assertIn(volume.name + " -> " + volume.name + ".restore-", plan)
            self.assertFalse(dest["catalog"].exists())
            self.assertEqual(len(self.docker.data), 2)
            return True

        restored = restore_backup(self.bundle, docker=self.docker, paths=dest, approve=check_preview)
        self.assertEqual(len(restored), 4)
        self.assertEqual(dest["catalog"].read_text(), "[]")
        self.assertEqual((dest["images"] / image).read_bytes(), b"image")
        self.assertFalse(dest["settings"].exists())
        self.assertFalse(dest["dotenv"].exists())
        self.assertNotIn("test-token", (self.bundle / "manifest.json").read_text())
        self.assertNotIn("PASSWORD", (self.bundle / "manifest.json").read_text())
        self.assertEqual(len(list(self.bundle.glob("*.data"))), 4)
        for original in self.volumes:
            target, = [v for v in self.docker.data if v.key == original.key and v.generation]
            self.assertEqual(target.target, original.target)
            self.assertEqual(self.docker.data[target], self.docker.data[original])

    def test_secrets_require_opt_in_on_both_sides_and_existing_files_block_restore(self):
        paths = self.paths("source")
        paths["settings"].parent.mkdir()
        paths["settings"].write_bytes(b"private")
        create_backup(self.bundle, paths=paths, include_secrets=True)
        dest = self.paths("dest")
        args = dict(paths=dest, approve=lambda _: True)
        with self.assertRaisesRegex(BackupError, "No restore targets"):
            restore_backup(self.bundle, **args)
        restore_backup(self.bundle, **args, include_secrets=True)
        self.assertEqual(dest["settings"].read_bytes(), b"private")
        with self.assertRaisesRegex(BackupError, "already exists"):
            restore_backup(self.bundle, **args, include_secrets=True)

    def test_reject_cancel_tampering_and_running_container(self):
        self.docker.active.add(self.volumes[1])
        with self.assertRaisesRegex(BackupError, "Stop running"):
            create_backup(self.bundle, docker=self.docker, service=self.service)
        self.assertFalse(self.bundle.exists())
        self.docker.active.clear()
        create_backup(self.bundle, docker=self.docker, service=self.service)
        args = dict(docker=self.docker, paths=self.paths("dest"))
        with self.assertRaisesRegex(BackupError, "cancelled"):
            restore_backup(self.bundle, **args, approve=lambda _: False)
        (self.bundle / "0.data").write_bytes(b"tampered")
        with self.assertRaisesRegex(BackupError, "checksum mismatch"):
            restore_backup(self.bundle, **args, approve=lambda _: self.fail("invalid preview"))
        self.assertEqual(self.docker.names(), {v.name for v in self.volumes})

    def test_reports_partial_restore_and_keeps_originals(self):
        create_backup(self.bundle, docker=self.docker, service=self.service)
        self.docker.fail_key = "logs"
        with self.assertRaisesRegex(BackupError, "Restore incomplete.*Completed targets:.*db"):
            restore_backup(self.bundle, docker=self.docker, paths=self.paths("dest"),
                           approve=lambda _: True)
        self.assertEqual(len(self.docker.names()), 3)
        self.assertEqual([self.docker.data[v] for v in self.volumes], [b"db", b"logs"])

    def test_failed_export_leaves_no_completed_manifest(self):
        with patch.object(self.docker, "export", side_effect=BackupError("Export failed")):
            with self.assertRaisesRegex(BackupError, "Backup incomplete.*Export failed"):
                create_backup(self.bundle, docker=self.docker, service=self.service)
        self.assertTrue(self.bundle.is_dir())
        self.assertFalse((self.bundle / "manifest.json").exists())
        with self.assertRaises(FileExistsError):
            create_backup(self.bundle, docker=self.docker, service=self.service)

    def test_seed_catalog_restores_to_local_catalog(self):
        paths = self.paths("source")
        paths["seed"] = self.root / "seed.json"
        paths["seed"].write_bytes(b"[]")
        create_backup(self.bundle, paths=paths)
        dest = self.paths("dest")
        restore_backup(self.bundle, paths=dest, approve=lambda _: True)
        self.assertEqual(dest["catalog"].read_bytes(), b"[]")
        self.assertFalse(paths["catalog"].exists())

    def test_reject_overlapping_or_unsafe_container_paths(self):
        with self.assertRaisesRegex(BackupError, "may not overlap"):
            validate_mounts([self.volumes[0], Volume(self.service, "child", "/data/media")])
        with self.assertRaisesRegex(BackupError, "absolute Linux"):
            Volume(self.service, "db", "/data,ro")

    def test_cli_reports_failure_for_missing_manifest(self):
        with contextlib.redirect_stderr(io.StringIO()) as stderr:
            self.assertEqual(main(["restore", str(self.bundle)]), 1)
        self.assertIn("No completed backup manifest", stderr.getvalue())


@unittest.skipUnless(os.environ.get("DKHUB_TEST_DOCKER_IMAGE"), "real Docker test is opt-in")
class DockerBackupTests(unittest.TestCase):
    def test_real_round_trip(self):
        docker = DockerVolumes(os.environ["DKHUB_TEST_DOCKER_IMAGE"])
        service = "dkhub-" + uuid4().hex
        prefix = service + "."

        def cleanup():
            for volume in docker.discover(service):
                if volume.name.startswith(prefix):
                    docker.run("volume", "rm", "--", volume.name)

        self.addCleanup(cleanup)
        source = docker.provision(service, [("data", "/var/lib/test"), ("logs", "/logs")])
        self.assertEqual(docker.provision(service, [(v.key, v.target) for v in source]), source)
        for volume in source:
            docker.helper(volume, "sh", "-ec",
                          'printf "%s" "$1" > /data/.test; chmod 640 /data/.test; '
                          'chown 123:456 /data/.test; ln -s .test /data/link',
                          "sh", volume.key)
        with TemporaryDirectory() as temp:
            root = Path(temp)
            bundle = root / "bundle"
            create_backup(bundle, docker=docker, service=service)
            restore_backup(bundle, docker=docker, paths=config_paths(root), approve=lambda _: True)
            manifest = json.loads((bundle / "manifest.json").read_text())
            self.assertEqual({e["volume"]["target"] for e in manifest["entries"]},
                             {v.target for v in source})
            restored = [volume for volume in docker.discover(service) if volume.generation]
            self.assertEqual(len(restored), 2)
            for volume in [*source, *restored]:
                docker.helper(volume, "sh", "-ec",
                              'test "$(cat /data/link)" = "$1"; '
                              'test "$(stat -c %a:%u:%g /data/.test)" = "640:123:456"; '
                              'test "$(readlink /data/link)" = ".test"',
                              "sh", volume.key, readonly=True)
