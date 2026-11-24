"""Check private inventory creation without SSH, GitHub or application secrets."""

# ruff: noqa: PT009, PT027 -- standard-library runner, no pytest dependency

import json
import os
import runpy
import shlex
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / ".github/scripts/prepare-ansible-inventory.py"
PREPARE = runpy.run_path(str(SCRIPT))["prepare"]


class InventoryTest(unittest.TestCase):
    def environment(self) -> dict[str, str]:
        return {
            "IP_FOR_ANSIBLE": "192.0.2.10",
            "SSH_USER": "ubuntu",
            "YC_VM_SSH_KEY": "private-key-sentinel",
            "YC_VM_SSH_KNOWN_HOSTS": "192.0.2.10 ssh-ed25519 public-key",
        }

    def test_private_files_and_pinned_host_key(self) -> None:
        with tempfile.TemporaryDirectory(prefix="inventory with spaces ") as name:
            directory = Path(name) / "ssh"
            inventory = PREPARE(directory, self.environment())
            host = json.loads(inventory.read_text())["all"]["children"]["fellow"]["hosts"][
                "ansible_target"
            ]
            self.assertEqual(host["ansible_host"], "192.0.2.10")
            self.assertEqual(host["ansible_user"], "ubuntu")
            self.assertEqual(
                Path(host["ansible_ssh_private_key_file"]).read_text(), "private-key-sentinel\n"
            )
            options = shlex.split(host["ansible_ssh_common_args"])
            self.assertIn("StrictHostKeyChecking=yes", options)
            self.assertIn(f"UserKnownHostsFile={directory / 'known_hosts'}", options)
            self.assertIn("BatchMode=yes", options)
            self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
            for path in directory.iterdir():
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertNotIn("private-key-sentinel", inventory.read_text())

    def test_invalid_connection_settings_are_rejected_before_writing(self) -> None:
        for override in (
            {"IP_FOR_ANSIBLE": "192.0.2.10; echo injected"},
            {"IP_FOR_ANSIBLE": ""},
            {"SSH_USER": "ubuntu -o StrictHostKeyChecking=no"},
            {"YC_VM_SSH_KEY": ""},
            {"YC_VM_SSH_KNOWN_HOSTS": ""},
        ):
            with self.subTest(override=override), tempfile.TemporaryDirectory() as name:
                directory = Path(name) / "ssh"
                with self.assertRaises(ValueError):
                    PREPARE(directory, self.environment() | override)
                self.assertFalse(directory.exists())

    def test_refuses_to_overwrite_existing_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            directory = Path(name) / "ssh"
            PREPARE(directory, self.environment())
            with self.assertRaises(FileExistsError):
                PREPARE(directory, self.environment() | {"YC_VM_SSH_KEY": "replacement"})
            self.assertEqual((directory / "key").read_text(), "private-key-sentinel\n")

    def test_does_not_fall_back_to_cloud_discovery(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            environment = self.environment()
            del environment["IP_FOR_ANSIBLE"]
            environment["YC_VM_PUBLIC_IP"] = "192.0.2.20"
            with self.assertRaises(KeyError):
                PREPARE(Path(name) / "ssh", environment)

    def test_cli_outputs_only_the_inventory_path(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            output = Path(name) / "github-output"
            result = subprocess.run(
                [sys.executable, str(SCRIPT)],
                env=os.environ
                | self.environment()
                | {"RUNNER_TEMP": name, "GITHUB_OUTPUT": str(output)},
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertEqual(
                output.read_text(), f"inventory_path={name}/fellow-ansible-ssh/inventory.json\n"
            )
            self.assertNotIn(
                "private-key-sentinel", result.stdout + result.stderr + output.read_text()
            )

    def test_cli_error_does_not_expose_environment_values(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            result = subprocess.run(
                [sys.executable, str(SCRIPT)],
                env=os.environ
                | self.environment()
                | {"RUNNER_TEMP": name, "SSH_USER": "invalid private-key-sentinel"},
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 1)
            self.assertNotIn("private-key-sentinel", result.stdout + result.stderr)
