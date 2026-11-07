import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

RELEASE = "a" * 40
PREVIOUS = "b" * 40
SCRIPT = Path(__file__).with_name("deploy-site.sh")
FAKE_TOOL = r"""#!/usr/bin/env python3
import json, os, pathlib, sys
tool = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
if tool == "git":
    print(os.environ["CHECKOUT_SHA"])
elif tool == "curl":
    print(json.dumps({"status": "ok", "release": os.environ["RELEASE"]}))
elif tool == "docker":
    with open(os.environ["CALLS"], "a") as log:
        log.write(json.dumps(args) + "\n")
    stage = args[0]
    if stage == "inspect":
        print("sha256:previous")
    elif stage == "image":
        print(os.environ["PREVIOUS"] if args[2] == "sha256:previous" else os.environ["IMAGE_SHA"])
    elif stage == "run" and args[-1] == "/app/compose.yml":
        print("services: {}")
    elif stage == "compose":
        stage = "up" if "up" in args else args[-1]
    if stage == os.environ.get("FAIL_STAGE"):
        # Fail the new rollout once; allow the previous image to restart.
        marker = pathlib.Path(os.environ["FAIL_MARKER"])
        if not marker.exists():
            marker.touch()
            sys.exit(1)
"""


class DeploySiteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        self.script = self.root / "scripts/deploy-site.sh"
        # Keep tests independent of the production deployment lock.
        self.script.write_text(
            SCRIPT.read_text().replace(
                "/tmp/personal-site-deploy.lock", str(self.root / "deploy.lock")
            )
        )
        tools = self.root / "bin"
        tools.mkdir()
        for name in ("docker", "git", "curl"):
            tool = tools / name
            tool.write_text(FAKE_TOOL)
            tool.chmod(0o755)
        self.env = {
            **os.environ,
            "PATH": f"{tools}:{os.environ['PATH']}",
            "DOCKER_COMMAND": "docker",
            "CHECKOUT_SHA": RELEASE,
            "IMAGE_SHA": RELEASE,
            "RELEASE": RELEASE,
            "PREVIOUS": PREVIOUS,
            "CALLS": str(self.root / "calls.jsonl"),
            "FAIL_MARKER": str(self.root / "failed"),
        }

    def deploy(self, **env):
        result = subprocess.run(
            ["bash", str(self.script), RELEASE],
            env={**self.env, **env},
            capture_output=True,
            text=True,
            timeout=10,
        )
        log = self.root / "calls.jsonl"
        calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        return result, calls

    def test_rebuilds_before_checks_backup_migration_and_start(self):
        result, calls = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        build = next(i for i, call in enumerate(calls) if call[0] == "build")
        check = next(i for i, call in enumerate(calls) if call[-1] == "apps.server.checks")
        backup = next(i for i, call in enumerate(calls) if call[-1] == "backup")
        migrate = next(i for i, call in enumerate(calls) if call[-1] == "migrate")
        start = next(i for i, call in enumerate(calls) if "up" in call)
        self.assertLess(build, check)
        self.assertLess(check, backup)
        self.assertLess(backup, migrate)
        self.assertLess(migrate, start)
        self.assertIn(f"SITE_RELEASE={RELEASE}", calls[build])
        self.assertEqual(calls[build][-1], str(self.root))

    def test_wrong_checkout_never_touches_docker(self):
        result, calls = self.deploy(CHECKOUT_SHA=PREVIOUS)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])

    def test_failed_build_or_wrong_image_never_touches_production_data(self):
        for env in ({"FAIL_STAGE": "build"}, {"IMAGE_SHA": PREVIOUS}):
            with self.subTest(env=env):
                (self.root / "calls.jsonl").unlink(missing_ok=True)
                result, calls = self.deploy(**env)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(call[0] == "compose" for call in calls))

    def test_backup_or_migration_failure_never_replaces_running_container(self):
        for stage in ("backup", "migrate"):
            with self.subTest(stage=stage):
                (self.root / "calls.jsonl").unlink(missing_ok=True)
                (self.root / "failed").unlink(missing_ok=True)
                result, calls = self.deploy(FAIL_STAGE=stage)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any("up" in call for call in calls))
                if stage == "backup":
                    self.assertFalse(any(call[-1] == "migrate" for call in calls))

    def test_failed_start_restores_previous_image_and_compose_definition(self):
        result, calls = self.deploy(FAIL_STAGE="up", RELEASE=PREVIOUS)
        self.assertNotEqual(result.returncode, 0)
        starts = [call for call in calls if "up" in call]
        self.assertEqual(len(starts), 2)
        self.assertTrue(any(arg.endswith("/previous.yml") for arg in starts[-1]))
        self.assertTrue(any(call[:3] == ["image", "inspect", "sha256:previous"] for call in calls))
