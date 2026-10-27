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


class PlatformBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.allowed = load_checker()._platform_import

    def test_domain_uses_only_declared_platform_contracts(self):
        source = Path("apps/travel/backend/routers/integrations.py")
        for module in ("apps.server.auth", "apps.server.database", "apps.server.errors"):
            self.assertTrue(self.allowed(source, module), module)
        for module in (
            "apps.server.main",
            "apps.server.migrations",
            "apps.server.security_headers",
        ):
            self.assertFalse(self.allowed(source, module), module)

    def test_factory_and_migrations_are_available_only_to_tests(self):
        source = Path("apps/travel/backend/tests/test_pto_allocation.py")
        self.assertTrue(self.allowed(source, "apps.server.main"))
        self.assertTrue(self.allowed(source, "apps.server.migrations"))

    def test_only_web_composes_declared_feature_entrypoints(self):
        checker = load_checker()
        source = checker.ROOT / "apps/web/src/app/routes.ts"
        public_api = checker.ROOT / "apps/travel/frontend/src/public-api"
        self.assertTrue(checker._feature_entrypoint(source, public_api))
        self.assertFalse(
            checker._feature_entrypoint(source, public_api.parent / "travel.component")
        )
        self.assertFalse(
            checker._feature_entrypoint(checker.ROOT / "apps/media/frontend/src/a.ts", public_api)
        )


if __name__ == "__main__":
    unittest.main()
