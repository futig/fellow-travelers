"""Create a private SSH inventory for a GitHub-hosted Ansible run."""

import ipaddress
import json
import os
import re
import shlex
import sys
from pathlib import Path


def prepare(directory: Path, environment: dict[str, str]) -> Path:
    address = str(ipaddress.IPv4Address(environment["IP_FOR_ANSIBLE"]))
    username = environment.get("SSH_USER", "ubuntu")
    if not re.fullmatch(r"[a-z_][a-z0-9_-]*", username):
        raise ValueError("Invalid SSH username")
    key = environment["YC_VM_SSH_KEY"]
    known_hosts = environment["YC_VM_SSH_KNOWN_HOSTS"]
    if not key.strip() or not known_hosts.strip():
        raise ValueError("Missing SSH credentials")
    # Refuse to reuse a directory, including a symlink, from an earlier run.
    directory.mkdir(mode=0o700)
    key_path = directory / "key"
    hosts_path = directory / "known_hosts"
    for path, value in ((key_path, key), (hosts_path, known_hosts)):
        path.write_text(value.rstrip("\n") + "\n", encoding="utf-8")
        path.chmod(0o600)
    options = [
        "-o",
        "BatchMode=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        f"UserKnownHostsFile={hosts_path}",
        "-o",
        "ConnectTimeout=15",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=3",
    ]
    inventory = {
        "all": {
            "children": {
                "fellow": {
                    "hosts": {
                        "ansible_target": {
                            "ansible_host": address,
                            "ansible_user": username,
                            "ansible_ssh_private_key_file": str(key_path),
                            "ansible_ssh_common_args": shlex.join(options),
                        }
                    }
                }
            }
        },
    }
    inventory_path = directory / "inventory.json"
    inventory_path.write_text(json.dumps(inventory), encoding="utf-8")
    inventory_path.chmod(0o600)
    return inventory_path


def main() -> int:
    try:
        inventory = prepare(
            Path(os.environ["RUNNER_TEMP"]) / "fellow-ansible-ssh", dict(os.environ)
        )
        with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
            output.write(f"inventory_path={inventory}\n")
    except (KeyError, ValueError, OSError):
        # Never include exception text, environment values or private key material.
        print("Failed to prepare Ansible SSH inventory", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
