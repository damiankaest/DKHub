"""Run with python -m director.backup_cli from the DKHub project root."""

import argparse
from pathlib import Path
import sys

from .backups import config_paths, create_backup, restore_backup
from .volumes import BackupError, DockerVolumes


def confirm(lines):
    print("\n".join(lines), flush=True)
    try:
        return input("Type RESTORE to create these targets: ") == "RESTORE"
    except EOFError:
        return False


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--helper-image", default="alpine:3.22",
                        help="Trusted local Linux image with sh and tar")
    commands = parser.add_subparsers(dest="command", required=True)
    provision = commands.add_parser("provision", help="Create named volumes and show mount mappings")
    provision.add_argument("service")
    provision.add_argument("mounts", nargs="+", metavar="KEY=/PATH")
    backup = commands.add_parser("create", help="Create a new offline backup directory")
    backup.add_argument("bundle", type=Path)
    backup.add_argument("--service")
    backup.add_argument("--generation", default="", help="Select a previously restored set")
    backup.add_argument("--config", action="store_true")
    restore = commands.add_parser("restore", help="Preview and confirm restoration to new targets")
    restore.add_argument("bundle", type=Path)
    for command in (backup, restore):
        command.add_argument("--include-secrets", action="store_true")
    options = parser.parse_args(argv)
    docker = DockerVolumes(options.helper_image)
    paths = config_paths(options.root)
    try:
        if options.command == "provision":
            mounts = [item.split("=", 1) for item in options.mounts]
            if any(len(mount) != 2 for mount in mounts):
                raise BackupError("Specify each mount as KEY=/PATH")
            for volume in docker.provision(options.service, mounts):
                print(volume.mount())
        elif options.command == "create":
            if options.generation and not options.service:
                raise BackupError("--generation requires --service")
            if options.include_secrets and not options.config:
                raise BackupError("--include-secrets requires --config for backup creation")
            create_backup(options.bundle, docker=docker, service=options.service,
                          generation=options.generation, paths=paths if options.config else None,
                          include_secrets=options.include_secrets)
            print(f"Backup complete: {options.bundle}")
        else:
            restored = restore_backup(options.bundle, paths=paths, approve=confirm, docker=docker,
                                      include_secrets=options.include_secrets)
            print(f"Restore complete ({len(restored)} targets).")
    except (BackupError, OSError, KeyboardInterrupt) as exc:
        print(f"Operation failed: {exc or 'interrupted'}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
