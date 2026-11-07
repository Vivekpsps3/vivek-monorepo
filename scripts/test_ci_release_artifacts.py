import contextlib
import io
import unittest
from unittest.mock import patch

from scripts import ci_release_artifacts as cleanup

REPO = "owner/repo"


def artifact(artifact_id, run_id, **fields):
    return {
        "id": artifact_id,
        "name": cleanup.ARTIFACT_NAME,
        "created_at": f"2026-11-{artifact_id:02d}T00:00:00Z",
        "workflow_run": {"id": run_id},
        **fields,
    }


def run(run_id, **fields):
    return {
        "id": run_id,
        "repository": {"full_name": REPO},
        "head_repository": {"full_name": REPO},
        "event": "push",
        "head_branch": "main",
        "path": cleanup.WORKFLOW_PATH,
        "status": "completed",
        "conclusion": "success",
        **fields,
    }


class FakeGitHub(cleanup.GitHub):
    def __init__(self, rows, runs, pages=None):
        self.rows = rows
        self.runs = runs
        self.pages = pages
        self.gets = []
        self.deleted = []

    def get(self, path):
        self.gets.append(path)
        if path.startswith("/actions/artifacts?"):
            page = int(path.rsplit("=", 1)[1])
            value = self.pages[page - 1] if self.pages is not None else self.rows
            if isinstance(value, Exception):
                raise value
            return {"artifacts": value}
        value = self.runs[int(path.rsplit("/", 1)[1])]
        if isinstance(value, Exception):
            raise value
        return value

    def delete(self, artifact_id):
        self.deleted.append(artifact_id)


