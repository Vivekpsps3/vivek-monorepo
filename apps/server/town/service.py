"""Owner-scoped reads. Habit XP and passive Media/Travel credits are computed."""

from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import bindparam, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from apps.server.errors import APIError
from apps.server.town.constants import (
    BUILDING_LV,
    CONSTANTS_VERSION,
    DAILY_CAP,
    MEDIA_FINISHED_KINDS,
    TOWN_LV,
    TOWN_NAME,
)
from apps.server.town.engine import (
    cadence_on,
    describe_cadence,
    evaluate_streak,
    habit_xp,
    inn_day,
    level_progress,
    library_day,
    lots,
    stage,
)
from apps.server.town.models import Habit, HabitCadence


@dataclass(frozen=True)
class PassiveDays:
    """Per-day source counts and whether that source could be read."""

    episodes: dict[date, int]
    finished: dict[date, int]
    reminders: dict[date, int]
    trips_done: dict[date, int]
    media_ok: bool
    travel_ok: bool


_MEDIA_TABLES = frozenset({"episode_progress", "user_entries", "catalog_items"})
_TRAVEL_TABLES = frozenset({"reminders", "trips"})
_FINISHED_KINDS = tuple(sorted(MEDIA_FINISHED_KINDS))


def _table_names(db: Session) -> set[str]:
    try:
        rows = db.execute(
            text(
                "SELECT name FROM sqlite_master WHERE type = 'table' "
                "AND name IN ('episode_progress', 'user_entries', 'catalog_items', "
                "'reminders', 'trips')"
            )
        ).all()
    except SQLAlchemyError:
        db.rollback()
        return set()
    return {str(row[0]) for row in rows}


def _window(founding: date | None, today: date) -> tuple[date, date] | None:
    if founding is None or founding > today:
        return None
    return founding, today


def _day_counts(rows) -> dict[date, int]:
    counts: dict[date, int] = {}
    for raw, count in rows:
        if type(raw) is date:
            day = raw
        else:
            try:
                day = date.fromisoformat(str(raw)[:10])
            except ValueError:
                continue
        counts[day] = int(count)
    return counts


def _grouped(db: Session, sql: str, params: dict) -> dict[date, int]:
    statement = text(sql)
    if "kinds" in params:
        statement = statement.bindparams(bindparam("kinds", expanding=True))
    return _day_counts(db.execute(statement, params).all())


def _media_counts(
    db: Session, user_id: int, founding: date | None, today: date, present: set[str]
) -> tuple[bool, dict[date, int], dict[date, int]]:
    if not present >= _MEDIA_TABLES:
        return False, {}, {}
    window = _window(founding, today)
    if window is None:
        return True, {}, {}
    start, end = window
    bounds = {"uid": user_id, "start": start.isoformat(), "end": end.isoformat()}
    try:
        episodes = _grouped(
            db,
            """SELECT watched_on AS d, COUNT(*) AS n FROM episode_progress
            WHERE user_id = :uid AND watched = 1 AND watched_on IS NOT NULL
            AND watched_on >= :start AND watched_on <= :end
            GROUP BY watched_on""",
            bounds,
        )
        finished = _grouped(
            db,
            """SELECT e.completed_on AS d, COUNT(*) AS n
            FROM user_entries AS e JOIN catalog_items AS c ON c.id = e.catalog_id
            WHERE e.user_id = :uid AND e.status = 'completed' AND e.completed_on IS NOT NULL
            AND c.kind IN :kinds AND e.completed_on >= :start AND e.completed_on <= :end
            GROUP BY e.completed_on""",
            {**bounds, "kinds": _FINISHED_KINDS},
        )
    except SQLAlchemyError:
        db.rollback()
        return False, {}, {}
    return True, episodes, finished


