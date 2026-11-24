"""Exercise the actual Ansible Swarm tasks against a stateful fake Docker CLI."""

# ruff: noqa: PT009 -- standard-library runner, no pytest dependency

import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYBOOK = Path(sys.executable).parent / "ansible-playbook"
FAKE_DOCKER = """#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path
path = Path(os.environ["FELLOW_TEST_STATE"])
state = json.loads(path.read_text())
args = sys.argv[1:]
state["calls"].append(args)
if args[:2] == ["info", "--format"]:
    print(json.dumps(state["swarm"]))
elif args[:2] == ["swarm", "init"]:
    assert args == ["swarm", "init", "--advertise-addr", "10.0.0.10"]
    state["swarm"] = {"LocalNodeState": "active", "ControlAvailable": True}
elif args[:3] == ["node", "ls", "-q"]:
    print("\\n".join(state["nodes"]))
elif args[:2] == ["network", "ls"]:
    print("fellow-private" if state["network"] else "")
elif args[:2] == ["network", "create"]:
    assert args == ["network", "create", "--driver", "overlay", "--attachable", "fellow-private"]
    state["network"] = {"Driver": "overlay", "Attachable": True}
elif args[:2] == ["network", "inspect"]:
    print(json.dumps([state["network"]]))
elif args[:2] == ["volume", "ls"]:
    print("\\n".join(state["volumes"]))
elif args[:2] == ["volume", "create"]:
    assert args == ["volume", "create", "fellow-assets"]
    state["volumes"].append("fellow-assets")
else:
    raise SystemExit("Unexpected Docker invocation")
path.write_text(json.dumps(state))
"""


class SwarmTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.state_path = self.directory / "state.json"
        (self.directory / "docker").write_text(FAKE_DOCKER)
        (self.directory / "docker").chmod(0o700)
        (self.directory / "play.yml").write_text(
            textwrap.dedent("""\
            - name: Test Swarm resources
              hosts: localhost
              gather_facts: false
              vars:
                fellow_swarm_advertise_addr: 10.0.0.10
              tasks:
                - ansible.builtin.include_role:
                    name: swarm
                    tasks_from: resources
            """)
        )
        self.write_state()

    def write_state(self, **overrides: object) -> None:
        self.state_path.write_text(
            json.dumps(
                {
                    "swarm": {"LocalNodeState": "inactive", "ControlAvailable": False},
                    "nodes": ["node1"],
                    "network": None,
                    "volumes": [],
                    "calls": [],
                }
                | overrides
            )
        )

    def run_play(self, check: bool = False) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(PLAYBOOK), "-i", "localhost,", "-c", "local", str(self.directory / "play.yml")]
            + (["--check"] if check else []),
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
            env=os.environ
            | {
                "PATH": f"{self.directory}{os.pathsep}{os.environ['PATH']}",
                "FELLOW_TEST_STATE": str(self.state_path),
                "ANSIBLE_HOME": str(self.directory / "ansible-home"),
                "ANSIBLE_REMOTE_TMP": str(self.directory / "ansible-tmp"),
                "ANSIBLE_PYTHON_INTERPRETER": sys.executable,
                "ANSIBLE_ROLES_PATH": str(ROOT / "roles"),
            },
        )

    def test_initialization_and_repeated_run(self) -> None:
        first = self.run_play()
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        state = json.loads(self.state_path.read_text())
        self.assertEqual(state["swarm"]["LocalNodeState"], "active")
        self.assertEqual(state["network"], {"Driver": "overlay", "Attachable": True})
        self.assertEqual(state["volumes"], ["fellow-assets"])
        second = self.run_play()
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertIn("changed=0", second.stdout)
        calls = json.loads(self.state_path.read_text())["calls"]
        self.assertEqual(sum(call[:2] == ["swarm", "init"] for call in calls), 1)
        self.assertEqual(sum(call[:2] == ["network", "create"] for call in calls), 1)
        self.assertEqual(sum(call[:2] == ["volume", "create"] for call in calls), 1)

    def test_check_mode_does_not_initialize_swarm(self) -> None:
        result = self.run_play(check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        state = json.loads(self.state_path.read_text())
        self.assertEqual(state["swarm"]["LocalNodeState"], "inactive")
        self.assertEqual(len(state["calls"]), 1)

    def test_rejects_worker_multi_node_and_incompatible_network(self) -> None:
        active = {"LocalNodeState": "active", "ControlAvailable": True}
        for overrides in (
            {"swarm": {"LocalNodeState": "active", "ControlAvailable": False}},
            {"swarm": active, "nodes": ["node1", "node2"]},
            {"swarm": active, "network": {"Driver": "bridge", "Attachable": False}},
        ):
            with self.subTest(overrides=overrides):
                self.write_state(**overrides)
                result = self.run_play()
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                state = json.loads(self.state_path.read_text())
                self.assertFalse(any(call[1] in ("create", "init") for call in state["calls"]))

    def test_coi_takeover_requires_no_metadata_and_no_containers(self) -> None:
        for statuses, containers, expected in (
            ([404, 404], "", 0),
            ([200, 404], "", 2),
            ([404, 200], "", 2),
            ([404, 404], "existing-container", 2),
            ([503, 404], "", 2),
        ):
            with self.subTest(statuses=statuses, containers=containers):
                play = [
                    {
                        "hosts": "localhost",
                        "gather_facts": False,
                        "vars": {
                            "docker_coi_specs": {
                                "results": [{"status": status} for status in statuses]
                            },
                            "docker_coi_containers": {"stdout": containers},
                        },
                        "tasks": [
                            {
                                "ansible.builtin.include_role": {
                                    "name": "docker",
                                    "tasks_from": "assert-empty-coi",
                                }
                            }
                        ],
                    }
                ]
                (self.directory / "play.yml").write_text(json.dumps(play))
                result = self.run_play()
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
