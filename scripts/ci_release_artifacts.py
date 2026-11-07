"""Plan bounded cleanup of old, trusted CI release artifacts; dry run by default."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ARTIFACT_NAME = "personal-site-release"
WORKFLOW_PATH = ".github/workflows/ci.yml"
PAGE_SIZE = 100
MAX_PAGES = 100
MAX_DELETIONS = 100


class CleanupError(Exception):
    pass


class GitHub:
    def __init__(self, repo: str, token: str):
        self.root = f"https://api.github.com/repos/{repo}"
        self.token = token

    def _request(self, method: str, path: str):
        request = Request(
            self.root + path,
            method=method,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self.token}",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response) if method == "GET" else None
        except HTTPError as error:
            raise CleanupError(f"GitHub {method} failed with HTTP {error.code}") from None
        except (URLError, OSError, ValueError):
            raise CleanupError(f"GitHub {method} request failed") from None

    def get(self, path: str) -> dict:
        payload = self._request("GET", path)
        if not isinstance(payload, dict):
            raise CleanupError("GitHub returned an invalid response")
        return payload

    def delete(self, artifact_id: int) -> None:
        self._request("DELETE", f"/actions/artifacts/{artifact_id}")


def _positive_id(value: object) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise CleanupError("GitHub returned an invalid artifact or run ID")
    return value


def list_artifacts(api: GitHub) -> list[dict]:
    artifacts = []
    seen: set[int] = set()
    for page in range(1, MAX_PAGES + 1):
        payload = api.get(f"/actions/artifacts?per_page={PAGE_SIZE}&page={page}")
        rows = payload.get("artifacts")
        if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
            raise CleanupError("GitHub returned an invalid artifact inventory")
        for row in rows:
            if row.get("name") != ARTIFACT_NAME:
                continue
            artifact_id = _positive_id(row.get("id"))
            if artifact_id in seen:
                raise CleanupError("Artifact inventory changed during pagination; try again")
            seen.add(artifact_id)
            artifacts.append(row)
        if len(rows) < PAGE_SIZE:
            return artifacts
    raise CleanupError("Artifact inventory exceeds the bounded pagination limit")


def trusted_run(run: dict, repo: str, run_id: int) -> bool:
    repository = run.get("repository")
    head_repository = run.get("head_repository")
    return (
        run.get("id") == run_id
        and isinstance(repository, dict)
        and str(repository.get("full_name", "")).casefold() == repo.casefold()
        and isinstance(head_repository, dict)
        and str(head_repository.get("full_name", "")).casefold() == repo.casefold()
        and run.get("event") == "push"
        and run.get("head_branch") == "main"
        and run.get("path") == WORKFLOW_PATH
    )


def cleanup_plan(api: GitHub, repo: str, current_run: int) -> list[int]:
    """Read and validate the complete inventory/run provenance before any delete."""
    artifacts = list_artifacts(api)
    runs: dict[int, dict] = {}
    trusted: list[tuple[datetime, int, int, bool]] = []
    for artifact in artifacts:
        workflow_run = artifact.get("workflow_run")
        if not isinstance(workflow_run, dict) or workflow_run.get("id") is None:
            continue  # Unknown provenance is retained, never guessed.
        run_id = _positive_id(workflow_run["id"])
        if run_id not in runs:
            runs[run_id] = api.get(f"/actions/runs/{run_id}")
        run = runs[run_id]
        if not trusted_run(run, repo, run_id):
            continue
        try:
            created = datetime.fromisoformat(str(artifact["created_at"]).replace("Z", "+00:00"))
            if created.tzinfo is None:
                raise ValueError("Missing timezone")
        except (KeyError, ValueError):
            raise CleanupError("A trusted artifact has an invalid creation timestamp") from None
        success = run.get("status") == "completed" and run.get("conclusion") == "success"
        trusted.append((created, _positive_id(artifact["id"]), run_id, success))
    if not trusted:
        return []
    # Keep a known-good release even if a newer upload came from a failed run.
    successful = [artifact for artifact in trusted if artifact[3]]
    keep_run = max(successful or trusted)[2]
    # Preserve every artifact of the protected runs, including rerun uploads.
    return [
        artifact_id
        for _created, artifact_id, run_id, _success in sorted(trusted)
        if run_id not in {current_run, keep_run} and runs[run_id].get("status") == "completed"
    ][:MAX_DELETIONS]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="GitHub owner/repository")
    parser.add_argument("--current-run", required=True, type=int)
    parser.add_argument("--apply", action="store_true", help="Delete the planned artifacts")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", args.repo, flags=re.ASCII) or any(
        part in {".", ".."} for part in args.repo.split("/")
    ):
        parser.error("--repo must be owner/repository")
    if args.current_run <= 0:
        parser.error("--current-run must be positive")
    try:
        if (
            args.apply
            and os.environ.get("GITHUB_ACTIONS")
            and (
                os.environ.get("GITHUB_EVENT_NAME") != "push"
                or os.environ.get("GITHUB_REF") != "refs/heads/main"
                or os.environ.get("GITHUB_REPOSITORY", "").casefold() != args.repo.casefold()
            )
        ):
            raise CleanupError("Actions cleanup requires a push to this repository's main branch")
        token = os.environ.get("GH_TOKEN")
        if not token:
            raise CleanupError("GH_TOKEN is required")
        api = GitHub(args.repo, token)
        plan = cleanup_plan(api, args.repo, args.current_run)
        print(json.dumps({"apply": args.apply, "artifact_ids": plan, "limit": MAX_DELETIONS}))
        if args.apply:
            for artifact_id in plan:
                api.delete(artifact_id)
        return 0
    except CleanupError as error:
        print(f"Release artifact cleanup stopped: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
