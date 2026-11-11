"""Shipped-source ownership: unowned modules fail, exclusions stay explicit."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROBE_MJS = ROOT / "apps/media/frontend/src/ver01-ownership-probe.mjs"
PROBE_D_MTS = ROOT / "apps/media/frontend/src/ver01-ownership-probe.d.mts"
REAL_MJS = "packages/browser/runtime/date.mjs"


def load_module(name: str, filename: str):
    path = Path(__file__).resolve().parent / filename
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = load_module("source_inventory_under_test", "source_inventory.py")
        self.ratchet = load_module("quality_ratchet_under_inventory_test", "quality_ratchet.py")

    def owners_for_typescript_only(self):
        project = self.inventory.TsProject(
            "apps/web/tsconfig.app.json",
            ("apps/web/src/**/*.ts",),
            (),
            False,
        )
        return self.inventory.ToolOwners(
            eslint_patterns=("apps/web/src/**/*.ts", "apps/web/src/**/*.html"),
            config_blocks=((("apps/**/src/**/*.ts", "apps/**/src/**/*.html"), ()),),
            global_ignores=(),
            projects=(project,),
            python_targets=("apps", "scripts"),
        )

    def test_glob_matches_nested_source_and_not_a_neighbor(self):
        self.assertTrue(
            self.inventory.glob_match("apps/media/frontend/src/format.mjs", "apps/**/src/**/*.mjs")
        )
        self.assertTrue(self.inventory.glob_match("apps/web/src/main.ts", "apps/web/src/**/*.ts"))
        self.assertFalse(
            self.inventory.glob_match(
                "apps/travel/frontend/src/labels.mjs", "apps/travel/frontend/vendor/**"
            )
        )
        self.assertEqual(
            self.inventory.repo_glob(
                ROOT / "apps/web/tsconfig.app.json",
                "../media/frontend/src/**/*.mjs",
                ROOT,
            ),
            "apps/media/frontend/src/**/*.mjs",
        )

    def test_typecheck_projects_reads_only_the_web_recipe(self):
        makefile = (
            "typecheck-web:\n"
            "\tnpx tsc -p apps/web/tsconfig.app.json --noEmit --pretty false\n"
            "\tnpx tsc -p packages/tsconfig.json --noEmit --pretty false\n"
            "\n"
            "typecheck-python:\n"
            "\techo skip\n"
        )
        self.assertEqual(
            self.inventory.typecheck_projects(makefile),
            ["apps/web/tsconfig.app.json", "packages/tsconfig.json"],
        )

    def test_local3_vendor_generated_and_tests_are_excluded_without_hiding_neighbors(self):
        samples = {
            "apps/travel/frontend/vendor/leaflet.mjs": "vendor",
            "apps/site/src/generated/api.d.ts": "generated",
            "apps/media/backend/static/tests/format.test.mjs": "test",
            "apps/finance/frontend/e2e/home.spec.ts": "test",
            "apps/finance/frontend/playwright.config.ts": "test",
            "apps/finance/backend/alembic/versions/new_revision.py": "migration",
            "apps/travel/frontend/src/new-helper.mjs": "production",
            "apps/finance/backend/versions/new.py": "production",
            "apps/travel/frontend/src/vendor-notes.mjs": "production",
        }
        for path, kind in samples.items():
            self.assertEqual(
                self.inventory.classify(path, self.ratchet.excluded_dir)[0], kind, path
            )
        message = self.inventory.gap_message(
            "apps/travel/frontend/src/new-helper.mjs",
            self.owners_for_typescript_only(),
            self.ratchet.excluded_dir,
        )
        self.assertIsNotNone(message)
        self.assertIn("apps/travel/frontend/src/new-helper.mjs", message)
        self.assertIn("eslint", message)
        self.assertIn("typecheck", message)
        self.assertIsNone(
            self.inventory.gap_message(
                "apps/travel/frontend/vendor/leaflet.mjs",
                self.owners_for_typescript_only(),
                self.ratchet.excluded_dir,
            )
        )

    def test_local2_unowned_production_module_names_the_path_and_missing_owner(self):
        message = self.inventory.gap_message(
            "apps/media/frontend/src/orphan-helper.mjs",
            self.owners_for_typescript_only(),
            self.ratchet.excluded_dir,
        )
        self.assertEqual(
            message,
            "apps/media/frontend/src/orphan-helper.mjs: missing eslint, typecheck",
        )
        python_gap = self.inventory.gap_message(
            "packages/time/today.py",
            self.owners_for_typescript_only(),
            self.ratchet.excluded_dir,
        )
        self.assertEqual(python_gap, "packages/time/today.py: missing ruff, mypy")

    def test_local4_new_finding_is_an_allowance_increase(self):
        from collections import Counter

        proposed = Counter({("apps/media/frontend/src/new-helper.mjs", "no-unused-vars"): 1})
        messages = self.ratchet.increase_messages(proposed, Counter(), word="raised", label="base")
        self.assertEqual(
            messages, ["raised apps/media/frontend/src/new-helper.mjs no-unused-vars: 1 (base 0)"]
        )
        with self.assertRaises(SystemExit):
            self.ratchet.guard_update(proposed, Counter(), allow_increase=False)

    def test_live_shipped_sources_have_owners(self):
        gaps = self.inventory.scan(ROOT)
        self.assertEqual(gaps, [])
        owners = self.inventory.load_owners(ROOT)
        self.assertEqual(
            self.inventory.classify(REAL_MJS, self.ratchet.excluded_dir)[0], "production"
        )
        self.assertTrue(self.inventory.eslint_owned(REAL_MJS, owners))
        typed = self.inventory.typecheck_owned(REAL_MJS, owners)
        self.assertEqual(typed, "packages/tsconfig.json")
        self.assertTrue(self.inventory.python_owned("packages/time/today.py", owners))

    def test_local1_shipped_mjs_is_owned_and_inserted_violation_fails(self):
        owners = self.inventory.load_owners(ROOT)
        self.assertTrue(self.inventory.eslint_owned(REAL_MJS, owners))
        self.assertIsNotNone(self.inventory.typecheck_owned(REAL_MJS, owners))
        eslint = ROOT / "node_modules/.bin/eslint"
        tsc = ROOT / "node_modules/.bin/tsc"
        PROBE_MJS.write_text("export const broken = ;\n", encoding="utf-8")
        try:
            lint = subprocess.run(
                [str(eslint), "--config", str(ROOT / "eslint.config.js"), str(PROBE_MJS)],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            typed = subprocess.run(
                [str(tsc), "-p", "apps/web/tsconfig.app.json", "--noEmit", "--pretty", "false"],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
        finally:
            PROBE_MJS.unlink(missing_ok=True)
        lint_output = lint.stdout + lint.stderr
        type_output = typed.stdout + typed.stderr
        self.assertNotEqual(lint.returncode, 0, lint_output[-2000:])
        self.assertIn("ver01-ownership-probe.mjs", lint_output)
        self.assertNotEqual(typed.returncode, 0, type_output[-2000:])
        self.assertIn("ver01-ownership-probe.mjs", type_output)

        PROBE_D_MTS.write_text("export const broken: ;\n", encoding="utf-8")
        try:
            contract = subprocess.run(
                [str(tsc), "-p", "apps/web/tsconfig.app.json", "--noEmit", "--pretty", "false"],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
        finally:
            PROBE_D_MTS.unlink(missing_ok=True)
        contract_output = contract.stdout + contract.stderr
        self.assertNotEqual(contract.returncode, 0, contract_output[-2000:])
        self.assertIn("ver01-ownership-probe.d.mts", contract_output)


if __name__ == "__main__":
    unittest.main()
