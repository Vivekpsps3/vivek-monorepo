"""Per-currency cost buckets and home-card countdown fields."""

from datetime import date, timedelta

import pytest

from apps.server.auth import Principal, require_principal
from apps.travel.backend.models import BudgetLine
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


def _create_trip(client, *, title, start, end, transports=None):
    response = client.post(
        "/api/trips",
        json={
            "title": title,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "transports": transports or [],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _flight(number, cost, *, currency="USD", paid=False):
    return {
        "role": "outbound",
        "mode": "flight",
        "number": number,
        "cost": cost,
        "currency": currency,
        "paid": paid,
    }


def test_trip_with_no_costs_has_empty_budget(client):
    start = date.today() + timedelta(days=5)
    trip = _create_trip(client, title="No costs", start=start, end=start + timedelta(days=1))
    detail = client.get(f"/api/trips/{trip['id']}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["budget"]["currencies"] == []
    assert detail.json()["budget"]["lines"] == []
    assert detail.json()["budget"]["manual"] == []


def test_null_cost_lines_are_skipped(client):
    start = date.today() + timedelta(days=6)
    end = start + timedelta(days=2)
    trip = _create_trip(
        client,
        title="Skip nulls",
        start=start,
        end=end,
        transports=[
            {"role": "outbound", "mode": "flight", "number": "UA 1"},
            _flight("UA 2", "10.00"),
        ],
    )
    planned = client.post(
        f"/api/trips/{trip['id']}/plans",
        json={"on_date": start.isoformat(), "kind": "activity", "title": "Free walk"},
    )
    assert planned.status_code == 201, planned.text
    parked = client.post(f"/api/trips/{trip['id']}/parking", json={"place_name": "Street"})
    assert parked.status_code == 201, parked.text
    budget = client.get(f"/api/trips/{trip['id']}").json()["budget"]
    assert [line["amount"] for line in budget["lines"]] == ["10.00"]
    assert budget["lines"][0]["amount_cents"] == 1000
    assert budget["currencies"][0]["total"] == "10.00"
    assert budget["currencies"][0]["total_cents"] == 1000


def test_trip_detail_budget_has_additive_fields(client):
    start = date.today() + timedelta(days=20)
    end = start + timedelta(days=3)
    trip = _create_trip(
        client,
        title="Buckets",
        start=start,
        end=end,
        transports=[_flight("UA 100", "90.00", paid=True)],
    )
    planned = client.post(
        f"/api/trips/{trip['id']}/plans",
        json={
            "on_date": start.isoformat(),
            "kind": "restaurant",
            "title": "Ramen",
            "place_name": "Shibuya",
            "cost": "40.00",
        },
    )
    assert planned.status_code == 201, planned.text
    parked = client.post(
        f"/api/trips/{trip['id']}/parking",
        json={"place_name": "SFO garage", "cost": "10.50"},
    )
    assert parked.status_code == 201, parked.text
    extra = client.post(
        f"/api/trips/{trip['id']}/budget-lines",
        json={
            "category": "other",
            "label": "Travel insurance",
            "amount": "15.00",
            "currency": "USD",
            "paid": True,
        },
    )
    assert extra.status_code == 201, extra.text
    detail = client.get(f"/api/trips/{trip['id']}")
    assert detail.status_code == 200, detail.text
    budget = detail.json()["budget"]
    assert list(budget) == ["currencies", "lines", "manual"]
    usd = budget["currencies"][0]
    assert list(usd) == [
        "currency",
        "total",
        "paid",
        "unpaid",
        "categories",
        "total_cents",
        "paid_cents",
        "unpaid_cents",
        "buckets",
    ]
    assert usd["currency"] == "USD"
    assert usd["total"] == "155.50"
    assert usd["paid"] == "105.00"
    assert usd["unpaid"] == "50.50"
    assert usd["total_cents"] == 15550
    assert usd["paid_cents"] == 10500
    assert usd["unpaid_cents"] == 5050
    assert usd["paid_cents"] + usd["unpaid_cents"] == usd["total_cents"]
    assert usd["categories"] == [
        {"category": "outbound_flight", "label": "Outbound flight", "amount": "90.00"},
        {"category": "food", "label": "Food", "amount": "40.00"},
        {"category": "parking", "label": "Parking", "amount": "10.50"},
        {"category": "other", "label": "Other", "amount": "15.00"},
    ]
    assert usd["buckets"] == [
        {
            "bucket": "transport",
            "label": "Transport",
            "total_cents": 9000,
            "paid_cents": 9000,
            "unpaid_cents": 0,
            "total": "90.00",
            "paid": "90.00",
            "unpaid": "0.00",
        },
        {
            "bucket": "stays_plans",
            "label": "Stays and plans",
            "total_cents": 4000,
            "paid_cents": 0,
            "unpaid_cents": 4000,
            "total": "40.00",
            "paid": "0.00",
            "unpaid": "40.00",
        },
        {
            "bucket": "parking",
            "label": "Parking",
            "total_cents": 1050,
            "paid_cents": 0,
            "unpaid_cents": 1050,
            "total": "10.50",
            "paid": "0.00",
            "unpaid": "10.50",
        },
        {
            "bucket": "other",
            "label": "Other costs",
            "total_cents": 1500,
            "paid_cents": 1500,
            "unpaid_cents": 0,
            "total": "15.00",
            "paid": "15.00",
            "unpaid": "0.00",
        },
    ]
    assert sum(item["total_cents"] for item in usd["buckets"]) == usd["total_cents"]
    meal = next(line for line in budget["lines"] if line["category"] == "food")
    assert meal["source"] == "plan"
    assert meal["label"] == "Ramen · Shibuya"
    assert meal["category_label"] == "Food"
    assert meal["amount"] == "40.00"
    assert meal["amount_cents"] == 4000
    assert meal["bucket"] == "stays_plans"
    assert meal["paid"] is False
    flight = next(line for line in budget["lines"] if line["category"] == "outbound_flight")
    assert list(flight) == [
        "source",
        "source_id",
        "category",
        "label",
        "category_label",
        "amount",
        "currency",
        "paid",
        "amount_cents",
        "bucket",
    ]
    assert flight["amount"] == "90.00"
    assert flight["amount_cents"] == 9000
    assert flight["bucket"] == "transport"
    assert flight["paid"] is True
    assert flight["currency"] == "USD"
    manual = budget["manual"][0]
    assert list(manual) == [
        "id",
        "category",
        "category_label",
        "label",
        "amount",
        "currency",
        "paid",
        "notes",
        "amount_cents",
    ]
    assert manual["category"] == "other"
    assert manual["category_label"] == "Other"
    assert manual["label"] == "Travel insurance"
    assert manual["amount"] == "15.00"
    assert manual["amount_cents"] == 1500
    assert manual["currency"] == "USD"
    assert manual["paid"] is True
    assert manual["notes"] is None


def test_lines_and_manual_have_amount_cents(client):
    start = date.today() + timedelta(days=9)
    trip = _create_trip(
        client,
        title="Cents",
        start=start,
        end=start + timedelta(days=2),
        transports=[_flight("UA 12", "12.50", paid=True)],
    )
    saved = client.post(
        f"/api/trips/{trip['id']}/budget-lines",
        json={"category": "food", "label": "Snacks", "amount": "3.05", "currency": "USD"},
    )
    assert saved.status_code == 201, saved.text
    budget = client.get(f"/api/trips/{trip['id']}").json()["budget"]
    flight = next(line for line in budget["lines"] if line["source"] == "transport")
    snack = next(line for line in budget["lines"] if line["source"] == "manual")
    assert flight["amount"] == "12.50"
    assert flight["amount_cents"] == 1250
    assert flight["bucket"] == "transport"
    assert snack["amount"] == "3.05"
    assert snack["amount_cents"] == 305
    assert snack["bucket"] == "stays_plans"
    assert "bucket" not in budget["manual"][0]
    assert budget["manual"][0]["amount"] == "3.05"
    assert budget["manual"][0]["amount_cents"] == 305


def test_legacy_unknown_category_row_lands_in_other(client):
    start = date.today() + timedelta(days=8)
    trip = _create_trip(client, title="Legacy", start=start, end=start + timedelta(days=1))
    with client.app.state.database.sessionmaker.begin() as db:
        db.add(
            BudgetLine(
                trip_id=trip["id"],
                category="souvenirs",
                label="Legacy mug",
                amount_cents=1500,
                currency="USD",
                paid=False,
            )
        )
    detail = client.get(f"/api/trips/{trip['id']}")
    assert detail.status_code == 200, detail.text
    budget = detail.json()["budget"]
    assert budget["currencies"][0]["total_cents"] == 1500
    assert budget["currencies"][0]["buckets"] == [
        {
            "bucket": "other",
            "label": "Other costs",
            "total_cents": 1500,
            "paid_cents": 0,
            "unpaid_cents": 1500,
            "total": "15.00",
            "paid": "0.00",
            "unpaid": "15.00",
        }
    ]
    assert budget["lines"][0]["category"] == "souvenirs"
    assert budget["lines"][0]["category_label"] == "souvenirs"
    assert budget["lines"][0]["bucket"] == "other"
    assert budget["lines"][0]["amount_cents"] == 1500
    assert budget["manual"][0]["amount_cents"] == 1500
    assert budget["manual"][0]["category_label"] == "souvenirs"


def test_home_cards_carry_buckets(client):
    today = date.today()
    _create_trip(
        client,
        title="Already home",
        start=today - timedelta(days=10),
        end=today - timedelta(days=2),
        transports=[_flight("UA 30", "30.00")],
    )
    _create_trip(
        client,
        title="Here now",
        start=today - timedelta(days=1),
        end=today + timedelta(days=2),
        transports=[_flight("UA 10", "10.00", paid=True)],
    )
    _create_trip(
        client,
        title="Soon",
        start=today + timedelta(days=12),
        end=today + timedelta(days=14),
        transports=[_flight("UA 20", "20.00")],
    )
    home = client.get("/api/home")
    assert home.status_code == 200, home.text
    body = home.json()

    def card(group, title):
        found = [item for item in body[group] if item["title"] == title]
        assert len(found) == 1
        return found[0]

    past = card("past", "Already home")
    current = card("in_progress", "Here now")
    upcoming = card("upcoming", "Soon")
    assert past["budget"]["currencies"][0]["buckets"][0]["total_cents"] == 3000
    assert current["budget"]["currencies"][0]["buckets"][0]["bucket"] == "transport"
    assert current["budget"]["currencies"][0]["total_cents"] == 1000
    assert current["budget"]["currencies"][0]["paid_cents"] == 1000
    assert upcoming["budget"]["currencies"][0]["total"] == "20.00"
    assert upcoming["budget"]["currencies"][0]["buckets"][0]["total_cents"] == 2000
    assert upcoming["budget"]["currencies"][0]["buckets"][0]["label"] == "Transport"


def test_home_cards_have_days_until_and_next_action(client):
    today = date.today()
    _create_trip(
        client,
        title="Already home",
        start=today - timedelta(days=10),
        end=today - timedelta(days=1),
    )
    _create_trip(
        client,
        title="Here now",
        start=today - timedelta(days=1),
        end=today + timedelta(days=2),
    )
    _create_trip(
        client,
        title="Tomorrow",
        start=today + timedelta(days=1),
        end=today + timedelta(days=3),
    )
    _create_trip(
        client,
        title="Later",
        start=today + timedelta(days=43),
        end=today + timedelta(days=46),
    )
    body = client.get("/api/home").json()
    by_title = {
        item["title"]: item for item in body["in_progress"] + body["upcoming"] + body["past"]
    }
    assert by_title["Here now"]["phase"] == "in_progress"
    assert by_title["Here now"]["days_until"] == 0
    assert by_title["Here now"]["next_action"] == "Open today's plan"
    assert by_title["Tomorrow"]["phase"] == "upcoming"
    assert by_title["Tomorrow"]["days_until"] == 1
    assert by_title["Tomorrow"]["next_action"] == "Leaves tomorrow"
    assert by_title["Later"]["phase"] == "upcoming"
    assert by_title["Later"]["days_until"] == 43
    assert by_title["Later"]["next_action"] == "Review the plan"
    past = by_title["Already home"]
    assert past["phase"] == "past"
    assert "days_until" not in past
    assert "next_action" not in past
    assert all("days_until" not in item and "next_action" not in item for item in body["past"])


def test_budget_buckets_owner_scoped(client):
    start = date.today() + timedelta(days=15)
    trip = _create_trip(
        client,
        title="Private buckets",
        start=start,
        end=start + timedelta(days=2),
        transports=[_flight("UA 77", "77.00", paid=True)],
    )
    mine = client.get(f"/api/trips/{trip['id']}")
    assert mine.status_code == 200, mine.text
    assert mine.json()["budget"]["currencies"][0]["total_cents"] == 7700
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    assert client.get(f"/api/trips/{trip['id']}").status_code == 404
    home = client.get("/api/home")
    assert home.status_code == 200, home.text
    body = home.json()
    cards = body["in_progress"] + body["upcoming"] + body["past"]
    assert cards == []
    assert "Private buckets" not in home.text
