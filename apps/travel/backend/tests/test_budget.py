"""Budget lines from flights, plans, parking, and extras stay separate by currency."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.travel.backend.services.budget import BudgetInput, category_for_transport, rollup


def test_flight_roles_land_in_outbound_and_inbound_buckets():
    assert category_for_transport("outbound", "flight") == "outbound_flight"
    assert category_for_transport("inbound", "flight") == "inbound_flight"
    assert category_for_transport("connection", "flight") == "connection_flight"
    assert category_for_transport("outbound", "drive") == "drive"


def test_rollup_keeps_currencies_apart_and_counts_every_line():
    rolled = rollup(
        [
            BudgetInput("transport", 1, "outbound_flight", "UA 837", 40000, "USD", True),
            BudgetInput("transport", 2, "inbound_flight", "UA 838", 35000, "USD", False),
            BudgetInput("manual", 3, "outbound_flight", "Seat upgrade", 5000, "USD", False),
            BudgetInput("plan", 4, "food", "Dinner", 8000, "USD", False),
            BudgetInput("parking", 5, "parking", "Airport", 4000, "USD", False),
            BudgetInput("manual", 6, "other", "Transit card", 2000, "EUR", False),
        ]
    )
    by_currency = {bucket["currency"]: bucket for bucket in rolled["currencies"]}
    assert by_currency["USD"]["total_cents"] == 92000
    assert by_currency["USD"]["paid_cents"] == 40000
    assert by_currency["EUR"]["total_cents"] == 2000
    outbound = next(item for item in by_currency["USD"]["categories"] if item["category"] == "outbound_flight")
    assert outbound["amount_cents"] == 45000
    assert len(rolled["lines"]) == 6