def _instant(value: object) -> datetime | None:
    if isinstance(value, datetime):
        instant = value
    elif isinstance(value, date):
        instant = datetime(value.year, value.month, value.day, tzinfo=UTC)
    else:
        raw = str(value).strip().replace("Z", "+00:00")
        if not raw or raw == "None":
            return None
        if " " in raw and "T" not in raw:
            raw = raw.replace(" ", "T", 1)
        try:
            instant = datetime.fromisoformat(raw)
        except ValueError:
            return None
    if instant.tzinfo is None:
        return instant.replace(tzinfo=UTC)
    return instant


def _bind_local_day(db: Session, tz: str) -> None:
    zone = ZoneInfo(tz)

    def local_day(value: object) -> str | None:
        instant = _instant(value)
        if instant is None:
            return None
        return instant.astimezone(zone).date().isoformat()

    create = getattr(db.connection().connection, "create_function", None)
    if create is None:
        raise SQLAlchemyError("local day conversion is unavailable")
    create("town_local_day", 1, local_day)


def _travel_counts(
    db: Session, user_id: int, tz: str, founding: date | None, today: date, present: set[str]
) -> tuple[bool, dict[date, int], dict[date, int]]:
    if not present >= _TRAVEL_TABLES:
        return False, {}, {}
    window = _window(founding, today)
    if window is None:
        return True, {}, {}
    start, end = window
    params = {"uid": user_id, "start": start.isoformat(), "end": end.isoformat()}
    try:
        _bind_local_day(db, tz)
        reminders = _grouped(
            db,
            """SELECT town_local_day(r.done_at) AS d, COUNT(*) AS n
            FROM reminders AS r JOIN trips AS t ON t.id = r.trip_id
            WHERE t.user_id = :uid AND r.done = 1 AND r.done_at IS NOT NULL
            AND town_local_day(r.done_at) >= :start AND town_local_day(r.done_at) <= :end
            GROUP BY d""",
            params,
        )
        trips_done = _grouped(
            db,
            """SELECT date(t.end_date, '+1 day') AS d, COUNT(*) AS n FROM trips AS t
            WHERE t.user_id = :uid AND t.status IN ('booked', 'done')
            AND t.created_at IS NOT NULL AND town_local_day(t.created_at) <= t.end_date
            AND date(t.end_date, '+1 day') >= :start AND date(t.end_date, '+1 day') <= :end
            GROUP BY d""",
            params,
        )
    except SQLAlchemyError:
        db.rollback()
        return False, {}, {}
    return True, reminders, trips_done


def passive_days(
    db: Session, user_id: int, tz: str, founding_day: date | None, today: date
) -> PassiveDays:
    """One grouped query per source. A missing or failed source contributes no XP."""
    present = _table_names(db)
    media_ok, episodes, finished = _media_counts(db, user_id, founding_day, today, present)
    travel_ok, reminders, trips_done = _travel_counts(db, user_id, tz, founding_day, today, present)
    return PassiveDays(episodes, finished, reminders, trips_done, media_ok, travel_ok)


# (habit_id, day) is unique, so COUNT(*) is one row per check-in day.
# Without the hint the SQLite planner picks the wrong index, ~3.4x slower on CI
# (p50 889 ms vs 600 ms gate).
_CHECKS = """FROM habits h JOIN habit_checkins c INDEXED BY sqlite_autoindex_habit_checkins_1
    ON c.habit_id = h.id WHERE h.id IN :ids AND h.user_id = :uid AND c.user_id = :uid
    AND c.day >= h.created_on AND c.day <= min(:today, coalesce(h.archived_on, :today))"""


def _query(db: Session, sql: str, user_id: int, ids: list[int], today: date, **params):
    if not ids:
        return []
    return db.execute(
        text(sql).bindparams(bindparam("ids", expanding=True)),
        dict(uid=user_id, ids=ids, today=today.isoformat(), **params),
    ).all()


def _load_cadences(db: Session, user_id: int, ids: list[int]) -> dict[int, list[tuple[date, int]]]:
    found: dict[int, list[tuple[date, int]]] = defaultdict(list)
    if not ids:
        return found
    rows = db.execute(
        select(HabitCadence.habit_id, HabitCadence.effective_from, HabitCadence.per_week)
        .where(HabitCadence.user_id == user_id, HabitCadence.habit_id.in_(ids))
        .order_by(HabitCadence.habit_id, HabitCadence.effective_from)
    )
    for hid, start, value in rows:
        found[hid].append((start, value))
    return found


