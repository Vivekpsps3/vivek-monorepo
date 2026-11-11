#!/usr/bin/env python3
"""Fail when a shipped source has no lint or type owner.

Owners are the ESLint scopes in ``quality_ratchet.py``, the tsconfig
projects named by the ``typecheck-web`` recipe, and the ruff/mypy directory
list. Import traversal is not an owner. Vendor directories, generated
``.d.ts`` emit, tests, and applied Alembic revisions are excluded by those
reasons and do not hide a neighboring production file.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {
    ".git",
    ".venv",
    ".angular",
    "__pycache__",
    "node_modules",
    "dist",
    "coverage",
    "playwright-report",
    "test-results",
}
SOURCE_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".html", ".mts"}
TEST_SEGMENTS = {"tests", "e2e", "__tests__"}
WALK_ROOTS = ("apps", "packages", "scripts")

NODE_CONFIG = r"""
const config = require('./eslint.config.js');
const blocks = [];
const globalIgnores = [];
for (const block of config) {
  if (!block || typeof block !== 'object') continue;
  const ignores = block.ignores == null ? [] : [].concat(block.ignores);
  if (block.files == null) {
    for (const pattern of ignores) globalIgnores.push(pattern);
    continue;
  }
  blocks.push({files: [].concat(block.files), ignores});
}
process.stdout.write(JSON.stringify({blocks, globalIgnores}));
"""


def load_ratchet():
    path = Path(__file__).resolve().parent / "quality_ratchet.py"
    spec = importlib.util.spec_from_file_location("quality_ratchet_for_inventory", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def glob_to_regex(pattern: str) -> re.Pattern[str]:
    parts: list[str] = []
    index = 0
    while index < len(pattern):
        if pattern.startswith("**/", index):
            parts.append("(?:.*/)?")
            index += 3
        elif pattern.startswith("**", index):
            parts.append(".*")
            index += 2
        elif pattern[index] == "*":
            parts.append("[^/]*")
            index += 1
        elif pattern[index] == "?":
            parts.append("[^/]")
            index += 1
        else:
            parts.append(re.escape(pattern[index]))
            index += 1
    return re.compile("^" + "".join(parts) + "$")


_GLOB_CACHE: dict[str, re.Pattern[str]] = {}


def glob_match(path: str, pattern: str) -> bool:
    compiled = _GLOB_CACHE.get(pattern)
    if compiled is None:
        compiled = glob_to_regex(pattern)
        _GLOB_CACHE[pattern] = compiled
    return compiled.fullmatch(path) is not None


def any_glob(path: str, patterns: list[str] | tuple[str, ...]) -> str | None:
    for pattern in patterns:
        if glob_match(path, pattern):
            return pattern
    return None


def classify(relative: str, excluded_dir) -> tuple[str, str]:
    """Return ``(kind, reason)``. ``kind`` is ``production`` or an exclusion."""
    parts = relative.split("/")
    name = parts[-1]
    if "vendor" in parts[:-1]:
        return ("vendor", "third-party source in a vendor directory")
    if "generated" in parts[:-1] or name.endswith(".d.ts"):
        return ("generated", "generated declaration or emit, not a shipped implementation")
    if any(part in TEST_SEGMENTS for part in parts[:-1]):
        return ("test", "test or end-to-end source")
    if ".test." in name or ".spec." in name or name.startswith("playwright.config."):
        return ("test", "test file")
    if (
        name == "conftest.py"
        or (name.startswith("test_") and name.endswith(".py"))
        or name.endswith("_test.py")
    ):
        return ("test", "Python test module")
    if excluded_dir(relative) or any(
        excluded_dir("/".join(parts[:end])) for end in range(1, len(parts))
    ):
        return ("migration", "applied Alembic revision")
    return ("production", "shipped or support source")


def owners_needed(relative: str) -> set[str]:
    name = relative.rsplit("/", 1)[-1]
    if name.endswith(".py"):
        return {"ruff", "mypy"}
    if name.endswith(".html"):
        return {"eslint"}
    if name.endswith(".d.mts"):
        return {"typecheck"}
    if name.endswith((".ts", ".tsx", ".mts", ".js", ".mjs", ".cjs")):
        return {"eslint", "typecheck"}
    return set()


def repo_glob(config: Path, pattern: str, root: Path) -> str:
    base = list(config.parent.relative_to(root).parts)
    parts: list[str] = []
    for part in pattern.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if parts:
                parts.pop()
            elif base:
                base.pop()
            else:
                raise ValueError(f"{config}: cannot resolve {pattern}")
            continue
        parts.append(part)
    return "/".join([*base, *parts])


@dataclass(frozen=True)
class TsProject:
    name: str
    includes: tuple[str, ...]
    excludes: tuple[str, ...]
    allow_js: bool


@dataclass(frozen=True)
class ToolOwners:
    eslint_patterns: tuple[str, ...]
    config_blocks: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...]
    global_ignores: tuple[str, ...]
    projects: tuple[TsProject, ...]
    python_targets: tuple[str, ...]


def typecheck_projects(makefile: str) -> list[str]:
    collecting = False
    projects: list[str] = []
    for line in makefile.splitlines():
        if line.startswith("typecheck-web:"):
            collecting = True
            continue
        if not collecting:
            continue
        if line and not line.startswith(("\t", " ")):
            break
        projects.extend(re.findall(r"tsc\s+-p\s+(\S+)", line))
    return projects


def _string_list(value: object, label: str) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return list(value)
    raise SystemExit(f"{label} must be a list of strings")


def _load_tsconfig(path: Path) -> dict[str, object]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise SystemExit(f"{path}: expected an object")
    options: dict[str, object] = {}
    include = raw.get("include")
    exclude = raw.get("exclude")
    files = raw.get("files")
    extends = raw.get("extends")
    if isinstance(extends, str):
        parent = _load_tsconfig((path.parent / extends).resolve())
        parent_options = parent["options"]
        if isinstance(parent_options, dict):
            options.update(parent_options)
        if include is None:
            include = parent["include"]
        if exclude is None:
            exclude = parent["exclude"]
        if files is None:
            files = parent["files"]
    child_options = raw.get("compilerOptions") or {}
    if not isinstance(child_options, dict):
        raise SystemExit(f"{path}: compilerOptions must be an object")
    options.update(child_options)
    return {
        "options": options,
        "include": _string_list(include, f"{path} include"),
        "exclude": _string_list(exclude, f"{path} exclude"),
        "files": _string_list(files, f"{path} files"),
    }


def project_from_config(root: Path, relative_config: str) -> TsProject:
    path = root / relative_config
    loaded = _load_tsconfig(path)
    include = loaded["include"]
    files = loaded["files"]
    exclude = loaded["exclude"]
    if (
        not isinstance(include, list)
        or not isinstance(files, list)
        or not isinstance(exclude, list)
    ):
        raise SystemExit(f"{path}: include, files, and exclude must be lists")
    includes = [repo_glob(path, pattern, root) for pattern in [*include, *files]]
    excludes = [repo_glob(path, pattern, root) for pattern in exclude]
    options = loaded["options"]
    allow_js = bool(options.get("allowJs")) if isinstance(options, dict) else False
    return TsProject(relative_config, tuple(includes), tuple(excludes), allow_js)


def eslint_config(
    root: Path,
) -> tuple[list[tuple[tuple[str, ...], tuple[str, ...]]], tuple[str, ...]]:
    completed = subprocess.run(
        ["node", "-e", NODE_CONFIG],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        sys.stderr.write(completed.stderr)
        raise SystemExit(completed.returncode or 1)
    payload = json.loads(completed.stdout)
    blocks = []
    for block in payload["blocks"]:
        blocks.append((tuple(block["files"]), tuple(block["ignores"])))
    return blocks, tuple(payload["globalIgnores"])


def load_owners(root: Path = ROOT) -> ToolOwners:
    ratchet = load_ratchet()
    patterns: list[str] = []
    for tool in ratchet.ESLINT_SCOPES:
        patterns.extend(ratchet.eslint_patterns(tool))
    blocks, ignores = eslint_config(root)
    makefile = (root / "Makefile").read_text(encoding="utf-8")
    projects = tuple(project_from_config(root, name) for name in typecheck_projects(makefile))
    if not projects:
        raise SystemExit("typecheck-web did not name any tsc project")
    return ToolOwners(
        tuple(patterns),
        tuple(blocks),
        ignores,
        projects,
        tuple(ratchet.PYTHON_TARGETS),
    )


def python_owned(relative: str, owners: ToolOwners) -> bool:
    return any(
        relative == target or relative.startswith(target + "/") for target in owners.python_targets
    )


def eslint_owned(relative: str, owners: ToolOwners) -> bool:
    if any_glob(relative, owners.global_ignores):
        return False
    if any_glob(relative, owners.eslint_patterns) is None:
        return False
    for files, ignores in owners.config_blocks:
        if any_glob(relative, ignores):
            continue
        if any_glob(relative, files):
            return True
    return False


def typecheck_owned(relative: str, owners: ToolOwners) -> str | None:
    javascript = relative.endswith((".js", ".mjs", ".cjs"))
    for project in owners.projects:
        if javascript and not project.allow_js:
            continue
        if any_glob(relative, project.excludes):
            continue
        if any_glob(relative, project.includes):
            return project.name
    return None


def gap_message(relative: str, owners: ToolOwners, excluded_dir) -> str | None:
    kind, _reason = classify(relative, excluded_dir)
    if kind != "production":
        return None
    missing: list[str] = []
    needed = owners_needed(relative)
    if "eslint" in needed and not eslint_owned(relative, owners):
        missing.append("eslint")
    if "typecheck" in needed and typecheck_owned(relative, owners) is None:
        missing.append("typecheck")
    if "ruff" in needed and not python_owned(relative, owners):
        missing.extend(["ruff", "mypy"])
    if not missing:
        return None
    return f"{relative}: missing {', '.join(missing)}"


def iter_sources(root: Path) -> list[str]:
    found: list[str] = []
    for base_name in WALK_ROOTS:
        base = root / base_name
        if not base.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [name for name in dirnames if name not in SKIP_DIRS]
            for name in filenames:
                suffix = Path(name).suffix
                if suffix not in SOURCE_SUFFIXES and not name.endswith(".d.mts"):
                    continue
                found.append(Path(dirpath, name).relative_to(root).as_posix())
    return found


def scan(root: Path = ROOT, owners: ToolOwners | None = None) -> list[str]:
    ratchet = load_ratchet()
    active = owners if owners is not None else load_owners(root)
    gaps = [
        message
        for relative in iter_sources(root)
        if (message := gap_message(relative, active, ratchet.excluded_dir))
    ]
    return gaps


def main() -> int:
    gaps = scan(ROOT)
    if gaps:
        print(f"shipped sources missing a tool owner ({len(gaps)}):", file=sys.stderr)
        for message in gaps:
            print(f"  {message}", file=sys.stderr)
        return 1
    print("shipped sources have lint and type owners")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
