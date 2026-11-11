"""Behavioral fixtures for trusted runner routing and the production deploy guard."""

import ast
import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPOSITORY = "Vivekpsps3/vivek-monorepo"
SHA = "a" * 40
OTHER = "b" * 40
RUN_ON = re.compile(
    r"runs-on: \$\{\{ fromJSON\(\(github\.event_name != 'pull_request' \|\| "
    r"github\.event\.pull_request\.head\.repo\.full_name == github\.repository\) && "
    r"'(?P<trusted>\[[^\']+\])' \|\| '(?P<hosted>\[[^\']+\])'\) \}\}"
)
SECRET = re.compile(r"ghp_|github_pat_|gho_|AKIA|BEGIN (?:RSA |OPENSSH )?PRIVATE")
IPV4 = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")

FAKE_GH = """#!/usr/bin/env python3
import json, os, subprocess, sys
url = sys.argv[2]
with open(os.environ["GH_LOG"], "a", encoding="utf-8") as log:
    log.write(url + "\\n")
jq = sys.argv[sys.argv.index("--jq") + 1]
if url.endswith("/git/ref/heads/main"):
    data = {"object": {"sha": os.environ["FIXTURE_MAIN"]}}
elif "/actions/workflows/ci.yml/runs?" in url:
    data = json.loads(os.environ["FIXTURE_RUNS"])
elif "/jobs?" in url:
    data = json.loads(os.environ["FIXTURE_JOBS"])
else:
    sys.stderr.write("unexpected " + url + "\\n")
    sys.exit(3)
proc = subprocess.run(
    ["jq", "-r", jq],
    input=json.dumps(data),
    text=True,
    capture_output=True,
)
sys.stdout.write(proc.stdout)
sys.stderr.write(proc.stderr)
sys.exit(proc.returncode)
"""


def workflow_jobs(text):
    body = text.split("\njobs:\n", 1)[1]
    found = {}
    for chunk in re.split(r"\n(?=  [A-Za-z0-9_-]+:\n)", body):
        match = re.match(r"  ([A-Za-z0-9_-]+):\n", chunk)
        if match:
            found[match.group(1)] = chunk
    return found


def runs_on_line(job):
    match = re.search(r"(?m)^    runs-on: (.+)$", job)
    if match is None:
        raise AssertionError("job has no runs-on")
    return match.group(1)


def route(expression, event_name, head_repo):
    match = RUN_ON.search(f"runs-on: {expression}")
    if match is None:
        raise AssertionError("runs-on is not the trusted/fork selector")
    trusted = json.loads(match.group("trusted"))
    hosted = json.loads(match.group("hosted"))
    same = head_repo is not None and head_repo == REPOSITORY
    return trusted if event_name != "pull_request" or same else hosted


def deploy_allowed(expression, event_name, conclusion, trigger_event, head_repo, ref):
    folded = re.search(r"if: >-\n((?:      .+\n)+)", expression)
    if folded is None:
        raise AssertionError("deploy job is missing its if condition")
    expr = " ".join(line.strip() for line in folded.group(1).splitlines())
    replacements = (
        ("github.event.workflow_run.head_repository.full_name", "head_repo"),
        ("github.event.workflow_run.conclusion", "conclusion"),
        ("github.event.workflow_run.event", "trigger_event"),
        ("github.event_name", "event_name"),
        ("github.repository", "repository"),
        ("github.ref", "ref"),
    )
    for source, name in replacements:
        expr = expr.replace(source, name)
    expr = expr.replace("&&", " and ").replace("||", " or ")
    tree = ast.parse(expr, mode="eval")
    allowed = (
        ast.Expression,
        ast.BoolOp,
        ast.And,
        ast.Or,
        ast.Compare,
        ast.Eq,
        ast.Name,
        ast.Constant,
        ast.Load,
    )
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id not in {
            "head_repo",
            "conclusion",
            "trigger_event",
            "event_name",
            "repository",
            "ref",
        }:
            raise AssertionError(node.id)
        if not isinstance(node, allowed):
            raise AssertionError(type(node).__name__)
    return bool(
        eval(
            compile(tree, "<deploy-if>", "eval"),
            {"__builtins__": {}},
            {
                "event_name": event_name,
                "conclusion": conclusion,
                "trigger_event": trigger_event,
                "head_repo": head_repo,
                "repository": REPOSITORY,
                "ref": ref,
            },
        )
    )


