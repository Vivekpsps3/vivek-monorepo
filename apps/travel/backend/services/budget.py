"""Trip budget rollup.

Costs typed on a flight, drive, plan, parking row, or extra budget line are
each counted once. Currencies are never added together. The same lines also
roll up into Transport, Stays and plans, Parking, and Other costs.
"""

from dataclasses import dataclass, replace

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

BUCKET_LABELS = {
    "transport": "Transport",
    "stays_plans": "Stays and plans",
    "parking": "Parking",
    "other": "Other costs",
}

BUCKET_ORDER = list(BUCKET_LABELS)

BUCKET_FOR_CATEGORY = {
    "outbound_flight": "transport",
    "inbound_flight": "transport",
    "connection_flight": "transport",
    "drive": "transport",
    "transport": "transport",
    "lodging": "stays_plans",
    "food": "stays_plans",
    "activity": "stays_plans",
    "parking": "parking",
    "other": "other",
}


def bucket_for_category(category: str) -> str:
    return BUCKET_FOR_CATEGORY.get(category, "other")


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
    # Filled by rollup. Callers leave it blank.
    bucket: str = ""


def rollup(lines: list[BudgetInput]) -> dict:
    by_currency: dict[str, dict] = {}
    rendered = []
    for line in lines:
        bucket = by_currency.setdefault(
            line.currency,
            {
                "currency": line.currency,
                "total_cents": 0,
                "paid_cents": 0,
                "categories": {},
                "buckets": {},
            },
        )
        bucket["total_cents"] += line.amount_cents
        if line.paid:
            bucket["paid_cents"] += line.amount_cents
        bucket["categories"][line.category] = (
            bucket["categories"].get(line.category, 0) + line.amount_cents
        )
        key = bucket_for_category(line.category)
        cost_bucket = bucket["buckets"].setdefault(key, {"total_cents": 0, "paid_cents": 0})
        cost_bucket["total_cents"] += line.amount_cents
        if line.paid:
            cost_bucket["paid_cents"] += line.amount_cents
        rendered.append(replace(line, bucket=key))

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
        buckets = []
        for key in BUCKET_ORDER:
            cost_bucket = bucket["buckets"].get(key)
            if cost_bucket is None:
                continue
            buckets.append(
                {
                    "bucket": key,
                    "label": BUCKET_LABELS[key],
                    "total_cents": cost_bucket["total_cents"],
                    "paid_cents": cost_bucket["paid_cents"],
                    "unpaid_cents": cost_bucket["total_cents"] - cost_bucket["paid_cents"],
                }
            )
        currencies.append(
            {
                "currency": currency,
                "total_cents": bucket["total_cents"],
                "paid_cents": bucket["paid_cents"],
                "unpaid_cents": bucket["total_cents"] - bucket["paid_cents"],
                "categories": categories,
                "buckets": buckets,
            }
        )
    return {"currencies": currencies, "lines": rendered}
