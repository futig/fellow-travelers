"""Deployment failures must preserve infrastructure and restore a complete release."""

import importlib.util
import json
from email.message import Message
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]


def load_controller() -> ModuleType:
    spec = importlib.util.spec_from_file_location("swarm_controller", REPO / "deploy/swarm.py")
    assert spec is not None
    assert spec.loader is not None
    controller = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(controller)
    return controller


@pytest.fixture
def controller(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    module = load_controller()
    monkeypatch.setattr(module, "ROOT", tmp_path / "state")
    monkeypatch.setattr(module, "SECRETS", tmp_path / "secrets")
    module.ROOT.mkdir()
    return module


@pytest.fixture
def installed(controller: ModuleType, monkeypatch: pytest.MonkeyPatch) -> dict[str, object]:
    config = {
        "SECRETS_RELEASE": "100-1",
        "API_IMAGE": "example/api@sha256:old",
        "WEB_IMAGE": "example/web@sha256:old",
        "CADDY_IMAGE": "example/caddy@sha256:old",
        "SITE_ADDRESS": "example.com",
        "ACME_EMAIL": "test@example.com",
        "ACME_CA": "https://acme.example.com",
        "TELEGRAM_RELAY_URL": "https://relay.example.com",
        "BOT_USERNAME": "test_bot",
    }
    manifest: dict[str, object] = {"release": "100-1", "previous": None, "config": config}
    old = controller.ROOT / "releases/100-1"
    old.mkdir(parents=True)
    (old / "app.yml").write_text("previous application")
    (old / "infra.yml").write_text("previous infrastructure")
    (old / "manifest.json").write_text(json.dumps(manifest))
    (controller.ROOT / "current.json").write_text(json.dumps(manifest))
    for release in ("100-1", "101-1"):
        directory = controller.SECRETS / release / "api"
        directory.mkdir(parents=True)
        (directory / "database_url").write_text("postgresql+asyncpg://user:secret@db/database")
    for name in (
        "ensure_swarm",
        "preflight",
        "seed_assets",
        "migrate",
        "deploy_stack",
        "wait_services",
        "smoke",
    ):
        monkeypatch.setattr(controller, name, Mock())
    monkeypatch.setattr(controller, "pin_image", Mock(side_effect=lambda image: image))
    monkeypatch.setattr(
        controller, "render", Mock(side_effect=lambda source, dest, config: dest.write_text("new"))
    )
    return manifest


def request() -> dict[str, object]:
    return {
        "config": {
            "SECRETS_RELEASE": "101-1",
            "API_IMAGE": "example/api@sha256:new",
            "WEB_IMAGE": "example/web@sha256:new",
            "TELEGRAM_RELAY_URL": "",
        },
        "files": dict.fromkeys(
            (
                "docker-compose.prod.yml",
                "docker-compose.infra.yml",
                "install-secrets.py",
                "swarm.py",
            ),
            "source",
        ),
    }


def test_api_web_rollout_is_sequential_and_singletons_do_not_overlap() -> None:
    app = yaml.safe_load((REPO / "deploy/docker-compose.prod.yml").read_text())
    for name in ("api", "web"):
        service = app["services"][name]
        assert "container_name" not in service
        assert "ports" not in service
        assert service["deploy"]["replicas"] == 2
        update = service["deploy"]["update_config"]
        assert update["parallelism"] == 1
        assert update["order"] == "start-first"
        assert update["failure_action"] == "rollback"
    for name in ("bot", "worker"):
        service = app["services"][name]
        assert service["deploy"]["replicas"] == 1
        assert service["deploy"]["update_config"]["order"] == "stop-first"
        assert service["deploy"]["rollback_config"]["order"] == "stop-first"
    assert "/readyz" in str(app["services"]["api"]["healthcheck"])
    assert "alembic" not in app["services"]["api"]["command"]
    assert set(app["services"]) == {"api", "web", "bot", "worker"}
    assert "assets:/usr/share/nginx/html/assets:ro" in app["services"]["web"]["volumes"]


@pytest.mark.parametrize("stage", ["migrate", "wait_services", "smoke"])
def test_failed_release_restores_whole_previous_stack_without_touching_infra(
    controller: ModuleType,
    installed: dict[str, object],
    stage: str,
) -> None:
    failure = controller.DeployError("simulated failure")
    getattr(controller, stage).side_effect = [failure, None, None]
    with pytest.raises(controller.DeployError, match="simulated"):
        controller.release(request())
    calls = controller.deploy_stack.call_args_list
    assert calls[-1].args == (controller.ROOT / "releases/100-1/app.yml", "fellow")
    assert all(call.args[1] == "fellow" for call in calls)
    assert json.loads((controller.ROOT / "current.json").read_text()) == installed


def test_success_promotes_only_after_migrations_rollout_and_smoke(
    controller: ModuleType, installed: dict[str, object]
) -> None:
    order = Mock()
    for name in ("migrate", "deploy_stack", "wait_services", "smoke"):
        order.attach_mock(getattr(controller, name), name)
    controller.release(request())
    names = [call[0] for call in order.mock_calls]
    assert names.index("migrate") < names.index("deploy_stack") < names.index("smoke")
    current = json.loads((controller.ROOT / "current.json").read_text())
    assert current["release"] == "101-1"
    assert current["previous"] == installed["release"]
    assert current["config"]["TELEGRAM_RELAY_URL"] == ""
    assert (controller.ROOT / "releases/101-1/infra.yml").read_text() == "previous infrastructure"
    assert controller.deploy_stack.call_count == 1


def test_password_change_fails_before_any_infrastructure_mutation(
    controller: ModuleType, installed: dict[str, object]
) -> None:
    (controller.SECRETS / "101-1/api/database_url").write_text("different password")
    with pytest.raises(controller.DeployError, match="credential rotation"):
        controller.release(request())
    controller.ensure_swarm.assert_not_called()
    controller.deploy_stack.assert_not_called()
    assert json.loads((controller.ROOT / "current.json").read_text()) == installed


def test_https_change_requires_explicit_infrastructure_update(
    controller: ModuleType, installed: dict[str, object]
) -> None:
    payload = request()
    assert isinstance(payload["config"], dict)
    payload["config"]["SITE_ADDRESS"] = "new.example.com"
    with pytest.raises(controller.DeployError, match="update_infra"):
        controller.release(payload)
    controller.ensure_swarm.assert_not_called()


def test_manual_rollback_uses_saved_stack_and_skips_migrations(
    controller: ModuleType, installed: dict[str, object]
) -> None:
    controller.release(request())
    for name in ("migrate", "pin_image", "deploy_stack"):
        getattr(controller, name).reset_mock()
    controller.release({"action": "rollback"})
    controller.migrate.assert_not_called()
    controller.pin_image.assert_not_called()
    controller.deploy_stack.assert_called_once_with(
        controller.ROOT / "releases/100-1/app.yml", "fellow"
    )
    assert json.loads((controller.ROOT / "current.json").read_text())["release"] == "100-1"


def test_failed_manual_rollback_restores_current_release(
    controller: ModuleType, installed: dict[str, object]
) -> None:
    controller.release(request())
    controller.smoke.side_effect = [controller.DeployError("rollback failed"), None]
    with pytest.raises(controller.DeployError, match="rollback failed"):
        controller.release({"action": "rollback"})
    assert controller.deploy_stack.call_args.args == (
        controller.ROOT / "releases/101-1/app.yml",
        "fellow",
    )
    assert json.loads((controller.ROOT / "current.json").read_text())["release"] == "101-1"


@pytest.mark.parametrize("state", ["paused", "rollback_started", "rollback_completed"])
def test_swarm_automatic_rollback_is_a_failed_release(
    controller: ModuleType, monkeypatch: pytest.MonkeyPatch, state: str
) -> None:
    monkeypatch.setattr(
        controller, "docker_json", Mock(return_value=[{"UpdateStatus": {"State": state}}])
    )
    with pytest.raises(controller.DeployError, match="Swarm rejected"):
        controller.wait_services(["fellow_api"])


def test_coi_recovery_never_starts_second_database_while_swarm_db_is_running(
    controller: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    commands = Mock(return_value="still-running")
    monkeypatch.setattr(controller, "run", commands)
    monkeypatch.setattr(controller.time, "monotonic", Mock(side_effect=[0, 121]))
    with pytest.raises(controller.DeployError, match="second PostgreSQL"):
        controller.restore_coi()
    assert not any(call.args[:2] == ("docker", "start") for call in commands.call_args_list)


def test_saved_shell_variables_survive_second_compose_interpolation(
    controller: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    stack = tmp_path / "infra.yml"
    stack.write_text('command: ["sh", "-c", "day=$(date +%u); echo $day"]')
    command = Mock()
    monkeypatch.setattr(controller, "run", command)
    controller.deploy_stack(stack, "fellow-infra")
    rendered = command.call_args.kwargs["data"]
    assert "$$(date +%u)" in rendered
    assert "$$day" in rendered


def test_runner_transmits_registry_credentials_only_on_stdin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = REPO / ".github/scripts/run-swarm.py"
    spec = importlib.util.spec_from_file_location("swarm_runner", path)
    assert spec is not None
    assert spec.loader is not None
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    for key, value in {
        "SSH_TARGET": "yc-user@192.0.2.1",
        "SSH_KEY_FILE": "/tmp/key",
        "SSH_KNOWN_HOSTS_FILE": "/tmp/known_hosts",
        "IAM_TOKEN": "secret-test-token",
    }.items():
        monkeypatch.setenv(key, value)
    command = Mock(return_value=Mock(returncode=0))
    monkeypatch.setattr(runner.subprocess, "run", command)
    assert runner.main() == 0
    args, kwargs = command.call_args
    assert "secret-test-token" not in " ".join(args[0])
    assert "StrictHostKeyChecking=yes" in args[0]
    assert "IdentitiesOnly=yes" in args[0]
    assert json.loads(kwargs["input"])["registry_token"] == "secret-test-token"


@pytest.mark.parametrize("stage", ["wait_services", "migrate", "smoke"])
def test_failed_initial_cutover_returns_control_to_coi(
    controller: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
    stage: str,
) -> None:
    legacy = [
        {"Name": "/" + name, "State": {"Running": True}, "Config": {"Env": []}}
        for name in controller.LEGACY
    ]
    legacy[-1]["Config"] = {"Env": ["POSTGRES_PASSWORD=existing123"]}
    config = {
        "BOT_USERNAME": "test_bot",
        "API_IMAGE": "example/api:v1",
        "WEB_IMAGE": "example/web:v1",
        "CADDY_IMAGE": "example/caddy:v1",
        "DB_IMAGE": "postgres:16.15-alpine",
    }
    secrets = controller.SECRETS / "101-1/db"
    secrets.mkdir(parents=True)
    (secrets / "password").write_text("existing123")
    monkeypatch.setattr(controller, "docker_json", Mock(return_value=legacy))
    monkeypatch.setattr(controller, "legacy_config", Mock(return_value=config))
    for name in (
        "ensure_swarm",
        "preflight",
        "seed_assets",
        "migrate",
        "deploy_stack",
        "wait_services",
        "smoke",
        "run",
        "restore_coi",
    ):
        monkeypatch.setattr(controller, name, Mock())
    monkeypatch.setattr(controller, "pin_image", Mock(side_effect=lambda image: image))
    monkeypatch.setattr(controller, "render", Mock())
    monkeypatch.setattr(controller.subprocess, "run", Mock(return_value=Mock(returncode=0)))
    getattr(controller, stage).side_effect = controller.DeployError("bootstrap failed")
    with pytest.raises(controller.DeployError, match="bootstrap failed"):
        controller.release(request())
    controller.restore_coi.assert_called_once_with()
    assert not (controller.ROOT / "current.json").exists()
    assert (controller.ROOT / "releases/101-1/legacy-containers.json").exists()


def test_unsupported_image_is_rejected_before_running_services_are_changed(
    controller: ModuleType, installed: dict[str, object]
) -> None:
    controller.preflight.side_effect = controller.DeployError("unsupported image")
    with pytest.raises(controller.DeployError, match="unsupported image"):
        controller.release(request())
    controller.migrate.assert_not_called()
    controller.deploy_stack.assert_not_called()
    assert json.loads((controller.ROOT / "current.json").read_text()) == installed


def test_migration_gets_file_secrets_and_required_nonsecret_settings(
    controller: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    command = Mock()
    monkeypatch.setattr(controller, "run", command)
    controller.migrate(
        {
            "SECRETS_RELEASE": "123-1",
            "BOT_USERNAME": "test_bot",
            "API_IMAGE": "example/api:v1",
        }
    )
    args = command.call_args.args
    assert "BOT_USERNAME=test_bot" in args
    assert "APP_SECRETS_DIR=/run/secrets" in args
    assert str(controller.SECRETS / "123-1/api") + ":/run/secrets:ro" in args
    assert args[-1] == "alembic upgrade head && python -m app.seeds.locations"


def test_swarm_setup_reuses_existing_overlay_on_repeated_deployments(
    controller: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        controller,
        "docker_json",
        Mock(
            side_effect=[
                {"LocalNodeState": "active", "ControlAvailable": True},
                [{"Driver": "overlay", "Attachable": True}],
            ]
        ),
    )
    command = Mock(side_effect=["node-id\n", "bridge\nfellow-private\ningress\n", "fellow-assets"])
    monkeypatch.setattr(controller, "run", command)
    controller.ensure_swarm()
    assert not any(
        call.args[:3] == ("docker", "network", "create") for call in command.call_args_list
    )


@pytest.mark.parametrize(("api_status", "succeeds"), [(401, True), (502, False)])
def test_smoke_accepts_expected_unauthorized_but_rejects_broken_proxy(
    controller: ModuleType, monkeypatch: pytest.MonkeyPatch, api_status: int, succeeds: bool
) -> None:
    import urllib.error

    def urlopen(url: str, *, timeout: int) -> Mock:
        if url.endswith("/api/v1/me"):
            raise urllib.error.HTTPError(url, api_status, "response", Message(), None)
        response = Mock(status=200)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        return response

    monkeypatch.setattr(controller.urllib.request, "urlopen", urlopen)

    def execute_probe(*args: str) -> None:
        exec(compile(args[-1], "smoke-probe", "exec"), {})

    monkeypatch.setattr(controller, "run", execute_probe)
    config = {"API_IMAGE": "example/api:v1", "SITE_ADDRESS": "example.com"}
    if succeeds:
        controller.smoke(config)
    else:
        with pytest.raises(RuntimeError, match="got 502"):
            controller.smoke(config)
