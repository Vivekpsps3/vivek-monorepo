#!/usr/bin/env bash
# OPS-002: fail when markdown relative links point at missing files.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

python3 - <<'PY'
from pathlib import Path
import os
import re

root = Path(".").resolve()
fail = 0
link_re = re.compile(r"\]\(([^)]+)\)")

scan_roots = [
    root / "docs", root / "planning", root / "apps", root / "packages",
    root / "AGENTS.md", root / "README.md",
]
skip_dirs = {
    ".git", "node_modules", ".angular", ".venv", "venv", "dist", "coverage",
    "playwright-report", "test-results", "__pycache__",
}
files: list[Path] = []
for p in scan_roots:
    if p.is_file():
        files.append(p)
    elif p.is_dir():
        for directory, dirnames, filenames in os.walk(p):
            dirnames[:] = [name for name in dirnames if name not in skip_dirs]
            files.extend(Path(directory) / name for name in filenames if name.endswith(".md"))

for path in files:
    text = path.read_text(encoding="utf-8", errors="replace")
    for match in link_re.finditer(text):
        target = match.group(1).strip()
        if not target or target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        target = target.split("#", 1)[0].split("?", 1)[0]
        if not target:
            continue
        # absolute-from-repo style
        candidates = [
            (path.parent / target).resolve(),
            (root / target.lstrip("/")).resolve(),
        ]
        if not any(c.exists() for c in candidates):
            print(f"MISSING link in {path.relative_to(root)}: {target}")
            fail = 1

if fail:
    print("check-doc-paths: FAILED")
    raise SystemExit(1)
print("check-doc-paths: OK")
PY
