"""Home day/hour balances and next-trip impact use the leave summary."""

from datetime import date, timedelta
from decimal import Decimal
from fractions import Fraction

from apps.travel.backend.services.leave_math import fmt_hours


def _policy(**overrides):
    today = date.today()
    body = {
        "start_balance_hours": "80",
        "balance_as_of": (today - timedelta(days=40)).isoformat(),
        "accrual_hours": "0",
        "accrual_cadence": "yearly",
        "cap_hours": None,
        "year_start": "01-01",
        "carry_forward": True,
    }
    body.update(overrides)
    return body


def _put(client, bucket, **overrides):
    saved = client.put(f"/api/pto/policies/{bucket}", json=_policy(**overrides))
    assert saved.status_code == 200, saved.text
    return saved.json()


def _trip(client, start, end, title="Kyoto"):
    made = client.post(
        "/api/trips",
        json={"title": title, "start_date": start.isoformat(), "end_date": end.isoformat()},
    )
    assert made.status_code == 201, made.text
    return made.json()


def _hours(days: str, hpd: str) -> str:
    return fmt_hours(Fraction(Decimal(days)) * Fraction(Decimal(hpd)))


def test_home_impact_hours_match_the_pto_projection(client):
    today = date.today()
    _put(client, "pto", start_balance_hours="80")
    _put(client, "sick", start_balance_hours="40")
    made = _trip(client, today - timedelta(days=6), today + timedelta(days=2))
    detail = client.get(f"/api/trips/{made['id']}").json()
    board = client.get("/api/pto").json()
    home = client.get("/api/home").json()
    policy = client.get("/api/pto/policies/pto").json()
    sick = client.get("/api/pto/policies/sick").json()
    hpd = board["hours_per_day"]
    impact = home["next_pto"]

    assert board["buckets"]["pto"]["balance_today_hours"] == policy["balance_today_hours"]
    assert board["buckets"]["pto"]["balance_today_days"] == policy["balance_today_days"]
    assert board["buckets"]["sick"]["balance_today_hours"] == sick["balance_today_hours"]
    assert board["buckets"]["sick"]["balance_today_days"] == sick["balance_today_days"]
    assert impact["trip_id"] == made["id"]
    assert impact["days"] == detail["pto"]["days"]
    assert impact["leftover_after"] == detail["pto"]["leftover_after"]
    assert impact["balance_when_you_leave"] == detail["pto"]["balance_when_you_leave"]
    assert impact["hours"] == _hours(impact["days"], hpd)
    assert impact["leftover_after_hours"] == _hours(impact["leftover_after"], hpd)
    assert impact["balance_when_you_leave_hours"] == _hours(impact["balance_when_you_leave"], hpd)

    charged = next(
        row
        for row in detail["pto_dates"]
        if Decimal(row["amount"]) > 0 and date.fromisoformat(row["on_date"]) <= today
    )
    removed = Decimal(charged["amount"])
    patched = client.patch(
        f"/api/trips/{made['id']}",
        json={"pto_dates": [{"on_date": charged["on_date"], "amount": "0"}]},
    )
    assert patched.status_code == 200, patched.text
    after_board = client.get("/api/pto").json()
    after_home = client.get("/api/home").json()
    after_detail = client.get(f"/api/trips/{made['id']}").json()
    before_hours = Decimal(board["buckets"]["pto"]["balance_today_hours"])
    after_hours = Decimal(after_board["buckets"]["pto"]["balance_today_hours"])
    assert after_hours - before_hours == removed * Decimal(hpd)
    assert (
        after_board["buckets"]["pto"]["balance_today_days"]
        == client.get("/api/pto/policies/pto").json()["balance_today_days"]
    )
    assert (
        after_board["buckets"]["sick"]["balance_today_hours"]
        == board["buckets"]["sick"]["balance_today_hours"]
    )
    assert after_home["next_pto"]["days"] == after_detail["pto"]["days"]
    assert after_home["next_pto"]["leftover_after"] == after_detail["pto"]["leftover_after"]
    assert after_home["next_pto"]["hours"] == _hours(after_home["next_pto"]["days"], hpd)
    assert after_home["next_pto"]["days"] != impact["days"]
    assert "EUR" not in after_home["next_pto"]["hours"]