def _runs(db: Session, user_id: int, ids: list[int], today: date, per_week: int):
    ordinal = "CAST(julianday(c.day) - 1721424.5 AS INTEGER)"
    units = f"SELECT c.habit_id, {ordinal} AS day_ord {_CHECKS}"
    if per_week != 7:
        units = f"""SELECT c.habit_id, ({ordinal} - 1) / 7 AS day_ord {_CHECKS}
            GROUP BY c.habit_id, day_ord HAVING COUNT(*) >= :target"""
    return _query(
        db,
        f"""WITH units AS ({units}), islands AS (
            SELECT habit_id, day_ord,
                day_ord - ROW_NUMBER() OVER (PARTITION BY habit_id ORDER BY day_ord) AS grp
            FROM units)
        SELECT habit_id, min(day_ord), count(*) FROM islands
        GROUP BY habit_id, grp ORDER BY habit_id, min(day_ord)""",
        user_id,
        ids,
        today,
        target=per_week,
    )


def _run_streak(
    runs: Sequence[tuple[int, int]], per_week: int, end: date, today: date
) -> tuple[int, int, int, int]:
    """Current, best days, best weeks, bonus count; never expand archived runs."""
    if per_week != 7:
        best = max((length for _, length in runs), default=0)
        bonus = sum(length - 1 for _, length in runs)
        current = 0
        if runs and (end.toordinal() - 1) // 7 <= runs[-1][0] + runs[-1][1]:
            current = runs[-1][1]  # Unmet archive/current week is protected.
        return current, 0, best, bonus
    current = best = bonus = 0
    rest_week = -1
    cursor = runs[0][0] if runs else end.toordinal() + 1
    for start, length in [*runs, (end.toordinal() + 1, 0)]:
        while current and cursor < start:
            week = (cursor - 1) // 7
            if cursor != today.toordinal():
                if week == rest_week:
                    current = 0
                else:
                    rest_week = week
            cursor += 1
        bonus += (current + length) // 7 - current // 7
        current += length
        best = max(best, current)
        cursor = start + length
    return current, best, 0, bonus


def _habit_view(habit: Habit, ords: list[int], cadence_rows, today: date) -> dict:
    streak = evaluate_streak(
        habit.created_on,
        today,
        (),
        habit.per_week,
        cadence_rows,
        habit.archived_on,
        checkin_ords=ords,
    )
    progress = _progress(habit_xp(len(ords), streak.streak7_count), BUILDING_LV)
    yesterday = today - timedelta(days=1)
    fields = asdict(streak)
    for key in ("streak7_count", "streak7_days", "last7", "week"):
        fields.pop(key)
    return dict(
        id=habit.id,
        name=habit.name,
        slot=None if habit.archived_at else habit.slot,
        building_style=habit.building_style,
        cadence=asdict(describe_cadence(today, habit.per_week, cadence_rows)),
        created_on=habit.created_on,
        archived_on=habit.archived_on,
        **progress,
        stage=stage(progress["level"]),
        streak=fields,
        week=asdict(streak.week) if streak.week else None,
        last7=list(streak.last7),
        checked_today=today.toordinal() in ords,
        checked_yesterday=yesterday.toordinal() in ords,
        can_check_yesterday=yesterday >= habit.created_on and yesterday.toordinal() not in ords,
    )


def _progress(points: int, table: Sequence[int]) -> dict:
    level, start, nxt = level_progress(points, table)
    return dict(xp=points, level=level, level_xp_start=start, next_level_xp=nxt)


