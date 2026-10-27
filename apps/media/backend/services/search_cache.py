"""Bounded public search results. Queries and saved flags never reach SQLite."""

import json
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Event, Lock

import httpx


class PartialSearchError(Exception):
    def __init__(self, rows: list[dict], failed_kinds: tuple[str, ...]):
        super().__init__("Some catalog searches failed")
        self.rows = rows
        self.failed_kinds = failed_kinds


@dataclass(frozen=True)
class SearchResult:
    rows: list[dict]
    state: str
    fetched_at: str
    cached: bool = False
    failed_kinds: tuple[str, ...] = ()


@dataclass(frozen=True)
class _Entry:
    expires: float
    payload: str
    size: int
    state: str
    fetched_at: str
    failed_kinds: tuple[str, ...]


class SearchCache:
    def __init__(self, *, max_entries: int = 128, max_bytes: int = 2_000_000):
        self.max_entries = max_entries
        self.max_bytes = max_bytes
        self.clock = time.monotonic
        self._entries: OrderedDict[str, _Entry] = OrderedDict()
        self._inflight: dict[str, Event] = {}
        self._bytes = 0
        self._generation = 0
        self._lock = Lock()

    def clear(self) -> None:
        with self._lock:
            self._generation += 1
            self._entries.clear()
            self._bytes = 0
            for event in self._inflight.values():
                event.set()
            self._inflight.clear()

    def retry_failure(self, key: str) -> None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None and entry.state != "ok":
                self._bytes -= self._entries.pop(key).size

    def _get(self, key: str) -> SearchResult | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        if entry.expires <= self.clock():
            self._bytes -= self._entries.pop(key).size
            return None
        self._entries.move_to_end(key)
        return SearchResult(
            json.loads(entry.payload), entry.state, entry.fetched_at, True, entry.failed_kinds
        )

    def run(self, key: str, load: Callable[[], list[dict]], *, wait: float = 3.5) -> SearchResult:
        with self._lock:
            hit = self._get(key)
            if hit is not None:
                return hit
            event = self._inflight.get(key)
            owner = event is None
            generation = self._generation
            if event is None:
                if len(self._inflight) >= 32:
                    return SearchResult([], "throttled", datetime.now(UTC).isoformat())
                event = Event()
                self._inflight[key] = event
        if not owner:
            event.wait(wait)
            with self._lock:
                hit = self._get(key)
            return hit or SearchResult([], "timeout", datetime.now(UTC).isoformat())
        state = "ok"
        failed_kinds: tuple[str, ...] = ()
        try:
            rows = load()
        except PartialSearchError as error:
            rows, state, failed_kinds = error.rows, "partial", error.failed_kinds
        except (httpx.TimeoutException, TimeoutError):
            rows, state = [], "timeout"
        except httpx.HTTPStatusError as error:
            rows = []
            state = (
                "throttled"
                if error.response.status_code == 429
                else "provider_auth"
                if error.response.status_code in {401, 403}
                else "unavailable"
            )
        except Exception:
            rows, state = [], "unavailable"
        fetched = datetime.now(UTC).isoformat()
        try:
            payload = json.dumps(rows, separators=(",", ":"))
            size = len(payload.encode("utf-8")) + len(key.encode("utf-8"))
            ttl = 5 if state != "ok" else 300 if rows else 30
            with self._lock:
                if generation == self._generation and size <= self.max_bytes:
                    while self._entries and (
                        len(self._entries) >= self.max_entries
                        or self._bytes + size > self.max_bytes
                    ):
                        self._bytes -= self._entries.popitem(last=False)[1].size
                    if self.max_entries > 0:
                        self._entries[key] = _Entry(
                            self.clock() + ttl, payload, size, state, fetched, failed_kinds
                        )
                        self._bytes += size
        finally:
            with self._lock:
                if self._inflight.get(key) is event:
                    self._inflight.pop(key)
                event.set()
        # Each caller receives its own decoded rows; saved markers are attached later.
        return SearchResult(json.loads(payload), state, fetched, failed_kinds=failed_kinds)
