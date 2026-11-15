"""Unit tests for MarketDataService (no live yfinance)."""

from datetime import UTC, datetime

import pytest

from apps.finance.backend.models import MarketResearchCache
from apps.finance.backend.schemas_market import MarketResearchResponse
from apps.finance.backend.services.market_data import MarketDataService


@pytest.fixture
def svc():
    return MarketDataService(ttl_seconds=3600)


def test_research_cache_cold_insert_uses_winning_row_after_savepoint_collision(svc):
    """A duplicate cache insert must not roll back the surrounding request transaction."""
    from sqlalchemy.exc import IntegrityError

    class Savepoint:
        rolled_back = False

        def rollback(self):
            self.rolled_back = True

        def commit(self):
            raise AssertionError("a conflicting insert must not commit its savepoint")

    class Query:
        def filter(self, *_args):
            return self

        def first(self):
            query_calls.append(1)
            return None if len(query_calls) == 1 else winner

    class Session:
        rolled_back = False

        def begin_nested(self):
            return savepoint

        def query(self, _model):
            return Query()

        def add(self, _row):
            pass

        def flush(self):
            raise IntegrityError("insert", {}, Exception("duplicate key"))

        def rollback(self):
            self.rolled_back = True

    now = datetime.now(UTC).replace(tzinfo=None)
    winner = MarketResearchCache(
        symbol="VOO",
        period="10y",
        payload_json="{}",
        source="yfinance",
        fetched_at=now,
        expires_at=now,
    )
    savepoint = Savepoint()
    query_calls = []
    response = MarketResearchResponse(
        symbol="VOO",
        valid=True,
        source="yfinance",
        fetched_at=now,
        cache_status="miss",
        warnings=[],
        profile={},
        quote={},
        history=[],
        dividends=[],
        splits=[],
    )

    svc._research_cache_set(Session(), "VOO", "10y", response)

    assert savepoint.rolled_back
    assert len(query_calls) == 2
