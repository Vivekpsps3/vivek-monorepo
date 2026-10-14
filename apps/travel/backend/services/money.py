"""Money is stored as integer cents so SQLite does not turn amounts into floats."""

import re
from decimal import Decimal, ROUND_HALF_UP

MONEY_STEP = Decimal("0.01")
DAY_STEP = Decimal("0.0001")
MAX_MONEY = Decimal("1000000")


def clean_currency(value: str | None) -> str:
    text = (value or "USD").strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", text):
        raise ValueError("Use a 3-letter currency code, such as USD.")
    return text


def parse_money(value) -> int | None:
    if value is None or value == "":
        return None
    amount = Decimal(str(value)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)
    if amount < 0:
        raise ValueError("Use a zero or positive amount.")
    if amount > MAX_MONEY:
        raise ValueError("That amount is larger than this app accepts.")
    return int(amount * 100)


def fmt_money(cents: int | None) -> str | None:
    if cents is None:
        return None
    sign = "-" if cents < 0 else ""
    cents = abs(int(cents))
    return f"{sign}{cents // 100}.{cents % 100:02d}"


def parse_days(value, *, allow_zero: bool = True) -> Decimal:
    amount = Decimal(str(value)).quantize(DAY_STEP, rounding=ROUND_HALF_UP)
    if amount < 0 or (amount == 0 and not allow_zero):
        raise ValueError("Days cannot be negative.")
    if amount > Decimal("366"):
        raise ValueError("Keep days at 366 or less.")
    return amount


def fmt_days(value: Decimal) -> str:
    return format(Decimal(value).quantize(DAY_STEP, rounding=ROUND_HALF_UP), "f")


def stored_days(value: str | None) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(value)
