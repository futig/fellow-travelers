"""Single-node Swarm releases. Run as root; the request arrives only on stdin.

Keep infrastructure outside application releases. Never put secrets in argv, logs or
rendered stacks. A failed release restores the whole preceding application stack.
"""

import fcntl
import json
import os
import re
import runpy
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path("/var/lib/fellow-travelers/swarm")
SECRETS = Path("/var/lib/fellow-travelers/secrets")
NETWORK = "fellow-private"
STACK = "fellow"
INFRA = "fellow-infra"
APPS = ("api", "web", "bot", "worker")
LEGACY = ("api", "web", "bot", "worker", "caddy", "backup", "db")
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
DEFAULTS = {
    "INIT_DATA_MAX_AGE_SECONDS": "86400",
    "DEBUG": "false",
    "LOG_LEVEL": "INFO",
    "WORKER_METRICS_PORT": "9100",
    "TELEGRAM_RELAY_URL": "",
    "ACME_CA": "https://acme-v02.api.letsencrypt.org/directory",
}


class DeployError(RuntimeError):
    pass


def run(*args, data=None, env=None, timeout=600):
    result = subprocess.run(
        list(args),
        input=data,
        capture_output=True,
        text=True,
        env=env,
        timeout=timeout,
        check=False,
    )
    if result.returncode:
        # Docker/SQL diagnostics can contain credentials. They stay on the VM.
        (ROOT / "last-error.log").write_text(result.stderr, encoding="utf-8")
        raise DeployError("Command failed: " + " ".join(args[:2]))
    return result.stdout


def docker_json(*args):
    return json.loads(run("docker", *args))


def save_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value), encoding="utf-8")
    temporary.replace(path)


def env_of(container):
    return dict(
        item.split("=", 1) for item in container["Config"]["Env"] if "=" in item
    )


def volume_at(container, destination):
    for mount in container["Mounts"]:
        if mount["Destination"] == destination and mount["Type"] == "volume":
            return mount["Name"]
    raise DeployError("Existing persistent volume not found: " + destination)


def legacy_config(containers):
    api, bot, caddy = (env_of(containers[name]) for name in ("api", "bot", "caddy"))
    values = {
        **DEFAULTS,
        **{key: value for key, value in api.items() if key in CONFIG_KEYS},
    }
    values.update({key: value for key, value in caddy.items() if key in CONFIG_KEYS})
    values["TELEGRAM_RELAY_URL"] = bot.get("TELEGRAM_RELAY_URL", "")
    for key, name in (
        ("API_IMAGE", "api"),
        ("WEB_IMAGE", "web"),
        ("CADDY_IMAGE", "caddy"),
    ):
        values[key] = containers[name]["Config"]["Image"]
    values.update(
        {
            "DB_IMAGE": containers["db"]["Config"]["Image"],
            "DB_VOLUME": volume_at(containers["db"], "/var/lib/postgresql/data"),
            "CADDY_DATA_VOLUME": volume_at(containers["caddy"], "/data"),
            "CADDY_CONFIG_VOLUME": volume_at(containers["caddy"], "/config"),
            "BACKUPS_VOLUME": volume_at(containers["backup"], "/backups"),
        }
    )
    return values


def install_legacy_secrets(containers, release, installer_path):
    def secret(name, env_key, filename):
        container = containers[name]
        environment = env_of(container)
        if env_key in environment:
            return environment[env_key]
        for mount in container["Mounts"]:
            if mount["Destination"] == "/run/secrets":
                return (Path(mount["Source"]) / filename).read_text().strip()
        return ""

    token = secret("api", "BOT_TOKEN", "bot_token")
    password = secret("db", "POSTGRES_PASSWORD", "password")
    relay = secret("bot", "TELEGRAM_RELAY_SECRET", "telegram_relay_secret")
    installer = runpy.run_path(str(installer_path), run_name="secret_installer")
    installer["install"](
        release,
        {
            "BOT_TOKEN": token,
            "POSTGRES_PASSWORD": password,
            "TELEGRAM_RELAY_SECRET": relay,
        },
    )