def _building(
    ok: bool,
    founding: date | None,
    today: date,
    left: dict[date, int],
    right: dict[date, int],
    day_xp: Callable[[int, int], int],
    cap: int,
) -> dict:
    points = today_points = 0
    if ok and founding is not None and founding <= today:
        points = sum(
            day_xp(left.get(d, 0), right.get(d, 0))
            for d in left.keys() | right.keys()
            if founding <= d <= today
        )
        today_points = day_xp(left.get(today, 0), right.get(today, 0))
    progress = _progress(points, BUILDING_LV)
    return dict(
        **progress,
        stage=stage(progress["level"]),
        today_xp=today_points,
        today_cap=cap,
        source="ok" if ok else "unavailable",
    )


def read_town(db: Session, user_id: int, today: date, tz: str) -> dict:
    habits = list(db.scalars(select(Habit).where(Habit.user_id == user_id)))
    ids = [h.id for h in habits]
    cadences = _load_cadences(db, user_id, ids)
    active = sorted((h for h in habits if h.archived_at is None), key=lambda h: h.slot)
    archived = sorted(
        (h for h in habits if h.archived_at is not None),
        key=lambda h: (h.archived_on or date.min, h.id),
        reverse=True,
    )
    detailed = [h.id for h in active]
    grouped: dict[int, list[int]] = defaultdict(list)
    for h in archived:
        end = min(today, h.archived_on or today)
        initial = cadence_on(h.created_on, h.per_week, cadences[h.id])
        if any(h.created_on < d <= end and value != initial for d, value in cadences[h.id]):
            detailed.append(h.id)  # Only multi-segment archived histories may load days.
        else:
            grouped[initial].append(h.id)
    counts = dict(
        _query(
            db, f"SELECT c.habit_id, COUNT(*) {_CHECKS} GROUP BY c.habit_id", user_id, ids, today
        )
    )
    checks: dict[int, list[int]] = defaultdict(list)
    for hid, day in _query(
        db,
        f"SELECT c.habit_id, c.day {_CHECKS} ORDER BY c.habit_id, c.day",
        user_id,
        detailed,
        today,
    ):
        checks[hid].append(date.fromisoformat(day).toordinal())
    views = {
        h.id: _habit_view(h, checks[h.id], cadences[h.id], today)
        for h in habits
        if h.id in detailed
    }
    summaries: dict[int, tuple[int, int, int, int]] = {}
    by_id = {h.id: h for h in archived}
    for target, group in grouped.items():
        runs: dict[int, list[tuple[int, int]]] = defaultdict(list)
        for hid, start, length in _runs(db, user_id, group, today, target):
            runs[hid].append((start, length))
        for hid in group:
            summaries[hid] = _run_streak(
                runs[hid], target, min(today, by_id[hid].archived_on or today), today
            )
    archive_views: list[dict] = []
    for h in archived:
        if h.id in summaries:
            _, days, weeks, bonus = summaries[h.id]
            points = habit_xp(counts.get(h.id, 0), bonus)
        else:
            view = views[h.id]
            days, weeks = view["streak"]["best_days"], view["streak"]["best_weeks"]
            points = view["xp"]
        archive_views.append(
            dict(
                id=h.id,
                name=h.name,
                xp=points,
                level=level_progress(points, BUILDING_LV)[0],
                best_days=days,
                best_weeks=weeks,
                created_on=h.created_on,
                archived_on=h.archived_on,
            )
        )
    founding = min((h.created_on for h in habits), default=None)
    passive = passive_days(db, user_id, tz, founding, today)
    # No per-day check-in aggregate: DAILY_CAP is consumed only by passive building math.
    library = _building(
        passive.media_ok,
        founding,
        today,
        passive.episodes,
        passive.finished,
        library_day,
        DAILY_CAP["library"],
    )
    inn = _building(
        passive.travel_ok,
        founding,
        today,
        passive.reminders,
        passive.trips_done,
        inn_day,
        DAILY_CAP["inn"],
    )
    points = sum(views[h.id]["xp"] for h in active) + sum(v["xp"] for v in archive_views)
    progress = _progress(points + library["xp"] + inn["xp"], TOWN_LV)
    return dict(
        town=dict(name=TOWN_NAME, founded_on=founding, today=today, tz=tz, **progress),
        buildings=dict(library=library, inn=inn),
        lots=list(lots(progress["level"], {h.slot: h.id for h in active})),
        habits=[views[h.id] for h in active],
        archived=archive_views,
        today=dict(done=sum(views[h.id]["checked_today"] for h in active), total=len(active)),
        constants_version=CONSTANTS_VERSION,
    )


