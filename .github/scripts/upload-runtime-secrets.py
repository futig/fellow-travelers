"""Send GitHub Secrets over pinned SSH, without local plaintext files or CLI values."""

import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path


def main() -> int:
    release = os.environ["SECRETS_RELEASE"]
    target = os.environ["SSH_TARGET"]
    if not re.fullmatch(r"[0-9]+-[0-9]+", release) or not re.fullmatch(
        r"[a-z_][a-z0-9_-]*@[0-9.]+", target
    ):
        print("Invalid secrets release or SSH target", file=sys.stderr)
        return 1
    payload = {
        name: os.environ.get(name, "")
        for name in ("BOT_TOKEN", "POSTGRES_PASSWORD", "TELEGRAM_RELAY_SECRET")
    }
    installer = (
        Path(__file__).resolve().parents[2] / "deploy/install-secrets.py"
    ).read_text(encoding="utf-8")
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
        f"sudo -n python3 -c {shlex.quote(installer)} {shlex.quote(release)}",
    ]
    result = subprocess.run(
        command,
        input=json.dumps(payload).encode(),
        capture_output=True,
        timeout=120,
        check=False,
    )
    if result.returncode:
        print(
            "SSH secret upload failed; check the key, known_hosts and passwordless sudo",
            file=sys.stderr,
        )
        return 1
    print("Runtime secrets installed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
