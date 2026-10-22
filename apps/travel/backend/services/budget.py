"""Trip budget rollup.

Costs typed on a flight, drive, plan, parking row, or extra budget line are
each counted once. Currencies are never added together.
"""

from dataclasses import dataclass

CATEGORY_LABELS = {
    "outbound_flight": "Outbound flight",
    "inbound_flight": "Inbound flight",
    "connection_flight": "Connecting flight",
    "drive": "Driving",
    "transport": "Other transport",
    "lodging": "Lodging",
    "food": "Food",
    "activity": "Activities",
    "parking": "Parking",
    "other": "Other",
}

CATEGORY_ORDER = list(CATEGORY_LABELS)


def category_for_transport(role: str, mode: str) -> str:
    if mode == "flight" and role == "outbound":
        return "outbound_flight"
    if mode == "flight" and role == "inbound":
        return "inbound_flight"
    if mode == "flight":
        return "connection_flight"
    if mode == "drive":
        return "drive"
    return "transport"


def category_for_plan(kind: str) -> str:
    return {"restaurant": "food", "activity": "activity", "lodging": "lodging"}.get(kind, "other")


@dataclass(frozen=True)
class BudgetInput:
    source: str
    source_id: int
    category: str
    label: str
    amount_cents: int
    currency: str
    paid: bool


def rollup(lines: list[BudgetInput]) -> dict:
    by_currency: dict[str, dict] = {}
    rendered = []
    for line in lines:
        bucket = by_currency.setdefault(
            line.currency,
            {"currency": line.currency, "total_cents": 0, "paid_cents": 0, "categories": {}},
        )
        bucket["total_cents"] += line.amount_cents
        if line.paid:
            bucket["paid_cents"] += line.amount_cents
        bucket["categories"][line.category] = (
            bucket["categories"].get(line.category, 0) + line.amount_cents
        )
        rendered.append(line)

    currencies = []
    for currency in sorted(by_currency):
        bucket = by_currency[currency]
        categories = []
        for category in CATEGORY_ORDER:
            cents = bucket["categories"].get(category)
            if cents is None:
                continue
            categories.append(
                {
                    "category": category,
                    "label": CATEGORY_LABELS[category],
                    "amount_cents": cents,
                }
            )
        currencies.append(
            {
                "currency": currency,
                "total_cents": bucket["total_cents"],
                "paid_cents": bucket["paid_cents"],
                "unpaid_cents": bucket["total_cents"] - bucket["paid_cents"],
                "categories": categories,
            }
        )
    return {"currencies": currencies, "lines": rendered}
