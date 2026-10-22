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


if __name__ == "__main__":
    unittest.main()
