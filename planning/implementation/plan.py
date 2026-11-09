#!/usr/bin/env python3
"""Validate compact queue metadata against owned packets, or print a launch prompt."""

import argparse
import copy
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent.parent
META_FIELDS = {
    "id",
    "title",
    "parent_issues",
    "kind",
    "issue",
    "dependencies",
    "conflict_groups",
    "verification_profiles",
}
SECTIONS = (
    "Outcome",
    "Requirements",
    "Source paths",
    "Target paths",
    "Steps",
    "Acceptance",
    "Deletion",
    "Non-goals",
    "Test scenarios",
    "Risks",
    "Completion evidence",
)


def section(text, name):
    match = re.search(r"(?ms)^## " + re.escape(name) + r"\n(.*?)(?=^## |\Z)", text)
    return match.group(1).strip() if match else ""


def errors(data, packets=None):
    found = []
    tasks = data.get("tasks", [])
    by_id = {task["id"]: task for task in tasks}
    if len(by_id) != len(tasks):
        found.append("Duplicate task key")
    numbers = [task["issue"] for task in tasks if task.get("issue")]
    if len(numbers) != len(set(numbers)):
        found.append("Duplicate leaf issue number")
    if data.get("format_version") != 2:
        found.append("Queue must use metadata-only format version 2")
    profiles = json.loads((BASE / "verification.json").read_text())
    if packets is None:
        packets = {path.stem: path.read_text() for path in (BASE / "issues").glob("*.md")}
    if set(packets) != set(by_id):
        found.append("Local packets and queue keys differ")
    for task in tasks:
        key = task["id"]
        if set(task) - META_FIELDS:
            found.append(f"{key}: duplicated detail in scheduling metadata")
        for field in ("title", "parent_issues", "kind", "conflict_groups", "verification_profiles"):
            if not task.get(field):
                found.append(f"{key}: missing {field}")
        for dep in task.get("dependencies", []):
            if dep not in by_id:
                found.append(f"{key}: unknown dependency {dep}")
        if any(profile not in profiles for profile in task.get("verification_profiles", [])):
            found.append(f"{key}: unknown verification profile")
        text = packets.get(key, "")
        metadata = [
            "# " + key + " — " + task["title"],
            "- Stable key: `" + key + "`",
            "- Kind: `" + task["kind"] + "`",
            "- Dependencies: "
            + (", ".join("`" + dep + "`" for dep in task["dependencies"]) or "none"),
            "- Conflict groups: "
            + ", ".join("`" + group + "`" for group in task["conflict_groups"]),
            "- Verification profiles: "
            + ", ".join("`" + profile + "`" for profile in task["verification_profiles"]),
        ]
        if task.get("issue"):
            metadata.append(
                f"- GitHub leaf: [#{task['issue']}](https://github.com/Vivekpsps3/vivek-monorepo/issues/{task['issue']})"
            )
        metadata.append(
            "- Parents: "
            + ", ".join(
                f"[#{number}](https://github.com/Vivekpsps3/vivek-monorepo/issues/{number})"
                for number in task["parent_issues"]
            )
        )
        if any(line not in text.splitlines() for line in metadata):
            found.append(f"{key}: packet metadata differs from queue")
        for name in SECTIONS:
            if not section(text, name):
                found.append(f"{key}: missing packet section {name}")
        rows = [line for line in section(text, "Acceptance").splitlines() if line.startswith("|")][
            2:
        ]
        if not rows:
            found.append(f"{key}: no acceptance rows")
        for row in rows:
            cells = re.split(r"(?<!\\)\|", row)[1:-1]
            if len(cells) != 5 or not all(cell.strip() for cell in cells):
                found.append(f"{key}: incomplete acceptance row")
        for path in re.findall(r"^- `([^`]+)`$", section(text, "Source paths"), re.M):
            if not (ROOT / path).exists():
                found.append(f"{key}: missing source path {path}")
    done, active = set(), set()

    def walk(key):
        if key in active:
            found.append("Dependency cycle at " + key)
            return
        if key in done or key not in by_id:
            return
        active.add(key)
        for dep in by_id[key].get("dependencies", []):
            walk(dep)
        active.remove(key)
        done.add(key)

    for key in by_id:
        walk(key)
    for parent in data.get("parents", []):
        if not any(parent["number"] in task["parent_issues"] for task in tasks):
            found.append(f"Parent {parent['number']}: no executable owner")
    coverage = data.get("td_coverage", {})
    if set(coverage) != {f"TD-{i:02d}" for i in range(40)}:
        found.append("TD coverage must contain all forty work items")
    for key, owner in coverage.items():
        if owner not in by_id:
            found.append(f"{key}: unknown primary owner {owner}")
    return found


