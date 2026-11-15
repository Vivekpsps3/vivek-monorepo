"""Route and discovery half of the disposable REF-01 proof.

The vault create/reload/conflict/export half stays in the Finance test of the
same name. This module does not register a production route or source file.
"""

import importlib.util
import json
import sys
from pathlib import Path

from apps.server.tests.test_route_parity import (
    load_manifest,
    registry_sections,
    settings_parity_errors,
)

ROOT = Path(__file__).resolve().parents[3]
ROUTE = "ref01-probe"
UNOWNED = "apps/ref01-probe.mjs"


def _inventory():
    path = ROOT / "scripts" / "source_inventory.py"
    spec = importlib.util.spec_from_file_location("ref01_source_inventory", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_unregistered_probe_fails_route_parity_and_source_discovery():
    manifest = load_manifest()
    assert ROUTE not in json.dumps(manifest)
    assert settings_parity_errors(manifest, [*registry_sections(), ROUTE]) == [
        f"missing mounted settings route settings/{ROUTE} owner=settings"
    ]

    inventory = _inventory()
    ratchet = inventory.load_ratchet()
    owners = inventory.load_owners()
    assert inventory.gap_message(UNOWNED, owners, ratchet.excluded_dir) == (
        f"{UNOWNED}: missing eslint, typecheck"
    )
    assert inventory.scan(owners=owners) == []
