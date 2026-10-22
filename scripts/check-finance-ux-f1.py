#!/usr/bin/env python3
"""Grep gates for Finance UX batch F1. Fails on money pipes, plurals, and UTC dates."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1] / "apps" / "finance" / "frontend" / "src"
problems = []

for path in ROOT.rglob("*"):
    if path.suffix not in {".html", ".ts"} or path.name.endswith(".spec.ts"):
        continue
    text = path.read_text()
    relative = path.relative_to(ROOT)
    for lineno, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue
        if "(s)" in line:
            problems.append(f"{relative}:{lineno}: plural (s)")
        if "Date unknown" in line:
            problems.append(f"{relative}:{lineno}: Date unknown")
        if re.search(r"\|\s*currency:", line):
            problems.append(f"{relative}:{lineno}: currency pipe")
        if re.search(r"\|\s*date:[^'\n]*UTC", line):
            problems.append(f"{relative}:{lineno}: UTC date pipe")
        if re.search(r"\|\s*number:\s*'1\.2-2'", line):
            problems.append(f"{relative}:{lineno}: money number pipe")
        if re.search(r"\|\s*number:\s*'1\.0-0'", line) and "%" not in line:
            problems.append(f"{relative}:{lineno}: money number pipe")
        if re.search(r"\$\{\{", line):
            problems.append(f"{relative}:{lineno}: dollar before interpolation")
        if re.search(r"\[disabled\]=\"[^\"]*(?:\.valid|canSave\(\)|canSubmit)", line):
            problems.append(f"{relative}:{lineno}: submit disabled by validity")

if problems:
    print("\n".join(problems))
    sys.exit(1)
print("finance UX F1 grep gates passed")
