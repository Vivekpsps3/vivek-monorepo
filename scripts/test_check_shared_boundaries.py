import importlib.util
import unittest
from pathlib import Path


def load_checker():
    path = Path(__file__).resolve().parent / "check-shared-boundaries.py"
    spec = importlib.util.spec_from_file_location("check_shared_boundaries", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SinkRegexTests(unittest.TestCase):
    def setUp(self):
        self.sink = load_checker().SINK_RE

    def test_angular_binding_and_dom_sinks_match(self):
        samples = [
            '<div [innerHtml]="v">',
            "el.innerHTML = x",
            "el.outerHTML = x",
            "node.insertAdjacentHTML('beforeend', html)",
            "document.write(html)",
            "range.createContextualFragment(html)",
            "el.setHTMLUnsafe(html)",
            '<iframe srcdoc="<b>x</b>">',
            "bypassSecurityTrustHtml(value)",
        ]
        for sample in samples:
            self.assertIsNotNone(self.sink.search(sample), sample)

    def test_plain_words_do_not_match(self):
        self.assertIsNone(self.sink.search("const inner = html"))
        self.assertIsNone(self.sink.search("function writeNote() { return 1 }"))


if __name__ == "__main__":
    unittest.main()
