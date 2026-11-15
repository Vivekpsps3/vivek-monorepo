"""Today follows the reader's timezone across the UTC day boundary."""

from datetime import UTC, date, datetime

from packages.time.today import today_in_zone


def test_dst_and_far_east_boundaries():
    # Pacific spring-forward day, and the UTC+14 date line.
    before_pacific_day = datetime(2026, 3, 8, 7, 59, tzinfo=UTC)
    on_pacific_day = datetime(2026, 3, 8, 8, 0, tzinfo=UTC)
    assert today_in_zone("America/Los_Angeles", before_pacific_day) == date(2026, 3, 7)
    assert today_in_zone("America/Los_Angeles", on_pacific_day) == date(2026, 3, 8)
    before_fall = datetime(2026, 11, 2, 7, 59, tzinfo=UTC)
    on_fall = datetime(2026, 11, 2, 8, 0, tzinfo=UTC)
    assert today_in_zone("America/Los_Angeles", before_fall) == date(2026, 11, 1)
    assert today_in_zone("America/Los_Angeles", on_fall) == date(2026, 11, 2)
    before_line = datetime(2026, 10, 22, 9, 59, tzinfo=UTC)
    after_line = datetime(2026, 10, 22, 10, 0, tzinfo=UTC)
    assert today_in_zone("Pacific/Kiritimati", before_line) == date(2026, 10, 22)
    assert today_in_zone("Pacific/Kiritimati", after_line) == date(2026, 10, 23)