def ensure_swarm():
    swarm = docker_json("info", "--format", "{{json .Swarm}}")
    if swarm["LocalNodeState"] == "inactive":
        # Use the private address; never open Swarm's ports to the public internet.
        addresses = run("hostname", "-I").split()
        if not addresses:
            raise DeployError("No private address for Swarm")
        run("docker", "swarm", "init", "--advertise-addr", addresses[0])
    elif not swarm["ControlAvailable"]:
        raise DeployError("This VM must be a Swarm manager")
    if len(run("docker", "node", "ls", "-q").split()) != 1:
        raise DeployError(
            "This deployment uses local volumes and requires exactly one node"
        )
    networks = run("docker", "network", "ls", "--format", "{{.Name}}").split()
    if NETWORK not in networks:
        run(
            "docker",
            "network",
            "create",
            "--driver",
            "overlay",
            "--attachable",
            NETWORK,
        )
    network = docker_json("network", "inspect", NETWORK)[0]
    if network["Driver"] != "overlay" or not network["Attachable"]:
        raise DeployError("Expected an attachable overlay network")
    run("docker", "volume", "create", "fellow-assets")


def pin_image(image):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_./:@-]+", image):
        raise DeployError("Invalid image reference")
    run("docker", "pull", image)
    digests = docker_json("image", "inspect", image)[0].get("RepoDigests", [])
    repository = image.split("@")[0].split(":")[0]
    for digest in digests:
        if digest.split("@")[0] == repository:
            return digest
    if "@sha256:" in image and image in digests:
        return image
    raise DeployError("Cannot resolve immutable image: " + repository)


def render(template, destination, config):
    environment = {**os.environ, **config}
    # stack config does not connect to the daemon. Its output contains only paths/config.
    rendered = run("docker", "stack", "config", "-c", str(template), env=environment)
    destination.write_text(rendered, encoding="utf-8")


def deploy_stack(path, name):
    # The file is already interpolated. --skip-interpolation at render time would
    # leave it mutable; instead escape literal dollars for this second parser pass.
    source = path.read_text(encoding="utf-8").replace("$", "$$")
    run(
        "docker",
        "stack",
        "deploy",
        "--with-registry-auth",
        "--resolve-image",
        "never",
        "--compose-file",
        "-",
        name,
        data=source,
    )


def wait_services(names, timeout=600, recovering=False):
    deadline = time.monotonic() + timeout
    stable_since = None
    previous_tasks = None
    while time.monotonic() < deadline:
        ready = True
        all_tasks = []
        for name in names:
            service = docker_json("service", "inspect", name)[0]
            state = service.get("UpdateStatus", {}).get("State", "")
            if state == "paused" or (state.startswith("rollback") and not recovering):
                raise DeployError("Swarm rejected update of " + name + ": " + state)
            if state in ("updating", "rollback_started", "rollback_paused"):
                ready = False
            desired = service["Spec"]["Mode"]["Replicated"]["Replicas"]
            task_ids = run(
                "docker",
                "service",
                "ps",
                "--no-trunc",
                "-q",
                "--filter",
                "desired-state=running",
                name,
            ).split()
            all_tasks.extend(task_ids)
            if len(task_ids) != desired:
                ready = False
                continue
            tasks = docker_json("inspect", "--type", "task", *task_ids)
            for task in tasks:
                if task["Status"]["State"] != "running":
                    ready = False
                    continue
                container_id = task["Status"]["ContainerStatus"]["ContainerID"]
                container = docker_json("inspect", container_id)[0]
                health = container["State"].get("Health", {}).get("Status", "healthy")
                if health != "healthy":
                    ready = False
        if ready:
            if previous_tasks != sorted(all_tasks):
                stable_since = None
            stable_since = stable_since or time.monotonic()
            # Includes singleton bot startup, even on the first deployment.
            if time.monotonic() - stable_since >= 45:
                return
        else:
            stable_since = None
        previous_tasks = sorted(all_tasks)
        time.sleep(3)
    raise DeployError("Timed out waiting for healthy services: " + ", ".join(names))


