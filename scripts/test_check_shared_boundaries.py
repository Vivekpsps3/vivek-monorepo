import importlib.util
import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory


def load_checker():
    path = Path(__file__).resolve().parent / "check-shared-boundaries.py"
    spec = importlib.util.spec_from_file_location("check_shared_boundaries", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    # dataclasses look the class up in sys.modules while the module executes.
    sys.modules[spec.name] = module
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
        self.assertTrue(self.allowed(source, "apps.server.path_ids"))
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


def write(root: Path, relative: str, text: str) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def run_checker(root: Path) -> tuple[int, str]:
    checker = load_checker()
    buffer = StringIO()
    with redirect_stdout(buffer):
        code = checker.main(["--root", str(root)])
    return code, buffer.getvalue()


class GraphFixtureTests(unittest.TestCase):
    def test_alias_and_nested_private_imports_fail(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(
                root,
                "tsconfig.json",
                """{
                  "compilerOptions": {
                    "baseUrl": ".",
                    "module": "ES2022",
                    "moduleResolution": "bundler",
                    "paths": { "@finance/*": ["apps/finance/frontend/src/*"] }
                  }
                }
                """,
            )
            write(root, "apps/finance/frontend/src/secret.ts", "export const secret = 1;\n")
            write(
                root,
                "apps/web/src/app/world/engine/private.ts",
                "export const nested = 1;\n",
            )
            write(
                root,
                "apps/web/src/app/hub/alias-leak.ts",
                "import { secret } from '@finance/secret';\nexport const value = secret;\n",
            )
            write(
                root,
                "apps/web/src/app/pixels/relative-leak.ts",
                "import { nested } from '../world/engine/private';\nexport const value = nested;\n",
            )
            code, output = run_checker(root)
        self.assertEqual(code, 1)
        self.assertIn(
            "apps/web/src/app/hub/alias-leak.ts (web:hub) -> "
            "apps/finance/frontend/src/secret.ts (app:finance)",
            output,
        )
        self.assertIn(
            "apps/web/src/app/pixels/relative-leak.ts (web:pixels) -> "
            "apps/web/src/app/world/engine/private.ts (web:world)",
            output,
        )

    def test_public_entry_and_server_composition_pass(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "apps/finance/frontend/src/public-api.ts", "export const api = 1;\n")
            write(root, "apps/web/src/app/town/town.component.ts", "export const town = 1;\n")
            write(
                root,
                "apps/web/src/app/routes.ts",
                "export const finance = () => import('../../../finance/frontend/src/public-api');\n"
                "export const town = () => import('./town/town.component');\n",
            )
            write(root, "apps/finance/backend/app.py", "def register_finance():\n    return None\n")
            write(
                root,
                "apps/server/main.py",
                "def build():\n    from apps.finance.backend.app import register_finance\n"
                "    return register_finance\n",
            )
            write(root, "apps/server/town/inner.py", "value = 1\n")
            write(
                root,
                "apps/server/town/uses.py",
                "from .inner import value\n\n__all__ = ['value']\n",
            )
            code, output = run_checker(root)
        self.assertEqual(code, 0, output)
        self.assertIn("check-shared-boundaries: OK", output)

    def test_server_platform_file_is_not_exempt(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "apps/finance/backend/app.py", "def register_finance():\n    return None\n")
            write(
                root,
                "apps/server/main.py",
                "def build():\n    from apps.finance.backend.app import register_finance\n"
                "    return register_finance\n",
            )
            write(
                root,
                "apps/server/checks.py",
                "from apps.finance.backend.app import register_finance\n",
            )
            code, output = run_checker(root)
        self.assertEqual(code, 1)
        self.assertIn("apps/server/checks.py (server:platform)", output)
        self.assertIn("app:finance", output)
        self.assertNotIn("apps/server/main.py", output)

    def test_comments_and_strings_are_not_edges(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "apps/finance/frontend/src/secret.ts", "export const secret = 1;\n")
            write(root, "apps/finance/backend/secret.py", "secret = 1\n")
            write(
                root,
                "apps/media/frontend/src/note.ts",
                "// import { secret } from '../../../finance/frontend/src/secret';\n"
                "export const text = \"from '../../../finance/frontend/src/secret'\";\n",
            )
            write(
                root,
                "apps/travel/backend/note.py",
                'note = "from apps.finance.backend.secret import secret"\n',
            )
            write(
                root,
                "apps/web/src/app/reexport.ts",
                "export { secret } from '../../../finance/frontend/src/secret';\n",
            )
            write(
                root,
                "apps/travel/frontend/src/need.js",
                "const { secret } = require('../../../finance/frontend/src/secret');\n"
                "module.exports = { secret };\n",
            )
            write(
                root,
                "apps/site/src/typed.ts",
                "import type { secret } from '../../finance/frontend/src/secret';\n"
                "export type Alias = typeof secret;\n",
            )
            write(
                root,
                "apps/media/frontend/src/lazy.ts",
                "export const load = () => import('../../../finance/frontend/src/secret');\n",
            )
            code, output = run_checker(root)
        self.assertEqual(code, 1)
        self.assertNotIn("note.ts", output)
        self.assertNotIn("note.py", output)
        self.assertIn("apps/web/src/app/reexport.ts", output)
        self.assertIn("[export ", output)
        self.assertIn("apps/travel/frontend/src/need.js", output)
        self.assertIn("[require ", output)
        self.assertIn("apps/site/src/typed.ts", output)
        self.assertIn("[type ", output)
        self.assertIn("apps/media/frontend/src/lazy.ts", output)
        self.assertIn("[dynamic ", output)

    def test_python_relative_and_package_edges(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "apps/server/town/inner.py", "value = 1\n")
            write(root, "apps/finance/frontend/src/secret.ts", "export const secret = 1;\n")
            write(
                root,
                "apps/server/world/escape.py",
                "from ..town.inner import value\n",
            )
            write(
                root,
                "packages/ui/src/leak.ts",
                "import { secret } from '../../../apps/finance/frontend/src/secret';\n"
                "export const used = secret;\n",
            )
            code, output = run_checker(root)
        self.assertEqual(code, 1)
        self.assertIn(
            "apps/server/world/escape.py (server:world) -> apps/server/town/inner.py (server:town)",
            output,
        )
        self.assertIn(
            "packages/ui/src/leak.ts (package:ui) -> "
            "apps/finance/frontend/src/secret.ts (app:finance)",
            output,
        )

    def test_cycle_names_both_owners(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(
                root,
                "apps/web/src/app/town/a.ts",
                "import { b } from '../world/b';\nexport const a = b;\n",
            )
            write(
                root,
                "apps/web/src/app/world/b.ts",
                "import { a } from '../town/a';\nexport const b = a;\n",
            )
            code, output = run_checker(root)
        self.assertEqual(code, 1)
        self.assertIn("import cycle: web:town <-> web:world", output)
        self.assertIn("(web:town)", output)
        self.assertIn("(web:world)", output)

    def test_reviewed_file_does_not_cover_a_new_file(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "apps/web/src/app/pixels/pixels-model.ts", "export const score = 1;\n")
            write(
                root,
                "apps/web/src/app/hub/hub.component.ts",
                "import { score } from '../pixels/pixels-model';\nexport const used = score;\n",
            )
            write(
                root,
                "apps/web/src/app/hub/extra.ts",
                "import { score } from '../pixels/pixels-model';\nexport const used = score;\n",
            )
            code, output = run_checker(root)
        self.assertEqual(code, 1)
        self.assertIn("apps/web/src/app/hub/extra.ts", output)
        self.assertNotIn("hub.component.ts", output)

    def test_one_import_owner_remains(self):
        checker = load_checker()
        source = Path(checker.__file__).read_text(encoding="utf-8")
        self.assertNotIn("IMPORT_RE", source)
        self.assertNotIn('source_app != "server"', source)
        self.assertNotIn("def import_target", source)
        self.assertIn("def check_boundaries", source)
        self.assertTrue(checker.REVIEWED)
        self.assertTrue(all(item.removal_owner for item in checker.REVIEWED))
        self.assertNotIn("apps/server", checker.SERVER_COMPOSITION)
        for path in checker.SERVER_COMPOSITION:
            self.assertTrue(path.endswith(".py"))
        self.assertIn("apps/server/main.py", checker.SERVER_COMPOSITION)
        self.assertNotIn("apps/server/checks.py", checker.SERVER_COMPOSITION)

    def test_sink_scope_is_finance_frontend_and_package_src(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "apps/travel/frontend/src/page.ts", "document.write('x');\n")
            write(root, "apps/finance/frontend/src/page.ts", "const label = 'inner';\n")
            code, output = run_checker(root)
            self.assertEqual(code, 0, output)
            write(root, "apps/finance/frontend/src/bad.ts", "el.innerHTML = value;\n")
            code, output = run_checker(root)
            self.assertEqual(code, 1)
            self.assertIn("apps/finance/frontend/src/bad.ts", output)
            self.assertNotIn("apps/travel/frontend/src/page.ts", output)
            write(root, "packages/ui/src/bad.ts", "el.outerHTML = value;\n")
            code, output = run_checker(root)
            self.assertIn("packages/ui/src/bad.ts", output)
            write(
                root,
                "apps/finance/frontend/src/app/services/toast.service.ts",
                "export const toast = 1;\n",
            )
            code, output = run_checker(root)
            self.assertIn("generic Finance UI implementation belongs in packages/ui", output)


if __name__ == "__main__":
    unittest.main()
