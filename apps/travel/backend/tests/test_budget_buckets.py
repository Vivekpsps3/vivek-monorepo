"""Per-currency cost buckets on the trip budget rollup."""

import pytest

from apps.travel.backend.services.budget import (
    BUCKET_ORDER,
    BudgetInput,
    rollup,
)

CATEGORIES = (
    "outbound_flight",
    "inbound_flight",
    "connection_flight",
    "drive",
    "transport",
    "lodging",
    "food",
    "activity",
    "parking",
    "other",
)


def _line(source, source_id, category, amount_cents, currency="USD", paid=False, label=None):
    return BudgetInput(
        source,
        source_id,
        category,
        label or category,
        amount_cents,
        currency,
        paid,
    )


def _by_currency(rolled):
    return {item["currency"]: item for item in rolled["currencies"]}


def test_rollup_buckets_map_categories():
    lines = [
        _line("manual", index + 1, category, 100, paid=index % 2 == 0)
        for index, category in enumerate(CATEGORIES)
    ]
    currency = rollup(lines)["currencies"][0]
    buckets = {item["bucket"]: item for item in currency["buckets"]}
    assert [item["bucket"] for item in currency["buckets"]] == list(BUCKET_ORDER)
    assert buckets["transport"] == {
        "bucket": "transport",
        "label": "Transport",
        "total_cents": 500,
        "paid_cents": 300,
        "unpaid_cents": 200,
    }
    assert buckets["stays_plans"] == {
        "bucket": "stays_plans",
        "label": "Stays and plans",
        "total_cents": 300,
        "paid_cents": 100,
        "unpaid_cents": 200,
    }
    assert buckets["parking"]["total_cents"] == 100
    assert buckets["parking"]["paid_cents"] == 100
    assert buckets["parking"]["unpaid_cents"] == 0
    assert buckets["other"]["total_cents"] == 100
    assert buckets["other"]["paid_cents"] == 0
    assert buckets["other"]["unpaid_cents"] == 100
    assert currency["total_cents"] == 1000


def test_rollup_bucket_order_and_no_empty_buckets():
    assert rollup([]) == {"currencies": [], "lines": []}
    rolled = rollup(
        [
            _line("manual", 1, "other", 100),
            _line("parking", 2, "parking", 200, paid=True),
        ]
    )
    assert [item["bucket"] for item in rolled["currencies"][0]["buckets"]] == ["parking", "other"]
    only_transport = rollup([_line("transport", 1, "drive", 50)])
    assert [item["bucket"] for item in only_transport["currencies"][0]["buckets"]] == ["transport"]


@pytest.mark.parametrize(
    "lines",
    [
        [_line("transport", 1, "outbound_flight", 1000, paid=True)],
        [_line("transport", 1, "outbound_flight", 1000, paid=False)],
        [
            _line("transport", 1, "outbound_flight", 1000, paid=True),
            _line("plan", 2, "food", 500),
            _line("parking", 3, "parking", 250, paid=True),
            _line("manual", 4, "other", 125),
        ],
        [
            _line("transport", 1, "drive", 0),
            _line("manual", 2, "lodging", 300, currency="EUR", paid=True),
            _line("manual", 3, "activity", 100, currency="EUR"),
        ],
        [
            _line("manual", 1, "souvenirs", 40, paid=True),
            _line("manual", 2, "other", 60, currency="JPY"),
        ],
    ],
)
def test_paid_plus_unpaid_equals_total_per_bucket_and_currency(lines):
    for currency in rollup(lines)["currencies"]:
        assert currency["paid_cents"] + currency["unpaid_cents"] == currency["total_cents"]
        for item in currency["buckets"]:
            assert item["paid_cents"] + item["unpaid_cents"] == item["total_cents"]


def test_bucket_totals_sum_to_currency_total():
    rolled = rollup(
        [
            _line("transport", 1, "outbound_flight", 9000, paid=True),
            _line("transport", 2, "inbound_flight", 4000),
            _line("plan", 3, "food", 2500),
            _line("plan", 4, "lodging", 8000, paid=True),
            _line("parking", 5, "parking", 1050),
            _line("manual", 6, "other", 1500, paid=True),
            _line("manual", 7, "not_a_category", 500),
        ]
    )
    currency = rolled["currencies"][0]
    assert sum(item["total_cents"] for item in currency["buckets"]) == currency["total_cents"]
    assert sum(item["paid_cents"] for item in currency["buckets"]) == currency["paid_cents"]
    assert currency["total_cents"] == 26550


def test_currencies_kept_separate_in_buckets():
    by_currency = _by_currency(
        rollup(
            [
                _line("transport", 1, "outbound_flight", 9000, paid=True),
                _line("transport", 2, "inbound_flight", 4000),
                _line("plan", 3, "food", 2000, currency="EUR"),
                _line("manual", 4, "other", 500, currency="EUR", paid=True),
            ]
        )
    )
    assert set(by_currency) == {"EUR", "USD"}
    usd = {item["bucket"]: item for item in by_currency["USD"]["buckets"]}
    eur = {item["bucket"]: item for item in by_currency["EUR"]["buckets"]}
    assert set(usd) == {"transport"}
    assert usd["transport"]["total_cents"] == 13000
    assert usd["transport"]["paid_cents"] == 9000
    assert set(eur) == {"stays_plans", "other"}
    assert eur["stays_plans"]["total_cents"] == 2000
    assert eur["other"]["total_cents"] == 500
    assert by_currency["USD"]["total_cents"] == 13000
    assert by_currency["EUR"]["total_cents"] == 2500


def test_manual_lodging_line_goes_to_stays_and_plans():
    currency = rollup([_line("manual", 1, "lodging", 25000, label="Hotel deposit")])["currencies"][
        0
    ]
    assert currency["buckets"] == [
        {
            "bucket": "stays_plans",
            "label": "Stays and plans",
            "total_cents": 25000,
            "paid_cents": 0,
            "unpaid_cents": 25000,
        }
    ]
    assert currency["categories"][0]["category"] == "lodging"


def test_unknown_category_falls_back_to_other():
    currency = rollup([_line("manual", 1, "souvenirs", 1500, label="Legacy mug")])["currencies"][0]
    assert currency["total_cents"] == 1500
    assert currency["categories"] == []
    assert currency["buckets"] == [
        {
            "bucket": "other",
            "label": "Other costs",
            "total_cents": 1500,
            "paid_cents": 0,
            "unpaid_cents": 1500,
        }
    ]


def test_zero_cost_line_still_emits_its_bucket():
    rolled = rollup([_line("parking", 1, "parking", 0, label="Lot")])
    currency = rolled["currencies"][0]
    assert len(rolled["lines"]) == 1
    assert currency["total_cents"] == 0
    assert currency["categories"] == [
        {"category": "parking", "label": "Parking", "amount_cents": 0}
    ]
    assert currency["buckets"] == [
        {
            "bucket": "parking",
            "label": "Parking",
            "total_cents": 0,
            "paid_cents": 0,
            "unpaid_cents": 0,
        }
    ]
