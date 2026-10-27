#!/usr/bin/env python3
"""Keep shared package and application imports within their intended boundaries."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".py"}
SKIP_DIRS = {"node_modules", ".angular", "dist", "coverage", ".venv", "__pycache__"}
IMPORT_RE = re.compile(
    r"(?:\bfrom\s+|\bimport\s*(?:\(\s*)?)(?:['\"]([^'\"]+)['\"]|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*))"
)
GENERIC_UI_RE = re.compile(
    r"selector\s*:\s*['\"]ui-(?:badge|confirm-dialog|data-table|dialog|select|skeleton)['\"]"
)
SINK_SUFFIXES = {".ts", ".mts", ".js", ".mjs", ".html"}
# Case-insensitive: Angular maps [innerHtml] onto innerHTML. The extra names
# are DOM sinks that never spell innerHTML.
SINK_RE = re.compile(
    r"bypass(?:Security|Sanitization)Trust|innerHTML|outerHTML|insertAdjacentHTML|"
    r"document\.write|createContextualFragment|setHTMLUnsafe|srcdoc",
    re.IGNORECASE,
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


def source_files(base: Path):
    for path in base.rglob("*"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.is_file() and path.suffix in SOURCE_SUFFIXES:
            yield path


def import_target(path: Path, module: str) -> Path | None:
    if module.startswith("apps/"):
        return ROOT / module
    if module.startswith("apps."):
        return ROOT.joinpath(*module.split("."))
    if module.startswith("."):
        return (path.parent / module).resolve()
    return None


# Domain code may use the site database, the principal, and — from tests only —
# the app factory. It may not import another domain or the rest of the server.
_PLATFORM = (
    "apps.server.database",
    "apps.server.auth",
    "apps.server.errors",
    "apps.server.identity",
    "apps.server.api_key",
    "apps.server.rate_limit",
)


def _platform_import(source: Path, module: str) -> bool:
    if any(module == name or module.startswith(name + ".") for name in _PLATFORM):
        return True
    if module in {"apps.server.main", "apps.server.migrations"}:
        return "tests" in source.parts
    return False


def app_name(path: Path) -> str | None:
    try:
        relative = path.resolve().relative_to(ROOT)
    except ValueError:
        return None
    if len(relative.parts) >= 2 and relative.parts[0] == "apps":
        return relative.parts[1]
    return None


def _feature_entrypoint(source: Path, target: Path) -> bool:
    if (
        app_name(source) == "web"
        and source.name.endswith(".spec.ts")
        and target.resolve() == ROOT / "apps/finance/frontend/src/testing"
    ):
        return True
    return app_name(source) == "web" and target.resolve() in {
        ROOT / "apps/site/src/public-api",
        ROOT / "apps/finance/frontend/src/public-api",
        ROOT / "apps/travel/frontend/src/public-api",
        ROOT / "apps/media/frontend/src/public-api",
    }


def main() -> int:
    errors: list[str] = []
    for package_file in source_files(ROOT / "packages"):
        for match in IMPORT_RE.finditer(package_file.read_text(encoding="utf-8", errors="replace")):
            module = match.group(1) or match.group(2)
            target = import_target(package_file, module)
            if target and app_name(target):
                errors.append(
                    f"shared package imports app code: {package_file.relative_to(ROOT)} -> {module}"
                )

    app_roots = [path for path in (ROOT / "apps").iterdir() if path.is_dir()]
    for app_root in app_roots:
        for source in source_files(app_root):
            source_app = app_name(source)
            # The Media browser harness wires site redirects. It is not shipped.
            if source.is_relative_to(ROOT / "apps/media/e2e"):
                continue
            for match in IMPORT_RE.finditer(source.read_text(encoding="utf-8", errors="replace")):
                module = match.group(1) or match.group(2)
                target = import_target(source, module)
                target_app = app_name(target) if target else None
                if (
                    target_app
                    and target is not None
                    and source_app
                    and target_app != source_app
                    and source_app != "server"
                    and not _platform_import(source, module)
                    and not _feature_entrypoint(source, target)
                ):
                    errors.append(
                        f"cross-app source import: {source.relative_to(ROOT)} -> {module} (apps/{target_app})"
                    )

    for relative in GENERIC_UI_PATHS:
        if (ROOT / relative).exists():
            errors.append(f"generic Finance UI implementation belongs in packages/ui: {relative}")

    sink_roots = [ROOT / "apps/finance/frontend/src"]
    packages = ROOT / "packages"
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
                errors.append(
                    f"Trusted Types sink in finance or a package it bundles: {source.relative_to(ROOT)}"
                )

    finance_shared = ROOT / "apps/finance/frontend/src/app/shared"
    if finance_shared.exists():
        for source in source_files(finance_shared):
            contents = source.read_text(encoding="utf-8", errors="replace")
            if GENERIC_UI_RE.search(contents):
                errors.append(
                    f"generic UI selector reintroduced under Finance shared code: {source.relative_to(ROOT)}"
                )

    if errors:
        print("check-shared-boundaries: FAILED")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print("check-shared-boundaries: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
