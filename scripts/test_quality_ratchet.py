import contextlib
import importlib.util
import io
import tempfile
import unittest
from collections import Counter
from pathlib import Path


def load_ratchet():
    path = Path(__file__).resolve().parent / "quality_ratchet.py"
    spec = importlib.util.spec_from_file_location("quality_ratchet", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RatchetTests(unittest.TestCase):
    def setUp(self):
        self.ratchet = load_ratchet()

    def test_matching_counts_pass(self):
        counts = Counter({("apps/a.py", "F401"): 2})
        self.assertEqual(self.ratchet.compare(counts, counts.copy()), [])

    def test_new_finding_fails(self):
        current = Counter({("apps/a.py", "F401"): 1})
        messages = self.ratchet.compare(current, Counter())
        self.assertEqual(messages, ["new apps/a.py F401: 1 (baseline 0)"])

    def test_increased_count_fails(self):
        current = Counter({("apps/a.py", "I001"): 3})
        baseline = Counter({("apps/a.py", "I001"): 2})
        messages = self.ratchet.compare(current, baseline)
        self.assertEqual(messages, ["new apps/a.py I001: 3 (baseline 2)"])

    def test_fixed_finding_is_stale_until_the_baseline_shrinks(self):
        current: Counter[tuple[str, str]] = Counter()
        baseline = Counter({("apps/a.py", "UP045"): 4})
        messages = self.ratchet.compare(current, baseline)
        self.assertEqual(messages, ["stale apps/a.py UP045: 0 (baseline 4)"])

    def test_render_and_load_roundtrip(self):
        counts = Counter({("apps/b.py", "SIM102"): 1, ("apps/a.py", "I001"): 2})
        text = self.ratchet.render(counts)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "baseline.txt"
            path.write_text(text)
            self.assertEqual(self.ratchet.load(path), counts)

    def test_mypy_notes_are_not_findings(self):
        stdout = "\n".join(
            [
                "apps/a.py:10: error: bad assignment [assignment]",
                "apps/a.py:10: note: See https://example.test/foo[bar]",
                "apps/a.py:11: error: continued on the next line",
            ]
        )
        self.assertEqual(
            self.ratchet.parse_mypy_output(stdout),
            [("apps/a.py", "assignment")],
        )

    def test_eslint_counts_warnings_and_rejects_parse_errors(self):
        payload = [
            {
                "filePath": str(self.ratchet.ROOT / "apps/a.ts"),
                "messages": [
                    {
                        "ruleId": "@typescript-eslint/no-explicit-any",
                        "severity": 1,
                        "message": "warn",
                    },
                    {"ruleId": "eqeqeq", "severity": 0, "message": "off"},
                ],
            }
        ]
        self.assertEqual(
            self.ratchet.parse_eslint_report(payload),
            [("apps/a.ts", "@typescript-eslint/no-explicit-any")],
        )
        broken = [
            {
                "filePath": str(self.ratchet.ROOT / "apps/a.ts"),
                "messages": [{"ruleId": None, "severity": 2, "message": "Parsing error"}],
            }
        ]
        with self.assertRaises(SystemExit):
            self.ratchet.parse_eslint_report(broken)

    def test_update_refuses_a_higher_count(self):
        current = Counter({("apps/a.py", "F401"): 3})
        baseline = Counter({("apps/a.py", "F401"): 2})
        with self.assertRaises(SystemExit):
            self.ratchet.guard_update(current, baseline, allow_increase=False)
        self.ratchet.guard_update(current, baseline, allow_increase=True)
        shrunk = Counter({("apps/a.py", "F401"): 1})
        self.ratchet.guard_update(shrunk, baseline, allow_increase=False)

    def test_base_allowance_ignores_shrinks(self):
        proposed = Counter({("apps/a.py", "F401"): 1, ("apps/b.py", "I001"): 2})
        base = Counter({("apps/a.py", "F401"): 4})
        messages = self.ratchet.increase_messages(proposed, base, word="raised", label="base")
        self.assertEqual(messages, ["raised apps/b.py I001: 2 (base 0)"])

    def test_suppression_markers(self):
        line = "x = 1  # noqa: F401, E402  # type: ignore[arg-type]"
        self.assertEqual(
            self.ratchet.suppression_markers(line),
            ["noqa:F401", "noqa:E402", "type: ignore[arg-type]"],
        )
        self.assertEqual(
            self.ratchet.suppression_markers("// eslint-disable-next-line eqeqeq"),
            ["eqeqeq"],
        )
        self.assertEqual(
            self.ratchet.suppression_markers("const value = 1; // @ts-expect-error narrow"),
            ["@ts-expect-error"],
        )

    def test_ruff_file_noqa(self):
        self.assertEqual(self.ratchet.suppression_markers("# ruff: noqa"), ["ruff: noqa"])

    def test_ruff_file_noqa_with_code(self):
        self.assertEqual(
            self.ratchet.suppression_markers("# ruff: noqa: F401"),
            ["ruff: noqa:F401"],
        )

    def test_flake8_file_noqa(self):
        self.assertEqual(self.ratchet.suppression_markers("# flake8: noqa"), ["flake8: noqa"])

    def test_noqa_is_case_insensitive(self):
        self.assertEqual(self.ratchet.suppression_markers("x = 1  # NOQA"), ["noqa"])

    def test_noqa_word_in_a_string_is_not_a_suppression(self):
        self.assertEqual(self.ratchet.suppression_markers('s = "the noqa flag"'), [])
        self.assertEqual(self.ratchet.suppression_markers("canoqa = 1"), [])

    def test_mypy_ignore_errors(self):
        self.assertEqual(
            self.ratchet.suppression_markers("# mypy: ignore-errors"),
            ["mypy: ignore-errors"],
        )

    def test_mypy_inline_config(self):
        self.assertEqual(
            self.ratchet.suppression_markers('# mypy: disable-error-code="arg-type"'),
            ["mypy: disable-error-code"],
        )
        self.assertEqual(self.ratchet.suppression_markers("# pyright: ignore"), [])
        self.assertEqual(self.ratchet.suppression_markers("x = 1  # pragma: no branch"), [])

    def test_ts_ignore(self):
        self.assertEqual(self.ratchet.suppression_markers("// @ts-ignore"), ["@ts-ignore"])

    def test_ts_nocheck(self):
        self.assertEqual(self.ratchet.suppression_markers("// @ts-nocheck"), ["@ts-nocheck"])

    def test_pragma_no_cover(self):
        self.assertEqual(
            self.ratchet.suppression_markers("value = 1  # pragma: no cover"),
            ["pragma: no cover"],
        )

    def test_istanbul_ignore(self):
        self.assertEqual(
            self.ratchet.suppression_markers("/* istanbul ignore next */"),
            ["istanbul ignore"],
        )

    def test_c8_ignore(self):
        self.assertEqual(self.ratchet.suppression_markers("/* c8 ignore */"), ["c8 ignore"])

    def test_v8_ignore(self):
        self.assertEqual(self.ratchet.suppression_markers("/* v8 ignore next */"), ["v8 ignore"])

    def test_versions_skip_is_alembic_only(self):
        self.assertTrue(self.ratchet.excluded_dir("apps/finance/backend/alembic/versions"))
        self.assertTrue(self.ratchet.excluded_dir("apps/server/alembic/versions/abc.py"))
        self.assertFalse(self.ratchet.excluded_dir("apps/finance/backend/versions"))

    def test_tools_in_source_reads_the_dict_keys(self):
        source = 'TOOLS = {"ruff": (1, 2), "mypy": (3, 4)}\n'
        self.assertEqual(self.ratchet.tools_in_source(source), {"ruff", "mypy"})
        self.assertEqual(self.ratchet.tools_in_source("x = 1\n"), set())

    def test_removed_tools_catches_a_rename(self):
        source = 'TOOLS = {"ruff": (1, 2), "mypy": (3, 4)}\n'
        self.assertEqual(self.ratchet.removed_tools(source, {"ruff-py", "mypy"}), {"ruff"})
        self.assertEqual(self.ratchet.removed_tools(source, {"ruff", "mypy"}), set())

    def test_list_prints_every_tool(self):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = self.ratchet.main(["quality_ratchet.py", "list"])
        self.assertEqual(code, 0)
        self.assertEqual(stdout.getvalue().splitlines(), sorted(self.ratchet.TOOLS))


if __name__ == "__main__":
    unittest.main()
