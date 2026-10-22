#!/usr/bin/env python3
"""Keep shared package and application imports within their intended boundaries."""

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".py"}
SKIP_DIRS = {"node_modules", ".angular", "dist", "coverage", ".venv", "__pycache__"}
IMPORT_RE = re.compile(
    r"(?:\bfrom\s+|\bimport\s*(?:\(\s*)?)(?:['\"]([^'\"]+)['\"]|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*))"
)
GENERIC_UI_RE = re.compile(r"selector\s*:\s*['\"]ui-(?:badge|confirm-dialog|data-table|dialog|select|skeleton)['\"]")
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


def app_name(path: Path) -> str | None:
    try:
        relative = path.resolve().relative_to(ROOT)
    except ValueError:
        return None
    if len(relative.parts) >= 2 and relative.parts[0] == "apps":
        return relative.parts[1]
    return None


def main() -> int:
    errors: list[str] = []
    for package_file in source_files(ROOT / "packages"):
        for match in IMPORT_RE.finditer(package_file.read_text(encoding="utf-8", errors="replace")):
            module = match.group(1) or match.group(2)
            target = import_target(package_file, module)
            if target and app_name(target):
                errors.append(f"shared package imports app code: {package_file.relative_to(ROOT)} -> {module}")

    app_roots = [path for path in (ROOT / "apps").iterdir() if path.is_dir()]
    for app_root in app_roots:
        for source in source_files(app_root):
            source_app = app_name(source)
            for match in IMPORT_RE.finditer(source.read_text(encoding="utf-8", errors="replace")):
                module = match.group(1) or match.group(2)
                target = import_target(source, module)
                target_app = app_name(target) if target else None
                if target_app and source_app and target_app != source_app and source_app != "server":
                    errors.append(
                        f"cross-app source import: {source.relative_to(ROOT)} -> {module} (apps/{target_app})"
                    )

    for relative in GENERIC_UI_PATHS:
        if (ROOT / relative).exists():
            errors.append(f"generic Finance UI implementation belongs in packages/ui: {relative}")

    finance_src = ROOT / "apps/finance/frontend/src"
    if finance_src.exists():
        for source in source_files(finance_src):
            if source.suffix not in {".ts", ".html"}:
                continue
            if "bypassSecurityTrust" in source.read_text(encoding="utf-8", errors="replace"):
                errors.append(
                    f"finance Trusted Types allowlist stays empty only while finance has no bypass: {source.relative_to(ROOT)}"
                )

    finance_shared = ROOT / "apps/finance/frontend/src/app/shared"
    if finance_shared.exists():
        for source in source_files(finance_shared):
            contents = source.read_text(encoding="utf-8", errors="replace")
            if GENERIC_UI_RE.search(contents):
                errors.append(f"generic UI selector reintroduced under Finance shared code: {source.relative_to(ROOT)}")

    if errors:
        print("check-shared-boundaries: FAILED")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print("check-shared-boundaries: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