def self_test(data):
    packets = {path.stem: path.read_text() for path in (BASE / "issues").glob("*.md")}
    key = data["tasks"][0]["id"]
    for mutation in (
        "duplicate",
        "dependency",
        "cycle",
        "coverage",
        "acceptance",
        "metadata",
        "section",
        "profile",
        "packet",
        "duplicate-detail",
    ):
        bad, texts = copy.deepcopy(data), dict(packets)
        if mutation == "duplicate":
            bad["tasks"].append(copy.deepcopy(bad["tasks"][0]))
        elif mutation == "dependency":
            bad["tasks"][0]["dependencies"].append("DOES-NOT-EXIST")
        elif mutation == "cycle":
            bad["tasks"][0]["dependencies"].append(key)
        elif mutation == "coverage":
            bad["td_coverage"].pop("TD-00")
        elif mutation == "acceptance":
            row = section(texts[key], "Acceptance").splitlines()[2]
            texts[key] = texts[key].replace(row, "| A | given | when | then | |", 1)
        elif mutation == "metadata":
            texts[key] = texts[key].replace("- Dependencies:", "- Old dependencies:", 1)
        elif mutation == "section":
            texts[key] = texts[key].replace("## Deletion", "## Removed heading", 1)
        elif mutation == "profile":
            bad["tasks"][0]["verification_profiles"] = ["DOES-NOT-EXIST"]
        elif mutation == "duplicate-detail":
            bad["tasks"][0]["steps"] = ["A second copy of the work packet"]
        else:
            texts.pop(key)
        if not errors(bad, texts):
            raise SystemExit("Negative fixture escaped: " + mutation)
    print("Ten negative planning fixtures: PASS")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate", "list", "launch"])
    parser.add_argument("key", nargs="?")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    data = json.loads((BASE / "queue.json").read_text())
    found = errors(data)
    if found:
        raise SystemExit("\n".join(found))
    if args.self_test:
        self_test(data)
    if args.command == "validate":
        print(
            f"Planning validation: PASS ({len(data['tasks'])} packets, {len(data['parents'])} parents, forty TD owners)"
        )
    elif args.command == "list":
        for task in data["tasks"]:
            print(
                task["id"],
                "#" + str(task.get("issue") or "DRAFT"),
                "depends=" + ",".join(task["dependencies"]),
                "conflicts=" + ",".join(task["conflict_groups"]),
            )
    else:
        task = next((task for task in data["tasks"] if task["id"] == args.key), None)
        if task is None:
            raise SystemExit("Unknown key; use list")
        print(
            f"Implement {task['id']} / #{task.get('issue') or 'DRAFT'} in one complete PR.\n"
            f"Read AGENTS.md, planning/AGENTS.md and planning/implementation/issues/{task['id']}.md.\n"
            "Read applicable subtree AGENTS.md before editing. Verify current main, merged prerequisite outcomes "
            "and live PR/claims. Follow every acceptance/deletion row; record issue evidence and append "
            "a scoped roadmap #134 status note. Do not close parents or assume merge/deployment authorization.\n"
            "Run these commands from the repo root, plus gates for any additional files/screens changed:"
        )
        profiles = json.loads((BASE / "verification.json").read_text())
        commands = ["make test-fast"]
        for profile in task["verification_profiles"]:
            commands.extend(profiles[profile])
        print("\n".join(dict.fromkeys(commands)))


if __name__ == "__main__":
    main()
