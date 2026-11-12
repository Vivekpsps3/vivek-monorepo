#!/usr/bin/env python3
"""Pin server-accepted collections to the Finance and Health owner subsets.

Finance bags and Health collections stay different subsets. This check fails
when a server-accepted name is missing from those subsets, when a declared
owner name is not accepted, or when the Finance foreign-collection copy
drifts from the Health owner subset.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

FINANCE_PERSISTENCE = ROOT / "apps/finance/frontend/src/app/crypto/encrypted-store.persistence.ts"
HEALTH_STORE = ROOT / "apps/web/src/app/town/health/health-store.service.ts"


def exported_strings(source: str, name: str) -> set[str]:
    match = re.search(rf"export const {name}\b[^=]*=\s*([\s\S]*?);", source)
    if match is None:
        raise SystemExit(f"missing export const {name}")
    found = re.findall(r"""['"]([A-Za-z0-9_]+)['"]""", match.group(1))
    if not found:
        raise SystemExit(f"{name} declares no collection names")
    return set(found)


def load_declared_subsets() -> tuple[set[str], set[str], set[str]]:
    finance_source = FINANCE_PERSISTENCE.read_text(encoding="utf-8")
    health_source = HEALTH_STORE.read_text(encoding="utf-8")
    finance = exported_strings(finance_source, "FINANCE_COLLECTIONS")
    foreign = exported_strings(finance_source, "FINANCE_FOREIGN_COLLECTIONS")
    health = exported_strings(health_source, "HEALTH_OWNER_COLLECTIONS")
    return finance, foreign, health


def evaluate(
    accepted: set[str],
    finance: set[str],
    health: set[str],
    foreign: set[str],
) -> list[str]:
    """Return contract failures. An empty list means the subsets agree."""
    from apps.finance.backend.services.encrypted_storage import (
        CollectionContractError,
        CollectionPolicy,
        assert_collection_contract,
    )

    errors: list[str] = []
    if foreign != health:
        errors.append(
            "Finance foreign subset "
            f"{sorted(foreign)} is not the Health owner subset {sorted(health)}"
        )
    try:
        assert_collection_contract(
            frozenset(accepted),
            CollectionPolicy(finance=frozenset(finance), health=frozenset(health)),
        )
    except CollectionContractError as exc:
        errors.append(str(exc))
    return errors


def main() -> int:
    from apps.finance.backend.services.encrypted_storage import ALLOWED_COLLECTIONS

    finance, foreign, health = load_declared_subsets()
    errors = evaluate(set(ALLOWED_COLLECTIONS), finance, health, foreign)
    if errors:
        print("\n".join(errors))
        return 1
    print("collection policy parity passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