def run_script(text, step_name):
    rest = text.split(f"      - name: {step_name}\n", 1)[1]
    lines = rest.split("        run: |\n", 1)[1].splitlines()
    body = []
    for line in lines:
        if line.startswith("          "):
            body.append(line[10:])
        elif line.strip() == "":
            body.append("")
        else:
            break
    return "\n".join(body) + "\n"


def service_block(text, name):
    match = re.search(rf"(?ms)^  {name}:\n(.*?)(?=^  [a-z0-9-]+:\n|^volumes:)", text)
    if match is None:
        raise AssertionError(name)
    return match.group(1)


class RoutingContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ci = (ROOT / ".github/workflows/ci.yml").read_text()
        cls.deploy = (ROOT / ".github/workflows/deploy.yml").read_text()
        cls.runner = (ROOT / "docs/LOCAL-RUNNER.md").read_text()
        cls.operations = (ROOT / "docs/OPERATIONS.md").read_text()
        cls.followups = (ROOT / "docs/SRE-FOLLOWUPS.md").read_text()
        cls.compose = (ROOT / "ops/actions-runner/compose.yml").read_text()
        cls.register = (ROOT / "ops/actions-runner/register.sh").read_text()
        cls.pool = (ROOT / "ops/actions-runner/pool.sh").read_text()
        cls.jobs = workflow_jobs(cls.ci)

    def test_push_and_same_repository_use_trusted_labels(self):
        cases = (
            ("push", None, "backend", "monorepo-ci"),
            ("push", "other/fork", "frontend", "monorepo-ci"),
            ("pull_request", REPOSITORY, "playwright", "monorepo-ci"),
            ("pull_request", REPOSITORY, "unified", "monorepo-ci-release"),
        )
        for event, head, job, label in cases:
            with self.subTest(event=event, job=job):
                labels = route(runs_on_line(self.jobs[job]), event, head)
                self.assertIn(label, labels)
                self.assertNotIn("ubuntu-latest", labels)
                self.assertNotIn("monorepo-prod", labels)

    def test_fork_and_missing_head_stay_on_hosted_runners(self):
        for head in ("other/fork", None):
            for job in ("backend", "frontend", "playwright", "unified"):
                with self.subTest(head=head, job=job):
                    labels = route(runs_on_line(self.jobs[job]), "pull_request", head)
                    self.assertEqual(labels, ["ubuntu-latest"])

    def test_push_branches_and_release_job_name_stay_narrow(self):
        self.assertIn("\n      - main\n      - master\n", self.ci)
        self.assertNotIn("monorepo-prod", self.ci)
        self.assertIn("name: Unified Site Release\n", self.ci)
        self.assertIn("name: Seeded schema rehearsals\n", self.ci)

    def test_production_job_rejects_forks_failures_and_other_branches(self):
        job = workflow_jobs(self.deploy)["deploy"]
        self.assertEqual(runs_on_line(job), "[self-hosted, linux, monorepo-prod]")
        allowed = (
            ("workflow_run", "success", "push", REPOSITORY, "refs/heads/main"),
            ("workflow_dispatch", "", "", "", "refs/heads/main"),
        )
        rejected = (
            ("workflow_run", "failure", "push", REPOSITORY, "refs/heads/main"),
            ("workflow_run", "success", "pull_request", REPOSITORY, "refs/heads/main"),
            ("workflow_run", "success", "push", "other/fork", "refs/heads/main"),
            ("workflow_run", "success", "push", None, "refs/heads/main"),
            ("workflow_dispatch", "success", "push", REPOSITORY, "refs/heads/topic"),
            ("pull_request", "success", "push", REPOSITORY, "refs/heads/main"),
        )
        for event, conclusion, trigger, head, ref in allowed:
            with self.subTest(event=event, expect=True):
                self.assertTrue(deploy_allowed(job, event, conclusion, trigger, head, ref))
        for event, conclusion, trigger, head, ref in rejected:
            with self.subTest(event=event, trigger=trigger, head=head, ref=ref):
                self.assertFalse(deploy_allowed(job, event, conclusion, trigger, head, ref))

    def test_manual_run_rejects_a_newer_failure_and_a_stale_sha(self):
        runs = {
            "workflow_runs": [
                {"id": 2, "head_sha": SHA, "conclusion": "failure", "event": "push"},
                {"id": 1, "head_sha": SHA, "conclusion": "success", "event": "push"},
            ]
        }
        result = self.run_guard("workflow_dispatch", SHA, SHA, runs, {})
        self.assertNotEqual(result["resolve"].returncode, 0)
        self.assertIn("concluded 'failure'", result["resolve"].stderr)
        self.assertTrue(result["urls"])
        self.assertIn(f"head_sha={SHA}", result["urls"][0])
        self.assertNotIn("status=success", result["urls"][0])
        self.assertNotIn("sha=", result["output"])

        stale = self.run_guard(
            "workflow_dispatch", SHA, OTHER, self.success_runs(), self.success_jobs()
        )
        self.assertNotEqual(stale["resolve"].returncode, 0)
        self.assertNotIn("sha=", stale["output"])

    def test_latest_success_still_requires_the_last_rehearsal_attempt(self):
        failed_later = self.run_guard(
            "workflow_dispatch",
            SHA,
            SHA,
            self.success_runs(),
            self.jobs_with(("success", "failure")),
        )
        self.assertEqual(failed_later["resolve"].returncode, 0)
        self.assertNotEqual(failed_later["rehearsal"].returncode, 0)
        self.assertIn("refusing to deploy", failed_later["rehearsal"].stderr)

        missing = self.run_guard("workflow_dispatch", SHA, SHA, self.success_runs(), {"jobs": []})
        self.assertNotEqual(missing["rehearsal"].returncode, 0)

        null_steps = self.run_guard(
            "workflow_dispatch",
            SHA,
            SHA,
            self.success_runs(),
            {"jobs": [{"name": "Unified Site Release", "steps": None}]},
        )
        self.assertNotEqual(null_steps["rehearsal"].returncode, 0)

        promoted = self.run_guard(
            "workflow_dispatch",
            SHA,
            SHA,
            self.success_runs(),
            self.jobs_with(("failure", "success")),
        )
        self.assertEqual(promoted["resolve"].returncode, 0, promoted["resolve"].stderr)
        self.assertEqual(promoted["rehearsal"].returncode, 0, promoted["rehearsal"].stderr)
        self.assertIn(f"sha={SHA}", promoted["output"])
        self.assertIn("run_id=8", promoted["output"])

    def test_workflow_run_still_rejects_a_stale_or_untested_sha(self):
        bad = self.run_guard(
            "workflow_run", "not-a-sha", SHA, self.success_runs(), self.success_jobs(), ci_run="8"
        )
        self.assertNotEqual(bad["resolve"].returncode, 0)
        self.assertEqual(bad["urls"], [])

        stale = self.run_guard(
            "workflow_run", SHA, OTHER, self.success_runs(), self.success_jobs(), ci_run="8"
        )
        self.assertNotEqual(stale["resolve"].returncode, 0)
        self.assertFalse(any("ci.yml/runs" in url for url in stale["urls"]))

        empty_run = self.run_guard(
            "workflow_run", SHA, SHA, self.success_runs(), self.success_jobs(), ci_run=""
        )
        self.assertNotEqual(empty_run["resolve"].returncode, 0)

        ok = self.run_guard(
            "workflow_run", SHA, SHA, self.success_runs(), self.success_jobs(), ci_run="8"
        )
        self.assertEqual(ok["resolve"].returncode, 0, ok["resolve"].stderr)
        self.assertEqual(ok["rehearsal"].returncode, 0, ok["rehearsal"].stderr)
        self.assertFalse(any("status=success" in url for url in ok["urls"]))

    def test_checkout_and_rollback_restrictions_remain(self):
        self.assertIn('test "$(git -C "$source_dir" rev-parse HEAD)" = "$RELEASE"', self.deploy)
        self.assertIn('scripts/deploy-site.sh" "$RELEASE"', self.deploy)
        script = (ROOT / "scripts/deploy-site.sh").read_text()
        self.assertIn('test "$(git -C "$root" rev-parse HEAD)" = "$release"', script)
        self.assertIn("previous.yml", script)
        self.assertIn("python -m apps.server.checks", script)

    def test_one_command_owner_and_no_copied_host_authority(self):
        names = sorted(
            path.name
            for path in (ROOT / "ops/actions-runner").iterdir()
            if path.is_file() and path.name != "test_routing.py"
        )
        self.assertEqual(
            names,
            ["Dockerfile", "compose.yml", "entrypoint.sh", "pool.sh", "register.sh"],
        )
        self.assertIn("entrypoint.sh", (ROOT / "ops/actions-runner/Dockerfile").read_text())
        self.assertIn("build: .", self.compose)
        self.assertIn("./ops/actions-runner/pool.sh start", self.runner)
        self.assertIn("./ops/actions-runner/register.sh release", self.runner)
        self.assertNotIn("deploy-site.sh", self.runner)
        self.assertNotIn("pool.sh", self.operations)
        self.assertIn("scripts/deploy-site.sh", self.operations)
        self.assertIn("## Dependency and image review", self.operations)
        self.assertIn("No update controller is installed.", self.operations)
        self.assertIn("No second logger is added.", self.operations)
        self.assertFalse((ROOT / ".github/dependabot.yml").exists())
        self.assertIn("OPERATIONS.md#dependency-and-image-review", self.followups)
        self.assertNotIn("docker compose -f ops/actions-runner/compose.yml build", self.followups)
        for banned in ("64 GiB", "12-thread", "amd7600-server", "2560", "30 GiB"):
            self.assertNotIn(banned, self.runner)
        self.assertIn("runner_label=monorepo-ci-release", self.register)
        self.assertIn("runner_label=monorepo-ci\n", self.register)
        self.assertNotIn("monorepo-prod", self.register)
        self.assertNotIn("down -v", self.pool)
        worker = service_block(self.compose, "worker")
        runner = service_block(self.compose, "runner")
        daemon = service_block(self.compose, "docker")
        self.assertNotIn("docker.sock", worker)
        self.assertNotIn("docker-socket", worker)
        self.assertNotIn("privileged", worker)
        self.assertIn("privileged: true", daemon)
        self.assertIn("network_mode: service:docker", runner)
        self.assertIn("cpus:", worker)
        self.assertIn("mem_limit:", worker)
        self.assertIn("`cpus`, `mem_limit`, and `logging`", self.runner)
        for label in ("monorepo-ci", "monorepo-ci-release", "monorepo-prod", "ubuntu-latest"):
            self.assertIn(f"`{label}`", self.runner)

    def test_published_docs_do_not_carry_secrets_or_new_addresses(self):
        for path in (
            ROOT / "docs/LOCAL-RUNNER.md",
            ROOT / "docs/OPERATIONS.md",
            ROOT / "docs/SRE-FOLLOWUPS.md",
            ROOT / ".github/workflows/ci.yml",
            ROOT / ".github/workflows/deploy.yml",
        ):
            text = path.read_text()
            self.assertIsNone(SECRET.search(text), path)
        self.assertIsNone(IPV4.search(self.runner))
        self.assertNotIn("notification destination is configured", self.operations)

    def success_runs(self):
        return {
            "workflow_runs": [{"id": 8, "head_sha": SHA, "conclusion": "success", "event": "push"}]
        }

    def success_jobs(self):
        return self.jobs_with(("success",))

    def jobs_with(self, conclusions):
        return {
            "jobs": [
                {
                    "name": "Unified Site Release",
                    "steps": [
                        {"name": "Seeded schema rehearsals", "conclusion": conclusion}
                        for conclusion in conclusions
                    ],
                }
            ]
        }

    def run_guard(self, event, sha, main, runs, jobs, ci_run="8"):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            gh = root / "gh"
            gh.write_text(FAKE_GH)
            gh.chmod(0o755)
            output = root / "github-output.txt"
            output.write_text("")
            log = root / "gh-log.txt"
            env = {
                "PATH": f"{root}:/usr/bin:/bin",
                "HOME": temporary,
                "EVENT": event,
                "REPOSITORY": REPOSITORY,
                "CI_SHA": sha,
                "CI_RUN": ci_run,
                "MANUAL_SHA": sha,
                "GITHUB_OUTPUT": str(output),
                "GH_LOG": str(log),
                "FIXTURE_MAIN": main,
                "FIXTURE_RUNS": json.dumps(runs),
                "FIXTURE_JOBS": json.dumps(jobs),
            }
            resolve = self.bash(
                run_script(self.deploy, "Resolve tested release and reject stale candidates"), env
            )
            urls = log.read_text().splitlines() if log.exists() else []
            rehearsal_env = dict(env)
            run_id = ""
            for line in output.read_text().splitlines():
                if line.startswith("run_id="):
                    run_id = line.split("=", 1)[1]
            rehearsal_env["RUN_ID"] = run_id
            rehearsal = self.bash(
                run_script(self.deploy, "Require the seeded schema rehearsal"), rehearsal_env
            )
            return {
                "resolve": resolve,
                "rehearsal": rehearsal,
                "output": output.read_text(),
                "urls": urls,
            }

    def bash(self, script, env):
        return subprocess.run(
            ["bash", "-c", script],
            env=env,
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )


if __name__ == "__main__":
    unittest.main()
