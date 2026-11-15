"""Route half of the disposable REF-01 proof.

The vault round trip stays in the Finance test of the same name. Source
discovery stays in ``scripts/test_source_inventory.py``, which runs after Node
is installed. This module does not register a production route.
"""

import json

from apps.server.tests.test_route_parity import (
    load_manifest,
    registry_sections,
    settings_parity_errors,
)

ROUTE = "ref01-probe"


def test_unregistered_probe_fails_route_parity():
    manifest = load_manifest()
    assert ROUTE not in json.dumps(manifest)
    assert settings_parity_errors(manifest, [*registry_sections(), ROUTE]) == [
        f"missing mounted settings route settings/{ROUTE} owner=settings"
    ]
