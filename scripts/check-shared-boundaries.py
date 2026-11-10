#!/usr/bin/env python3
"""Check package, app, and nested feature imports against one resolved graph.

Python imports come from ``ast`` (including package-relative imports and
literal ``import_module`` / ``__import__`` calls). TypeScript and JavaScript
imports are parsed and resolved by ``resolve-ts-imports.mjs`` through the
TypeScript compiler already installed for this repo. Comments and ordinary
strings are not imports. The policy in this file is the only ownership
implementation: the Node helper only reports resolved edges.

Sinks and generic Finance UI selectors stay text scans. Their scope is Finance
frontend source plus package ``src`` trees, and the known generic Finance UI
paths. They do not cover Travel, Media, or the server.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".mts", ".cts", ".py"}
TS_SUFFIXES = SOURCE_SUFFIXES - {".py"}
SKIP_DIRS = {"node_modules", ".angular", "dist", "coverage", ".venv", "__pycache__", ".git"}
RESOLVER = Path(__file__).resolve().parent / "resolve-ts-imports.mjs"
GENERIC_UI_RE_TEXT = (
    r"selector\s*:\s*['\"]ui-(?:badge|confirm-dialog|data-table|dialog|select|skeleton)['\"]"
)
SINK_SUFFIXES = {".ts", ".mts", ".js", ".mjs", ".html"}
# Case-insensitive: Angular maps [innerHtml] onto innerHTML. The extra names
# are DOM sinks that never spell innerHTML. Scope is Finance frontend and
# package src only; other apps are outside this scan.
SINK_RE_TEXT = (
    r"bypass(?:Security|Sanitization)Trust|innerHTML|outerHTML|insertAdjacentHTML|"
    r"document\.write|createContextualFragment|setHTMLUnsafe|srcdoc"
)
GENERIC_UI_PATHS = (
    "apps/finance/frontend/src/app/shared/ui/ui-badge",
    "apps/finance/frontend/src/app/shared/ui/ui-data-table",
    "apps/finance/frontend/src/app/shared/ui/ui-dialog",
    "apps/finance/frontend/src/app/shared/ui/ui-select",
    "apps/finance/frontend/src/app/shared/ui/ui-skeleton",
    "apps/finance/frontend/src/app/shared/confirm-dialog.component.ts",
    "apps/finance/frontend/src/app/services/confirm.service.ts",
    "apps/finance/frontend/src/app/services/toast.service.ts",
)

GENERIC_UI_RE = re.compile(GENERIC_UI_RE_TEXT)
SINK_RE = re.compile(SINK_RE_TEXT, re.IGNORECASE)

# Domain code may use these server platform modules. Tests may also import the
# factory and the migration runner. This is not permission to import a feature.
_PLATFORM = (
    "apps.server.database",
    "apps.server.auth",
    "apps.server.errors",
    "apps.server.path_ids",
    "apps.server.identity",
    "apps.server.api_key",
    "apps.server.rate_limit",
)
_PUBLIC_ENTRIES = {
    "apps/site/src/public-api",
    "apps/finance/frontend/src/public-api",
    "apps/travel/frontend/src/public-api",
    "apps/media/frontend/src/public-api",
}
_FINANCE_TESTING = "apps/finance/frontend/src/testing"

# Enumerated composition files. They may import other owners. The rest of
# apps/server may not.
SERVER_COMPOSITION = {
    "apps/server/main.py": "server factory composes domain routers",
    "apps/server/schema.py": "schema assembly composes domain models",
    "apps/server/search.py": "search aggregation reads travel and media models",
    "apps/server/world/read.py": "world read model reads media, travel, and town tables",
    "apps/server/migrate.py": "offline migrate dynamically loads finance, travel, and media models",
    "apps/server/alembic/versions/site_media_membership_v1.py": (
        "migration backfill calls media membership helpers"
    ),
    "apps/server/alembic/versions/site_trip_pto_days_v1.py": (
        "migration backfill calls travel pto helpers"
    ),
}
WEB_SHELL_COMPOSITION = {
    "apps/web/src/app/routes.ts": "shell composes feature routes",
    "apps/web/src/app/private-layout.component.ts": "shell embeds search",
}
MIGRATION_PLATFORM = {
    "apps/server/schema.py",
    "apps/server/migrations.py",
}
_DYNAMIC_IMPORTS = {"import_module", "__import__"}
_MODULE_SUFFIXES = (".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".mts", ".cts")


@dataclass(frozen=True)
class Reviewed:
    """One existing cross-owner edge that is debt, not a new violation."""

    source: str
    target: str
    removal_owner: str


# Real edges on the current tree. A new source or target is not covered.
# Removal owners are the feature that must delete the coupling.
REVIEWED: tuple[Reviewed, ...] = (
    Reviewed(
        "apps/server/identity/admin.py",
        "apps/finance/backend/models.py",
        "server-identity",
    ),
    Reviewed(
        "apps/server/identity/admin.py",
        "apps/finance/backend/services/encrypted_storage.py",
        "server-identity",
    ),
    Reviewed(
        "apps/server/identity/auth_decoy.py",
        "apps/finance/backend/kdf_policy.py",
        "server-identity",
    ),
    Reviewed(
        "apps/server/identity/routes.py",
        "apps/finance/backend/local_dev.py",
        "server-identity",
    ),
    Reviewed(
        "apps/server/identity/routes.py",
        "apps/finance/backend/services/encrypted_storage.py",
        "server-identity",
    ),
    Reviewed(
        "apps/server/identity/schemas.py",
        "apps/finance/backend/kdf_policy.py",
        "server-identity",
    ),
    Reviewed(
        "apps/server/identity/schemas.py",
        "apps/finance/backend/schemas_vault.py",
        "server-identity",
    ),
    Reviewed(
        "apps/server/identity/session.py",
        "apps/finance/backend/local_dev.py",
        "server-identity",
    ),
    Reviewed(
        "apps/web/src/app/platform/auth/auth.service.ts",
        "apps/web/src/environments/environment.ts",
        "web-platform",
    ),
    Reviewed(
        "apps/web/src/app/hub/hub.component.ts",
        "apps/web/src/app/pixels/pixels-data.service.ts",
        "web-hub",
    ),
    Reviewed(
        "apps/web/src/app/hub/hub.component.ts",
        "apps/web/src/app/pixels/pixels-model.ts",
        "web-hub",
    ),
    Reviewed(
        "apps/web/src/app/hub/pixels-hub-card.ts",
        "apps/web/src/app/pixels/pixels-dates.ts",
        "web-hub",
    ),
    Reviewed(
        "apps/web/src/app/search/search-dialog.component.ts",
        "apps/web/src/app/hub/hub-load.ts",
        "web-search",
    ),
    Reviewed(
        "apps/web/src/app/settings/account-section.component.ts",
        "apps/web/src/app/hub/username-change.component.ts",
        "web-settings",
    ),
    Reviewed(
        "apps/web/src/app/town/town.api.ts",
        "apps/web/src/app/hub/hub-load.ts",
        "web-town",
    ),
    Reviewed(
        "apps/web/src/app/town/town.component.ts",
        "apps/web/src/app/world/world.types.ts",
        "web-town",
    ),
    Reviewed(
        "apps/web/src/app/world/data/world-api.ts",
        "apps/web/src/app/town/town.types.ts",
        "web-world",
    ),
    Reviewed(
        "apps/web/src/app/world/data/world-controller.ts",
        "apps/web/src/app/town/town.types.ts",
        "web-world",
    ),
    Reviewed(
        "apps/web/src/app/world/render/renderer.ts",
        "apps/web/src/app/town/health/index.ts",
        "web-world",
    ),
    Reviewed(
        "apps/web/src/app/world/render/renderer.ts",
        "apps/web/src/app/town/index.ts",
        "web-world",
    ),
    Reviewed(
        "apps/web/src/app/world/town-layout.ts",
        "apps/web/src/app/town/index.ts",
        "web-world",
    ),
    Reviewed(
        "apps/web/src/app/world/ui/world.component.ts",
        "apps/web/src/app/town/health/index.ts",
        "web-world",
    ),
    Reviewed(
        "apps/web/src/app/world/ui/world.component.ts",
        "apps/web/src/app/town/index.ts",
        "web-world",
    ),
)
_REVIEWED_INDEX = {(item.source, item.target): item.removal_owner for item in REVIEWED}


@dataclass(frozen=True)
class Edge:
    source: Path
    target: Path
    specifier: str
    kind: str


def source_files(base: Path):
    if not base.is_dir():
        return
    for path in base.rglob("*"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.is_file() and path.suffix in SOURCE_SUFFIXES:
            yield path


def owner(root: Path, path: Path) -> str | None:
    """Feature owner. Files directly in the web app shell share ``web:shell``."""
    try:
        parts = path.resolve().relative_to(root.resolve()).parts
    except ValueError:
        return None
    if len(parts) >= 2 and parts[0] == "packages":
        return f"package:{parts[1]}"
    if len(parts) < 2 or parts[0] != "apps":
        return None
    app = parts[1]
    if app == "web":
        if len(parts) >= 6 and parts[2] == "src" and parts[3] == "app":
            return f"web:{parts[4]}"
        return "web:shell"
    if app != "server":
        return f"app:{app}"
    if len(parts) == 3 and Path(parts[2]).suffix == ".py":
        return "server:platform"
    if len(parts) < 3:
        return "server:platform"
    directory = parts[2]
    if directory in {"identity"}:
        return "server:platform"
    if directory == "tests":
        return "server:tests"
    if directory == "alembic":
        return "server:migrations"
    if directory.endswith(".py"):
        return "server:platform"
    return f"server:{directory}"


def rel_posix(root: Path, path: Path) -> str | None:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return None


def _dotted_module(root: Path, path: Path) -> str | None:
    key = _module_key(root, path)
    if key is None:
        return None
    return key.replace("/", ".")


def _same_app_test(root: Path, edge: Edge) -> bool:
    """Specs and e2e may import another feature in the same app. Not another app."""
    name = edge.source.name
    if not (name.endswith(".spec.ts") or "e2e" in edge.source.parts):
        return False
    source_parts = rel_posix(root, edge.source)
    target_parts = rel_posix(root, edge.target)
    if source_parts is None or target_parts is None:
        return False
    source_app = source_parts.split("/", 2)[:2]
    target_app = target_parts.split("/", 2)[:2]
    return source_app == target_app and source_app[0] == "apps"


def _module_key(root: Path, path: Path) -> str | None:
    relative = rel_posix(root, path)
    text = path.as_posix() if relative is None else relative
    for suffix in _MODULE_SUFFIXES:
        if text.endswith(suffix):
            text = text[: -len(suffix)]
            break
    if text.endswith("/__init__"):
        text = text[: -len("/__init__")]
    return text


def _platform_import(source: Path, module: str) -> bool:
    if any(module == name or module.startswith(name + ".") for name in _PLATFORM):
        return True
    if module in {"apps.server.main", "apps.server.migrations"}:
        return "tests" in source.parts
    return False


def _feature_entrypoint(source: Path, target: Path, root: Path = ROOT) -> bool:
    key = _module_key(root, target)
    if key is None:
        return False
    source_owner = owner(root, source)
    if source_owner is None or not source_owner.startswith("web:"):
        # Preserve the historical helper for absolute repo paths in unit tests
        # when ``root`` is the repo and the source lives under apps/web.
        try:
            source_owner = owner(ROOT, source)
        except ValueError:
            source_owner = None
    if source_owner is None or not str(source_owner).startswith("web:"):
        return False
    if source.name.endswith(".spec.ts") and key == _FINANCE_TESTING:
        return True
    return key in _PUBLIC_ENTRIES


def _python_package(root: Path, path: Path) -> list[str] | None:
    relative = rel_posix(root, path)
    if relative is None or not relative.endswith(".py"):
        return None
    # A module's package is its directory. ``__init__.py`` is that directory too.
    return relative.split("/")[:-1]


def _compose_relative(package: list[str], level: int, module: str | None) -> str | None:
    if level <= 0:
        return module
    keep = len(package) - (level - 1)
    if keep < 0:
        return None
    base = package[:keep]
    if module:
        base.extend(module.split("."))
    return ".".join(base)


def _find_module(root: Path, module: str) -> Path | None:
    parts = [part for part in module.split(".") if part]
    if not parts:
        return None
    candidate = root.joinpath(*parts)
    file_path = candidate.with_suffix(".py")
    if file_path.is_file():
        return file_path
    init = candidate / "__init__.py"
    if init.is_file():
        return init
    if candidate.is_dir():
        return candidate
    if len(parts) == 1:
        return None
    return _find_module(root, ".".join(parts[:-1]))


def _import_from_targets(root: Path, module: str, names: list[str]) -> list[Path]:
    found = _find_module(root, module)
    if found is None:
        return []
    if found.suffix == ".py" and found.name != "__init__.py":
        return [found]
    targets: list[Path] = []
    for name in names:
        if name == "*":
            targets.append(found)
            continue
        submodule = _find_module(root, f"{module}.{name}")
        targets.append(submodule or found)
    return targets or [found]


def _call_import_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def python_edges(root: Path, path: Path) -> tuple[list[Edge], list[str]]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), filename=str(path))
    except SyntaxError as exc:
        return [], [f"unparsed Python: {rel_posix(root, path) or path} ({exc.msg})"]
    package = _python_package(root, path) or []
    edges: list[Edge] = []
    errors: list[str] = []

    def add(module: str | None, names: list[str], kind: str) -> None:
        if not module:
            errors.append(f"unresolved import: {rel_posix(root, path)} ({kind})")
            return
        targets = _import_from_targets(root, module, names)
        if not targets:
            if module.startswith("apps.") or module.startswith("packages."):
                errors.append(f"unresolved import: {rel_posix(root, path)} -> {module} ({kind})")
            return
        for target in targets:
            if rel_posix(root, target) is None and not target.is_relative_to(root):
                continue
            if owner(root, target) is None and rel_posix(root, target) is None:
                continue
            edges.append(Edge(path, target, module, kind))

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                add(alias.name, [], "import")
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                module = _compose_relative(package, node.level, node.module)
                names = [alias.name for alias in node.names]
                if module is None:
                    errors.append(
                        f"unresolved import: {rel_posix(root, path)} -> relative level {node.level}"
                    )
                    continue
                # ``from . import name`` refers to a sibling submodule when one exists.
                add(module, names, "import")
            else:
                add(node.module, [alias.name for alias in node.names], "import")
        elif isinstance(node, ast.Call):
            name = _call_import_name(node.func)
            if name not in _DYNAMIC_IMPORTS or not node.args:
                continue
            argument = node.args[0]
            if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
                add(argument.value, [], "dynamic")
            else:
                relative = rel_posix(root, path)
                if relative != "apps/server/migrate.py":
                    errors.append(f"unresolved dynamic import: {relative or path} ({name})")
    return edges, errors


def typescript_edges(root: Path, files: list[Path]) -> tuple[list[Edge], list[str]]:
    if not files:
        return [], []
    payload = json.dumps({"root": str(root), "files": [str(path) for path in files]})
    completed = subprocess.run(
        ["node", str(RESOLVER)],
        input=payload,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "no output"
        return [], [f"typescript resolver failed: {detail}"]
    data = json.loads(completed.stdout)
    if not isinstance(data, dict):
        return [], ["typescript resolver returned unexpected output"]
    edges: list[Edge] = []
    errors: list[str] = []
    raw_edges = data.get("edges", [])
    raw_unresolved = data.get("unresolved", [])
    if not isinstance(raw_edges, list) or not isinstance(raw_unresolved, list):
        return [], ["typescript resolver returned unexpected output"]
    for item in raw_edges:
        if not isinstance(item, dict):
            continue
        source = Path(str(item["source"]))
        target = Path(str(item["target"]))
        edges.append(
            Edge(source, target, str(item.get("specifier", "")), str(item.get("kind", "import")))
        )
    for item in raw_unresolved:
        if not isinstance(item, dict):
            continue
        origin = rel_posix(root, Path(str(item["source"]))) or str(item["source"])
        specifier = str(item.get("specifier", ""))
        kind = str(item.get("kind", "import"))
        errors.append(f"unresolved import: {origin} -> {specifier} ({kind})")
    return edges, errors


def _allowed(root: Path, edge: Edge) -> bool:
    source_owner = owner(root, edge.source)
    target_owner = owner(root, edge.target)
    if source_owner is None or target_owner is None or source_owner == target_owner:
        return True
    if target_owner.startswith("package:"):
        return True
    if source_owner.startswith("package:"):
        return False
    if _feature_entrypoint(edge.source, edge.target, root):
        return True
    relative_source = rel_posix(root, edge.source)
    relative_target = rel_posix(root, edge.target)
    target_module = _dotted_module(root, edge.target)
    if (
        target_module
        and target_module.startswith("apps.")
        and _platform_import(edge.source, target_module)
        and not source_owner.startswith("web:")
    ):
        return True
    if _same_app_test(root, edge):
        return True
    if relative_source in SERVER_COMPOSITION:
        return True
    if relative_source in WEB_SHELL_COMPOSITION and target_owner.startswith("web:"):
        return True
    if source_owner == "server:tests":
        return True
    if relative_source == "apps/server/alembic/env.py" and relative_target in MIGRATION_PLATFORM:
        return True
    if source_owner.startswith("web:") and target_owner == "web:platform":
        return True
    if (
        source_owner.startswith("web:")
        and relative_target is not None
        and relative_target.startswith("apps/web/src/environments/")
    ):
        return True
    return (
        relative_source is not None
        and relative_target is not None
        and (relative_source, relative_target) in _REVIEWED_INDEX
    )


def _cycles(pairs: list[tuple[str, str]]) -> list[str]:
    graph: dict[str, set[str]] = defaultdict(set)
    for source_owner, target_owner in pairs:
        if source_owner != target_owner:
            graph[source_owner].add(target_owner)
    seen: set[tuple[str, str]] = set()
    found: list[str] = []
    for start, targets in graph.items():
        for target in sorted(targets):
            if start in graph.get(target, set()):
                pair = (start, target) if start < target else (target, start)
                if pair in seen:
                    continue
                seen.add(pair)
                found.append(f"import cycle: {pair[0]} <-> {pair[1]}")
    return found


def _edge_error(root: Path, edge: Edge) -> str:
    source = rel_posix(root, edge.source) or edge.source.as_posix()
    target = rel_posix(root, edge.target) or edge.target.as_posix()
    source_owner = owner(root, edge.source) or "unknown"
    target_owner = owner(root, edge.target) or "unknown"
    return (
        f"forbidden import: {source} ({source_owner}) -> {target} ({target_owner})"
        f" [{edge.kind} {edge.specifier}]"
    )


def check_boundaries(root: Path) -> list[str]:
    errors: list[str] = []
    edges: list[Edge] = []
    py_files: list[Path] = []
    ts_files: list[Path] = []
    for base in (root / "packages", root / "apps"):
        for path in source_files(base):
            if path.suffix == ".py":
                py_files.append(path)
            elif path.suffix in TS_SUFFIXES:
                ts_files.append(path)
    for path in py_files:
        found, problems = python_edges(root, path)
        edges.extend(found)
        errors.extend(problems)
    found, problems = typescript_edges(root, ts_files)
    edges.extend(found)
    errors.extend(problems)

    denied: list[tuple[str, str]] = []
    for edge in edges:
        if _allowed(root, edge):
            continue
        errors.append(_edge_error(root, edge))
        source_owner = owner(root, edge.source)
        target_owner = owner(root, edge.target)
        if source_owner and target_owner:
            denied.append((source_owner, target_owner))
    errors.extend(_cycles(denied))

    for relative in GENERIC_UI_PATHS:
        if (root / relative).exists():
            errors.append(f"generic Finance UI implementation belongs in packages/ui: {relative}")

    sink_roots = [root / "apps/finance/frontend/src"]
    packages = root / "packages"
    if packages.is_dir():
        sink_roots.extend(path / "src" for path in packages.iterdir() if (path / "src").is_dir())
    for base in sink_roots:
        if not base.is_dir():
            continue
        for source in base.rglob("*"):
            if any(part in SKIP_DIRS for part in source.parts):
                continue
            if not source.is_file() or source.suffix not in SINK_SUFFIXES:
                continue
            if SINK_RE.search(source.read_text(encoding="utf-8", errors="replace")):
                relative = rel_posix(root, source) or source.as_posix()
                errors.append(f"Trusted Types sink in Finance frontend or package src: {relative}")

    finance_shared = root / "apps/finance/frontend/src/app/shared"
    if finance_shared.exists():
        for source in source_files(finance_shared):
            contents = source.read_text(encoding="utf-8", errors="replace")
            if GENERIC_UI_RE.search(contents):
                relative = rel_posix(root, source) or source.as_posix()
                errors.append(
                    f"generic UI selector reintroduced under Finance shared code: {relative}"
                )
    return sorted(set(errors))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check resolved feature import ownership.")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args(argv)
    errors = check_boundaries(args.root.resolve())
    if errors:
        print("check-shared-boundaries: FAILED")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print("check-shared-boundaries: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
