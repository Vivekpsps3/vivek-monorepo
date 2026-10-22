import importlib.util
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


if __name__ == "__main__":
    unittest.main()