class ReleaseCleanupTests(unittest.TestCase):
    def invoke(self, api, *extra, env=None):
        with (
            patch.dict("os.environ", {"GH_TOKEN": "synthetic-token", **(env or {})}, clear=True),
            patch.object(cleanup, "GitHub", return_value=api),
            contextlib.redirect_stdout(io.StringIO()),
            contextlib.redirect_stderr(io.StringIO()),
        ):
            return cleanup.main(["--repo", REPO, "--current-run", "99", *extra])

    def test_dry_run_is_default_and_apply_preserves_success_and_current(self):
        api = FakeGitHub(
            [artifact(1, 1), artifact(2, 2), artifact(3, 3), artifact(4, 99)],
            {
                1: run(1),
                2: run(2),
                3: run(3, conclusion="failure"),
                99: run(99, status="in_progress", conclusion=None),
            },
        )
        self.assertEqual(cleanup.cleanup_plan(api, REPO, 99), [1, 3])
        self.assertEqual(self.invoke(api), 0)
        self.assertEqual(api.deleted, [])
        self.assertEqual(self.invoke(api, "--apply"), 0)
        self.assertEqual(api.deleted, [1, 3])

    def test_no_success_keeps_newest_trusted_run_and_all_its_uploads(self):
        api = FakeGitHub(
            [artifact(1, 1), artifact(2, 2), artifact(3, 2)],
            {1: run(1, conclusion="failure"), 2: run(2, conclusion="failure")},
        )
        self.assertEqual(cleanup.cleanup_plan(api, REPO, 99), [1])
        self.assertEqual(api.gets.count("/actions/runs/2"), 1)

    def test_untrusted_and_unknown_provenance_are_retained(self):
        variants: list[dict] = [
            {"repository": {"full_name": "other/repo"}},
            {"head_repository": {"full_name": "fork/repo"}},
            {"event": "pull_request"},
            {"event": "workflow_dispatch"},
            {"head_branch": "feature"},
            {"path": ".github/workflows/unrelated.yml"},
            {"id": 999},
            {"repository": None},
        ]
        rows = [artifact(index, index) for index in range(1, len(variants) + 1)]
        rows += [
            artifact(10, 10, workflow_run=None),
            artifact(11, 11, name="personal-site-release-extra"),
        ]
        api = FakeGitHub(rows, {i: run(i, **fields) for i, fields in enumerate(variants, 1)})
        self.assertEqual(cleanup.cleanup_plan(api, REPO, 99), [])
        self.assertNotIn("/actions/runs/11", api.gets)

    def test_pagination_fetches_remaining_artifacts_before_selecting_retention(self):
        first = [artifact(1, 1)] + [{"name": "unrelated"}] * 99
        api = FakeGitHub([], {1: run(1), 2: run(2)}, pages=[first, [artifact(2, 2)]])
        self.assertEqual(cleanup.cleanup_plan(api, REPO, 99), [1])
        self.assertIn("/actions/artifacts?per_page=100&page=2", api.gets)

    def test_fetch_errors_fail_closed_before_any_deletion(self):
        for api in [
            FakeGitHub(
                [],
                {},
                pages=[
                    [artifact(1, 1), *([{"name": "other"}] * 99)],
                    cleanup.CleanupError("page failed"),
                ],
            ),
            FakeGitHub(
                [artifact(1, 1), artifact(2, 2)], {1: run(1), 2: cleanup.CleanupError("run failed")}
            ),
        ]:
            with self.subTest(api=api):
                self.assertEqual(self.invoke(api, "--apply"), 1)
                self.assertEqual(api.deleted, [])

    def test_other_in_progress_trusted_uploads_are_not_deleted(self):
        api = FakeGitHub(
            [artifact(1, 1), artifact(2, 2), artifact(3, 3)],
            {1: run(1), 2: run(2, status="in_progress", conclusion=None), 3: run(3)},
        )
        self.assertEqual(cleanup.cleanup_plan(api, REPO, 99), [1])

    def test_http_errors_and_invalid_payloads_do_not_succeed(self):
        from urllib.error import URLError

        with (
            patch.object(cleanup, "urlopen", side_effect=URLError("synthetic outage")),
            self.assertRaises(cleanup.CleanupError),
        ):
            cleanup.GitHub(REPO, "synthetic-token").get("/actions/artifacts")
        with (
            patch.object(cleanup.GitHub, "_request", return_value=[]),
            self.assertRaises(cleanup.CleanupError),
        ):
            cleanup.GitHub(REPO, "synthetic-token").get("/actions/artifacts")

    def test_invalid_inventory_and_trusted_metadata_fail_closed(self):
        invalid_fields: list[dict] = [
            {"id": -1},
            {"id": True},
            {"created_at": "not-a-date"},
            {"created_at": "2026-01-01"},
        ]
        for fields in invalid_fields:
            api = FakeGitHub([artifact(1, 1, **fields)], {1: run(1)})
            with self.subTest(fields=fields):
                self.assertEqual(self.invoke(api, "--apply"), 1)
                self.assertEqual(api.deleted, [])

    def test_actions_apply_requires_push_main_and_matching_repository(self):
        trusted_env = {
            "GITHUB_ACTIONS": "true",
            "GITHUB_EVENT_NAME": "push",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_REPOSITORY": REPO,
        }
        for fields in [
            {"GITHUB_EVENT_NAME": "pull_request"},
            {"GITHUB_EVENT_NAME": "pull_request_target"},
            {"GITHUB_REF": "refs/heads/feature"},
            {"GITHUB_REPOSITORY": "other/repo"},
        ]:
            api = FakeGitHub([], {})
            self.assertEqual(self.invoke(api, "--apply", env={**trusted_env, **fields}), 1)
            self.assertEqual(api.gets, [])
            self.assertEqual(api.deleted, [])
        self.assertEqual(self.invoke(FakeGitHub([], {}), "--apply", env=trusted_env), 0)

    def test_cleanup_is_bounded_and_oldest_first(self):
        rows = [artifact(i, i, created_at="2026-11-01T00:00:00Z") for i in range(1, 106)]
        api = FakeGitHub([], {i: run(i) for i in range(1, 106)}, pages=[rows[:100], rows[100:]])
        plan = cleanup.cleanup_plan(api, REPO, 99)
        self.assertEqual(len(plan), cleanup.MAX_DELETIONS)
        self.assertEqual(plan[:2], [1, 2])
        self.assertNotIn(99, plan)
        self.assertNotIn(105, plan)


if __name__ == "__main__":
    unittest.main()
