"""Money is stored as integer cents so SQLite does not turn amounts into floats."""

import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

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

    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Enter a valid amount.") from exc
    if not amount.is_finite():
        raise ValueError("Enter a finite amount.")

    # Reject values far beyond the supported range before quantize(), whose
    # default decimal context can raise InvalidOperation for very large input.
    if amount > MAX_MONEY + MONEY_STEP:
        raise ValueError("That amount is larger than this app accepts.")
    if amount < -(MAX_MONEY + MONEY_STEP):
        raise ValueError("Use a zero or positive amount.")
    try:
        amount = amount.quantize(MONEY_STEP, rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise ValueError("Enter a valid amount.") from exc
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
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Enter a valid number of days.") from exc
    if not amount.is_finite():
        raise ValueError("Enter a finite number of days.")

    # Values this far outside the accepted range cannot round back into it.
    # Checking first also keeps huge exponents from failing inside quantize().
    if amount > Decimal("366") + DAY_STEP:
        raise ValueError("Keep days at 366 or less.")
    if amount < -Decimal("366") - DAY_STEP:
        raise ValueError("Days cannot be negative.")
    try:
        amount = amount.quantize(DAY_STEP, rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise ValueError("Enter a valid number of days.") from exc
    if amount < 0 or (amount == 0 and not allow_zero):
        raise ValueError("Days cannot be negative.")
    if amount > Decimal("366"):
        raise ValueError("Keep days at 366 or less.")
    return amount


def fmt_days(value: Decimal) -> str:
    """Up to two decimal places, trailing zeros trimmed (D3)."""
    amount = Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    text = format(amount, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def stored_days(value: str | None) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(value)