def seed_assets(web_image):
    run(
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--entrypoint",
        "sh",
        "-v",
        "fellow-assets:/release-assets",
        web_image,
        "-ec",
        "cp -an /usr/share/nginx/html/assets/. /release-assets/",
    )


def migrate(config):
    run(
        "docker",
        "run",
        "--rm",
        "--name",
        "fellow-migrate",
        "--network",
        NETWORK,
        "-e",
        "APP_SECRETS_DIR=/run/secrets",
        "-e",
        "BOT_USERNAME=" + config["BOT_USERNAME"],
        "-v",
        str(SECRETS / config["SECRETS_RELEASE"] / "api") + ":/run/secrets:ro",
        config["API_IMAGE"],
        "sh",
        "-ec",
        "alembic upgrade head && python -m app.seeds.locations",
    )


def preflight(config):
    # Catch images without file-secret support before touching the running stack.
    run(
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "-e",
        "APP_SECRETS_DIR=/run/secrets",
        "-e",
        "BOT_USERNAME=" + config["BOT_USERNAME"],
        "-v",
        str(SECRETS / config["SECRETS_RELEASE"] / "api") + ":/run/secrets:ro",
        config["API_IMAGE"],
        "python",
        "-c",
        "from app.config import get_settings; from app.main import app; "
        "s=get_settings(); assert s.database_url and s.bot_token.get_secret_value(); "
        "assert any(getattr(r, 'path', None) == '/readyz' for r in app.routes)",
    )


def smoke(config):
    # The root page alone could be green while every API request returns 502.
    probe = """
import urllib.error
import urllib.request

def status(url):
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code

for url, expected in (
    ('http://api:8000/readyz', 200),
    ('http://web/', 200),
    ('http://web/api/v1/me', 401),
):
    actual = status(url)
    if actual != expected:
        raise RuntimeError(f'Smoke check {url}: expected {expected}, got {actual}')
"""
    run(
        "docker",
        "run",
        "--rm",
        "--network",
        NETWORK,
        "--entrypoint",
        "python",
        config["API_IMAGE"],
        "-c",
        probe,
    )
    address = config["SITE_ADDRESS"]
    url = "http://127.0.0.1/" if address == ":80" else "https://" + address + "/"
    with urllib.request.urlopen(url, timeout=15) as response:
        if response.status != 200:
            raise DeployError("Public website smoke check failed")


def restore_coi():
    print("Restoring COI containers", flush=True)
    stacks = run("docker", "stack", "ls", "--format", "{{.Name}}").split()
    for stack in (STACK, INFRA):
        if stack in stacks:
            run("docker", "stack", "rm", stack)
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        remaining = run(
            "docker",
            "ps",
            "-q",
            "--filter",
            "label=com.docker.stack.namespace=" + INFRA,
        )
        remaining += run(
            "docker",
            "ps",
            "-q",
            "--filter",
            "label=com.docker.stack.namespace=" + STACK,
        )
        if not remaining.strip():
            break
        time.sleep(2)
    else:
        raise DeployError(
            "Swarm containers still running; refusing to start a second PostgreSQL"
        )
    run("docker", "start", "db")
    run("docker", "start", *[name for name in LEGACY if name != "db"])
    run("systemctl", "enable", "--now", "yc-container-daemon.service")