def read_town_summary(db: Session, user_id: int, today: date, tz: str) -> dict:
    """Hub card summary: the town progress, today's habits, and the longest
    current streak, reduced from the same read model as GET /api/town so the
    card can never disagree with the town page. Streaks are compared in days
    (a weekly streak counts its weeks x 7) and reported in their own unit."""
    full = read_town(db, user_id, today, tz)
    longest = 0
    longest_unit: str | None = None
    longest_days = 0
    for habit in full["habits"]:
        streak = habit["streak"]
        current = streak["current"]
        days = current if streak["unit"] == "days" else current * 7
        if days > longest_days:
            longest, longest_unit, longest_days = current, streak["unit"], days
    town = full["town"]
    return dict(
        name=town["name"],
        founded_on=town["founded_on"],
        level=town["level"],
        xp=town["xp"],
        level_xp_start=town["level_xp_start"],
        next_level_xp=town["next_level_xp"],
        today_done=full["today"]["done"],
        today_total=full["today"]["total"],
        longest_streak=longest,
        longest_streak_unit=longest_unit,
    )


def _as_date(value: object) -> date:
    if type(value) is date:
        return value
    return date.fromisoformat(str(value)[:10])


def _expand_runs(runs: Sequence[tuple[int, int]]) -> list[int]:
    return [start + offset for start, length in runs for offset in range(length)]


def _not_found() -> APIError:
    return APIError(404, "habit_not_found", "That habit doesn't exist.")


