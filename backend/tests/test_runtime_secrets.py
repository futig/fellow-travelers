"""Secret delivery: no values in metadata/argv, correct ownership, immutable releases."""

import importlib.util
import json
import os
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
PAYLOAD = {
    "BOT_TOKEN": "123:token",
    "POSTGRES_PASSWORD": "abc123",
    "TELEGRAM_RELAY_SECRET": "literal-${KEEP}-'\\\"$",
}


def load_script(path: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location("runtime_secrets", REPO / path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_installer_permissions_and_no_overwrite(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    installer = load_script("deploy/install-secrets.py")
    root = tmp_path / "secrets"
    monkeypatch.setattr(installer, "SECRETS_ROOT", root)
    chown = Mock()
    monkeypatch.setattr(installer.os, "chown", chown)
    previous_umask = os.umask(0o077)
    try:
        installer.install("123-1", PAYLOAD)
        with pytest.raises(ValueError, match="already exists"):
            installer.install("123-1", PAYLOAD)
    finally:
        os.umask(previous_umask)

    release = root / "123-1"
    assert root.stat().st_mode & 0o777 == 0o700
    assert release.stat().st_mode & 0o777 == 0o700
    for relative, (value, uid, mode) in installer.secret_files(PAYLOAD).items():
        path = release / relative
        assert path.read_text() == value
        assert path.stat().st_mode & 0o777 == mode
        # Ownership is set before the staging directory is renamed.
        assert any(
            call.args[0].name == path.name and call.args[1:] == (uid, uid)
            for call in chown.call_args_list
        )
    assert (release / "backup/pgpass").read_text() == ("db:5432:fellow_travelers:fellow:abc123\n")
    assert not (release / "api/telegram_relay_secret").exists()
    assert not list(root.glob(".upload-*"))
    # Restore writable directories for pytest's cleanup.
    for directory in release.iterdir():
        directory.chmod(0o700)


@pytest.mark.parametrize("release", ["../escape", "123", "123-1/extra", "$(id)"])
def test_installer_rejects_invalid_release(
    release: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    installer = load_script("deploy/install-secrets.py")
    root = tmp_path / "unused"
    monkeypatch.setattr(installer, "SECRETS_ROOT", root)
    with pytest.raises(ValueError, match="release ID"):
        installer.install(release, PAYLOAD)
    assert not root.exists()


@pytest.mark.parametrize("password", ["", "abc:123", "abc\n123"])
def test_installer_rejects_invalid_password(password: str) -> None:
    installer = load_script("deploy/install-secrets.py")
    with pytest.raises(ValueError, match="POSTGRES_PASSWORD"):
        installer.secret_files({**PAYLOAD, "POSTGRES_PASSWORD": password})


def test_upload_uses_stdin_and_pinned_ssh(monkeypatch: pytest.MonkeyPatch) -> None:
    uploader = load_script(".github/scripts/upload-runtime-secrets.py")
    for name, value in {
        **PAYLOAD,
        "SECRETS_RELEASE": "123-1",
        "SSH_TARGET": "yc-user@192.0.2.1",
        "SSH_KEY_FILE": "/tmp/key",
        "SSH_KNOWN_HOSTS_FILE": "/tmp/known_hosts",
    }.items():
        monkeypatch.setenv(name, value)
    run = Mock(return_value=SimpleNamespace(returncode=0))
    monkeypatch.setattr(uploader.subprocess, "run", run)
    assert uploader.main() == 0
    args, kwargs = run.call_args
    command = args[0]
    assert "StrictHostKeyChecking=yes" in command
    assert "UserKnownHostsFile=/tmp/known_hosts" in command
    assert "BatchMode=yes" in command
    assert "IdentitiesOnly=yes" in command
    assert json.loads(kwargs["input"]) == PAYLOAD
    assert all(value not in " ".join(command) for value in PAYLOAD.values())


def test_failed_upload_does_not_print_remote_output(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    uploader = load_script(".github/scripts/upload-runtime-secrets.py")
    for name, value in {
        **PAYLOAD,
        "SECRETS_RELEASE": "123-1",
        "SSH_TARGET": "yc-user@192.0.2.1",
        "SSH_KEY_FILE": "/tmp/key",
        "SSH_KNOWN_HOSTS_FILE": "/tmp/known_hosts",
    }.items():
        monkeypatch.setenv(name, value)
    run = Mock(
        return_value=SimpleNamespace(
            returncode=1, stdout=PAYLOAD["BOT_TOKEN"], stderr=PAYLOAD["POSTGRES_PASSWORD"]
        )
    )
    monkeypatch.setattr(uploader.subprocess, "run", run)
    assert uploader.main() == 1
    captured = capsys.readouterr()
    assert "SSH secret upload failed" in captured.err
    assert not any(value in captured.out + captured.err for value in PAYLOAD.values())


def test_production_spec_has_only_secret_paths() -> None:
    compose_text = (REPO / "deploy/docker-compose.prod.yml").read_text()
    compose = yaml.safe_load(compose_text)
    for variable in ("BOT_TOKEN", "POSTGRES_PASSWORD", "TELEGRAM_RELAY_SECRET"):
        assert "${" + variable + "}" not in compose_text
    for service in ("api", "bot", "worker"):
        environment = compose["services"][service]["environment"]
        assert environment["APP_SECRETS_DIR"] == "/run/secrets"
        assert not {"DATABASE_URL", "BOT_TOKEN", "TELEGRAM_RELAY_SECRET"} & environment.keys()
    for service in ("api", "bot", "worker"):
        assert any(
            "${SECRETS_RELEASE}" in volume and volume.endswith(":ro")
            for volume in compose["services"][service]["volumes"]
        )
    infra_text = (REPO / "deploy/docker-compose.infra.yml").read_text()
    infra = yaml.safe_load(infra_text)
    for variable in ("BOT_TOKEN", "POSTGRES_PASSWORD", "TELEGRAM_RELAY_SECRET"):
        assert "${" + variable + "}" not in infra_text
    for service in ("db", "backup"):
        assert any(
            "${INFRA_SECRETS_RELEASE}" in volume and volume.endswith(":ro")
            for volume in infra["services"][service]["volumes"]
        )
    assert infra["services"]["db"]["environment"]["POSTGRES_PASSWORD_FILE"] == (
        "/run/secrets/password"
    )
    assert infra["services"]["backup"]["environment"] == {"PGPASSFILE": "/run/secrets/pgpass"}


def test_swarm_deploy_step_cannot_receive_application_secret_values() -> None:
    workflow = yaml.safe_load((REPO / ".github/workflows/deploy.yml").read_text())
    steps = workflow["jobs"]["deploy"]["steps"]
    deploy = next(step for step in steps if step.get("id") == "update_swarm")
    assert not set(PAYLOAD) & deploy["env"].keys()
    assert not any(name in deploy["run"] for name in PAYLOAD)
    upload_index = next(i for i, step in enumerate(steps) if step.get("id") == "upload_secrets")
    update_index = next(i for i, step in enumerate(steps) if step.get("id") == "update_swarm")
    assert upload_index < update_index