def release(request):
    action = request.get("action", "deploy")
    if action not in ("deploy", "rollback"):
        raise DeployError("Unknown action")
    current_path = ROOT / "current.json"
    current = json.loads(current_path.read_text()) if current_path.exists() else None
    if action == "rollback":
        if not current or not current.get("previous"):
            raise DeployError("No preceding Swarm release to restore")
        previous = json.loads(
            (ROOT / "releases" / current["previous"] / "manifest.json").read_text()
        )
        print("Restoring application release " + previous["release"], flush=True)
        try:
            deploy_stack(ROOT / "releases" / previous["release"] / "app.yml", STACK)
            wait_services([STACK + "_" + name for name in APPS], recovering=True)
            smoke(previous["config"])
        except Exception:
            deploy_stack(ROOT / "releases" / current["release"] / "app.yml", STACK)
            wait_services([STACK + "_" + name for name in APPS], recovering=True)
            smoke(current["config"])
            raise
        previous["previous"] = current["release"]
        save_json(current_path, previous)
        return

    supplied = {
        key: str(value)
        for key, value in request.get("config", {}).items()
        if key in CONFIG_KEYS
        and value is not None
        and (str(value) != "" or key == "TELEGRAM_RELAY_URL")
    }
    release_id = supplied.get("SECRETS_RELEASE", str(time.time_ns()) + "-1")
    if not re.fullmatch(r"[0-9]+-[0-9]+", release_id):
        raise DeployError("Invalid release ID")
    directory = ROOT / "releases" / release_id
    directory.mkdir(parents=True, exist_ok=False)
    for name in (
        "docker-compose.prod.yml",
        "docker-compose.infra.yml",
        "install-secrets.py",
        "swarm.py",
    ):
        (directory / name).write_text(request["files"][name], encoding="utf-8")

    containers = None
    if current:
        config = {**current["config"], **supplied}
    else:
        inspected = docker_json("inspect", *LEGACY)
        containers = {
            container["Name"].lstrip("/"): container for container in inspected
        }
        if not all(container["State"]["Running"] for container in containers.values()):
            raise DeployError("All legacy services must be running before bootstrap")
        config = {**legacy_config(containers), **supplied}
        # A root-only snapshot includes old container environments for disaster recovery.
        save_json(directory / "legacy-containers.json", inspected)
    config["SECRETS_RELEASE"] = release_id
    if not (SECRETS / release_id).is_dir():
        if containers is None:
            raise DeployError("Upload this release's runtime secrets before deployment")
        install_legacy_secrets(containers, release_id, directory / "install-secrets.py")
    if current:
        old_url = (
            SECRETS / current["config"]["SECRETS_RELEASE"] / "api/database_url"
        ).read_text()
        new_url = (SECRETS / release_id / "api/database_url").read_text()
        if old_url != new_url:
            raise DeployError(
                "Database credential rotation requires a separate procedure"
            )
        if not request.get("update_infra") and any(
            config[key] != current["config"][key]
            for key in ("SITE_ADDRESS", "ACME_EMAIL", "ACME_CA")
        ):
            raise DeployError(
                "Use update_infra to change HTTPS infrastructure settings"
            )
    elif containers is not None:
        environment = env_of(containers["db"])
        old_password = environment.get("POSTGRES_PASSWORD")
        if old_password is None:
            mount = next(
                item
                for item in containers["db"]["Mounts"]
                if item["Destination"] == "/run/secrets"
            )
            old_password = (Path(mount["Source"]) / "password").read_text().strip()
        if (SECRETS / release_id / "db/password").read_text().strip() != old_password:
            raise DeployError("New database password differs from the running database")
    ensure_swarm()
    print("Pulling and pinning release images", flush=True)
    for key in ("API_IMAGE", "WEB_IMAGE"):
        config[key] = pin_image(config[key])
    print(
        "Checking image and file secrets before changing running services", flush=True
    )
    preflight(config)
    seed_assets(config["WEB_IMAGE"])
    render(directory / "docker-compose.prod.yml", directory / "app.yml", config)

    cutover = False
    infrastructure_changed = False
    try:
        if containers is not None:
            config["INFRA_SECRETS_RELEASE"] = release_id
            config["CADDY_IMAGE"] = pin_image(config["CADDY_IMAGE"])
            config["DB_IMAGE"] = pin_image(config["DB_IMAGE"])
            render(
                directory / "docker-compose.infra.yml", directory / "infra.yml", config
            )
            print("Saving a database backup before COI cutover", flush=True)
            with (directory / "before-cutover.dump").open("wb") as dump:
                result = subprocess.run(
                    [
                        "docker",
                        "exec",
                        "db",
                        "pg_dump",
                        "-U",
                        "fellow",
                        "-d",
                        "fellow_travelers",
                        "-Fc",
                    ],
                    stdout=dump,
                    stderr=subprocess.PIPE,
                    timeout=300,
                    check=False,
                )
                if result.returncode:
                    raise DeployError("Pre-cutover database backup failed")
            print(
                "Stopping COI management; preserving every existing volume", flush=True
            )
            cutover = True
            run("systemctl", "disable", "--now", "yc-container-daemon.service")
            run("docker", "stop", "--time", "65", *LEGACY, timeout=180)
            deploy_stack(directory / "infra.yml", INFRA)
            wait_services([INFRA + "_db"], timeout=180)
        elif request.get("update_infra"):
            # Keep the original DB/backup secrets path. Routine secret releases must
            # never restart PostgreSQL or implicitly rotate an initialized DB password.
            config["CADDY_IMAGE"] = pin_image(config["CADDY_IMAGE"])
            render(
                directory / "docker-compose.infra.yml", directory / "infra.yml", config
            )
            infrastructure_changed = True
            deploy_stack(directory / "infra.yml", INFRA)
            wait_services([INFRA + "_db", INFRA + "_caddy", INFRA + "_backup"])
        else:
            # Preserve the deployed infrastructure descriptor for recovery.
            config["CADDY_IMAGE"] = current["config"]["CADDY_IMAGE"]
            (directory / "infra.yml").write_text(
                (ROOT / "releases" / current["release"] / "infra.yml").read_text(),
                encoding="utf-8",
            )
        print("Running migrations once, before the application rollout", flush=True)
        migrate(config)
        print("Rolling out API/web; replacing bot/worker one at a time", flush=True)
        deploy_stack(directory / "app.yml", STACK)
        wait_services([STACK + "_" + name for name in APPS])
        wait_services([INFRA + "_db", INFRA + "_caddy", INFRA + "_backup"])
        smoke(config)
    except Exception:
        if current:
            print(
                "Release failed; restoring the preceding application stack", flush=True
            )
            old_directory = ROOT / "releases" / current["release"]
            if infrastructure_changed:
                deploy_stack(old_directory / "infra.yml", INFRA)
                wait_services(
                    [INFRA + "_db", INFRA + "_caddy", INFRA + "_backup"],
                    recovering=True,
                )
            deploy_stack(old_directory / "app.yml", STACK)
            wait_services([STACK + "_" + name for name in APPS], recovering=True)
            smoke(current["config"])
        elif cutover:
            restore_coi()
        raise
    manifest = {
        "release": release_id,
        "previous": current["release"] if current else None,
        "config": config,
    }
    save_json(directory / "manifest.json", manifest)
    save_json(current_path, manifest)
    print("Release healthy: " + release_id, flush=True)


def main():
    if os.geteuid() != 0:
        raise DeployError("Run this script as root")
    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (ROOT / "deploy.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise DeployError("Another deployment is in progress") from exc
        request = json.load(sys.stdin)
        with tempfile.TemporaryDirectory(prefix=".docker-", dir=ROOT) as docker_config:
            os.environ["DOCKER_CONFIG"] = docker_config
            token = request.pop("registry_token", "")
            if not token:
                metadata = urllib.request.Request(
                    "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
                    headers={"Metadata-Flavor": "Google"},
                )
                with urllib.request.urlopen(metadata, timeout=10) as response:
                    token = json.load(response)["access_token"]
            run(
                "docker",
                "login",
                "--username",
                "iam",
                "--password-stdin",
                "cr.yandex",
                data=token,
            )
            release(request)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 -- never expose secret-bearing exceptions
        # Do not print traceback/command output: it can include runtime secrets.
        message = str(error) if isinstance(error, DeployError) else type(error).__name__
        print("Deployment failed: " + message, file=sys.stderr, flush=True)
        sys.exit(1)