def read_checkins(db: Session, user_id: int, habit_id: int, start: date, end: date) -> dict:
    """Days for one owned habit, archived included. Misses are habit_not_found."""
    found = db.scalar(select(Habit.id).where(Habit.id == habit_id, Habit.user_id == user_id))
    if found is None:
        raise _not_found()
    rows = db.execute(
        text(
            """SELECT day FROM habit_checkins INDEXED BY sqlite_autoindex_habit_checkins_1
            WHERE habit_id = :habit_id AND user_id = :uid
            AND day >= :start AND day <= :end ORDER BY day"""
        ),
        {
            "habit_id": habit_id,
            "uid": user_id,
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
    ).all()
    return {"days": [_as_date(row[0]) for row in rows]}


# include_archived uses the same runs as GET /api/town. Daily islands expand in
# memory. Weekly islands keep streak totals; only the archive week and last7
# are read as days. A multi-segment history may load that habit's day list.
_WINDOW = """SELECT c.habit_id, c.day FROM habits h
    JOIN habit_checkins c INDEXED BY sqlite_autoindex_habit_checkins_1
    ON c.habit_id = h.id WHERE h.id IN :ids AND h.user_id = :uid AND c.user_id = :uid
    AND c.day >= h.created_on AND c.day <= min(:today, coalesce(h.archived_on, :today))
    AND c.day >= min(date(coalesce(h.archived_on, :today), printf('-%d days',
        (cast(strftime('%w', coalesce(h.archived_on, :today)) as integer) + 6) % 7)),
        date(:today, '-6 days'))
    ORDER BY c.habit_id, c.day"""


def _weekly_archived_view(
    habit: Habit,
    islands: Sequence[tuple[int, int]],
    days: Sequence[date],
    count: int,
    cadence_rows,
    today: date,
    target: int,
) -> dict:
    end = min(today, habit.archived_on or today)
    current, _best_days, best_weeks, bonus = _run_streak(islands, target, end, today)
    progress = _progress(habit_xp(count, bonus), BUILDING_LV)
    monday = end - timedelta(days=end.weekday())
    checked = set(days)
    yesterday = today - timedelta(days=1)
    last7 = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        if day < habit.created_on:
            last7.append("none")
        elif day in checked:
            last7.append("done")
        else:
            last7.append("off")
    return dict(
        id=habit.id,
        name=habit.name,
        slot=None,
        building_style=habit.building_style,
        cadence=asdict(describe_cadence(today, habit.per_week, cadence_rows)),
        created_on=habit.created_on,
        archived_on=habit.archived_on,
        **progress,
        stage=stage(progress["level"]),
        streak=dict(
            unit="weeks",
            current=current,
            best=best_weeks,
            best_days=0,
            best_weeks=best_weeks,
            rest_day_available=None,
            rest_used_on=None,
        ),
        week=dict(done=sum(1 for day in days if monday <= day <= end), target=target),
        last7=last7,
        checked_today=today in checked,
        checked_yesterday=yesterday in checked,
        can_check_yesterday=yesterday >= habit.created_on and yesterday not in checked,
    )


def _archived_habits(db: Session, user_id: int, today: date, ids: list[int]) -> list[dict]:
    habits = {
        habit.id: habit
        for habit in db.scalars(select(Habit).where(Habit.user_id == user_id, Habit.id.in_(ids)))
    }
    cadences: dict[int, list[tuple[date, int]]] = defaultdict(list)
    for hid, start, value in db.execute(
        select(HabitCadence.habit_id, HabitCadence.effective_from, HabitCadence.per_week)
        .where(HabitCadence.user_id == user_id, HabitCadence.habit_id.in_(ids))
        .order_by(HabitCadence.habit_id, HabitCadence.effective_from)
    ):
        cadences[hid].append((start, value))
    detailed: list[int] = []
    grouped: dict[int, list[int]] = defaultdict(list)
    for hid in ids:
        habit = habits[hid]
        end = min(today, habit.archived_on or today)
        initial = cadence_on(habit.created_on, habit.per_week, cadences[hid])
        changed = any(
            habit.created_on < day <= end and value != initial for day, value in cadences[hid]
        )
        if changed:
            detailed.append(hid)
        else:
            grouped[initial].append(hid)
    checks: dict[int, list[int]] = defaultdict(list)
    for hid, day in _query(
        db,
        f"SELECT c.habit_id, c.day {_CHECKS} ORDER BY c.habit_id, c.day",
        user_id,
        detailed,
        today,
    ):
        checks[hid].append(_as_date(day).toordinal())
    views = {hid: _habit_view(habits[hid], checks[hid], cadences[hid], today) for hid in detailed}
    for target, group in grouped.items():
        islands: dict[int, list[tuple[int, int]]] = defaultdict(list)
        for hid, start, length in _runs(db, user_id, group, today, target):
            islands[hid].append((int(start), int(length)))
        if target == 7:
            for hid in group:
                views[hid] = _habit_view(
                    habits[hid], _expand_runs(islands[hid]), cadences[hid], today
                )
            continue
        window: dict[int, list[date]] = defaultdict(list)
        for hid, day in _query(db, _WINDOW, user_id, group, today):
            window[hid].append(_as_date(day))
        counts = dict(
            _query(
                db,
                f"SELECT c.habit_id, COUNT(*) {_CHECKS} GROUP BY c.habit_id",
                user_id,
                group,
                today,
            )
        )
        for hid in group:
            views[hid] = _weekly_archived_view(
                habits[hid],
                islands[hid],
                window[hid],
                int(counts.get(hid, 0)),
                cadences[hid],
                today,
                target,
            )
    return [views[hid] for hid in ids]


def read_habits(db: Session, user_id: int, today: date, tz: str, *, include_archived: bool) -> dict:
    """Active habits in slot order, then archived habits newest first."""
    payload = read_town(db, user_id, today, tz)
    items = list(payload["habits"])
    if include_archived and payload["archived"]:
        items.extend(
            _archived_habits(db, user_id, today, [row["id"] for row in payload["archived"]])
        )
    return {"items": items}
