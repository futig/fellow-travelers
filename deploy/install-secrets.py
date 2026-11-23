"""Install a release's runtime secrets on the VM; JSON arrives only on stdin."""

import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

SECRETS_ROOT = Path("/var/lib/fellow-travelers/secrets")


def secret_files(payload: dict[str, str]) -> dict[str, tuple[str, int, int]]:
    """Return relative path -> (contents, owner UID, file mode)."""
    for name in ("BOT_TOKEN", "POSTGRES_PASSWORD", "TELEGRAM_RELAY_SECRET"):
        value = payload[name]
        if (
            not isinstance(value, str)
            or value != value.strip()
            or any(char in value for char in "\r\n\0")
        ):
            raise ValueError(f"Invalid {name}")
    password = payload["POSTGRES_PASSWORD"]
    if not re.fullmatch(r"[A-Za-z0-9]+", password) or not payload["BOT_TOKEN"]:
        raise ValueError(
            "BOT_TOKEN is required; POSTGRES_PASSWORD must be alphanumeric"
        )
    database_url = f"postgresql+asyncpg://fellow:{password}@db:5432/fellow_travelers"
    files = {
        "api/database_url": (database_url, 1000, 0o400),
        "api/bot_token": (payload["BOT_TOKEN"], 1000, 0o400),
        "bot/database_url": (database_url, 1000, 0o400),
        "bot/bot_token": (payload["BOT_TOKEN"], 1000, 0o400),
        "bot/telegram_relay_secret": (payload["TELEGRAM_RELAY_SECRET"], 1000, 0o400),
        "db/password": (password, 0, 0o400),
        "backup/pgpass": (f"db:5432:fellow_travelers:fellow:{password}\n", 0, 0o600),
    }
    return files


def install(release: str, payload: dict[str, str]) -> None:
    if not re.fullmatch(r"[0-9]+-[0-9]+", release):
        raise ValueError("Invalid release ID")
    files = secret_files(payload)
    os.umask(0o077)
    SECRETS_ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    SECRETS_ROOT.chmod(0o700)
    destination = SECRETS_ROOT / release
    if destination.exists():
        raise ValueError(
            "Secrets release already exists; rerun the workflow with a new attempt"
        )
    staging = Path(tempfile.mkdtemp(prefix=".upload-", dir=SECRETS_ROOT))
    try:
        for relative, (content, uid, mode) in files.items():
            path = staging / relative
            path.parent.mkdir(exist_ok=True, mode=0o700)
            path.write_text(content, encoding="utf-8")
            path.chmod(mode)
            os.chown(path, uid, uid)
        for service, uid in (("api", 1000), ("bot", 1000), ("db", 0), ("backup", 0)):
            directory = staging / service
            os.chown(directory, uid, uid)
            directory.chmod(0o500)
        staging.rename(destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


if __name__ == "__main__":
    try:
        install(sys.argv[1], json.load(sys.stdin))
    except (OSError, ValueError, KeyError, TypeError, IndexError):
        # Do not include exceptions or input data: they may contain secret values.
        print("Runtime secret installation failed", file=sys.stderr)
        sys.exit(1)
