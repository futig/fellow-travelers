"""Run the versioned deployment controller over pinned SSH; payload stays on stdin."""

import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

CONFIG_KEYS = (
    "API_IMAGE",
    "WEB_IMAGE",
    "CADDY_IMAGE",
    "SECRETS_RELEASE",
    "BOT_USERNAME",
    "TELEGRAM_RELAY_URL",
    "INIT_DATA_MAX_AGE_SECONDS",
    "DEBUG",
    "LOG_LEVEL",
    "WORKER_METRICS_PORT",
    "SITE_ADDRESS",
    "ACME_EMAIL",
    "ACME_CA",
)


def main() -> int:
    target = os.environ["SSH_TARGET"]
    if not re.fullmatch(r"[a-z_][a-z0-9_-]*@[0-9.]+", target):
        print("Invalid SSH target", file=sys.stderr)
        return 1
    deploy = Path(__file__).resolve().parents[2] / "deploy"
    payload = {
        "action": os.environ.get("SWARM_ACTION", "deploy"),
        "update_infra": os.environ.get("UPDATE_INFRA", "false").lower() == "true",
        "config": {key: os.environ[key] for key in CONFIG_KEYS if key in os.environ},
        "registry_token": os.environ.get("IAM_TOKEN", ""),
        "files": {
            name: (deploy / name).read_text(encoding="utf-8")
            for name in (
                "docker-compose.prod.yml",
                "docker-compose.infra.yml",
                "install-secrets.py",
                "swarm.py",
            )
        },
    }
    controller = (deploy / "swarm.py").read_text(encoding="utf-8")
    command = [
        "ssh",
        "-T",
        "-i",
        os.environ["SSH_KEY_FILE"],
        "-o",
        "BatchMode=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        f"UserKnownHostsFile={os.environ['SSH_KNOWN_HOSTS_FILE']}",
        "-o",
        "ConnectTimeout=15",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=3",
        target,
        "sudo -n python3 -c " + shlex.quote(controller),
    ]
    # The controller emits only safe stage names; SSH output streams back immediately.
    result = subprocess.run(
        command, input=json.dumps(payload).encode(), timeout=2400, check=False
    )
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
