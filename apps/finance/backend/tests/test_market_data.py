"""Unit tests for MarketDataService (no live yfinance)."""

from datetime import UTC, date, datetime, timedelta

import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from apps.finance.backend.models import Base, MarketResearchCache, TickerQuote
from apps.finance.backend.routers import market as market_router
from apps.finance.backend.schemas_market import MarketPriceResponse, MarketResearchResponse
from apps.finance.backend.services.market_data import MarketDataService


@pytest.fixture
def svc():
    return MarketDataService(ttl_seconds=3600)


def test_non_ticker_returns_zero(svc):
    price, source, ts = svc.get_price("123456789012", force_refresh=False)
    assert price == 0.0
    assert source == "non_ticker"
    assert ts is None


def test_memory_cache_hit(svc, monkeypatch):
    monkeypatch.setattr(svc, "_looks_like_non_ticker", lambda _s: False)
    monkeypatch.setattr(svc, "_fetch_eod", lambda _s: (42.5, date.today(), "live_eod"))

    p1, src1, _ = svc.get_price("AAPL", force_refresh=True, db=None)
    assert p1 == 42.5
    assert src1 == "live_eod"

    calls = {"n": 0}

    def counting_fetch(_symbol):
        calls["n"] += 1
        return (99.0, date.today(), "live_eod")

    monkeypatch.setattr(svc, "_fetch_eod", counting_fetch)
    p2, _, _ = svc.get_price("AAPL", force_refresh=False, db=None)
    assert p2 == 42.5
    assert calls["n"] == 0


def test_failed_symbol_backoff(svc, monkeypatch):
    monkeypatch.setattr(svc, "_looks_like_non_ticker", lambda _s: False)
    monkeypatch.setattr(svc, "_fetch_eod", lambda _s: (None, None, "error"))

    p1, src1, _ = svc.get_price("FAIL", force_refresh=True, db=None)
    assert p1 == 0.0
    assert src1 == "error"

    monkeypatch.setattr(
        svc,
        "_fetch_eod",
        lambda _s: (_ for _ in ()).throw(AssertionError("should not fetch")),
    )
    p2, src2, _ = svc.get_price("FAIL", force_refresh=False, db=None)
    assert p2 == 0.0
    assert src2 == "error"


def test_fetch_eod_mocked_returns_price(svc, monkeypatch):
    monkeypatch.setattr(svc, "_looks_like_non_ticker", lambda _s: False)

    def fake_eod(symbol):
        assert symbol == "MSFT"
        return 300.0, date(2026, 1, 15), "live_eod"

    monkeypatch.setattr(svc, "_fetch_eod", fake_eod)

    price, source, _ = svc.get_price("MSFT", force_refresh=True, db=None)
    assert price == 300.0
    assert source == "live_eod"


def test_fetch_eod_prefers_regular_market_quote_and_keeps_market_date(svc, monkeypatch):
    market_time = datetime(2026, 1, 15, 15, 30, tzinfo=UTC)

    class FakeTicker:
        info = {
            "regularMarketPrice": 125.25,
            "regularMarketTime": market_time.timestamp(),
            "exchangeTimezoneName": "America/New_York",
        }
        fast_info = {"last_price": 124.5}

        def history(self, **_kwargs):
            return pd.DataFrame({"Close": [100.0]}, index=pd.to_datetime(["2026-01-14"]))

    monkeypatch.setattr(
        "apps.finance.backend.services.market_data.yf.Ticker", lambda _symbol: FakeTicker()
    )

    price, quote_date, source = svc._fetch_eod("ACME")

    assert price == 125.25
    assert quote_date == date(2026, 1, 15)
    assert source == "live"


def test_fetch_eod_invalid_exchange_timezone_uses_history_date(svc, monkeypatch):
    market_time = datetime(2026, 1, 15, 15, 30, tzinfo=UTC)

    class FakeTicker:
        info = {
            "regularMarketPrice": 125.25,
            "regularMarketTime": market_time.timestamp(),
            "exchangeTimezoneName": "Unknown/Exchange",
        }
        fast_info = {}

        def history(self, **_kwargs):
            return pd.DataFrame({"Close": [100.0]}, index=pd.to_datetime(["2026-01-14"]))

    monkeypatch.setattr(
        "apps.finance.backend.services.market_data.yf.Ticker", lambda _symbol: FakeTicker()
    )

    price, quote_date, source = svc._fetch_eod("ACME")

    assert price == 125.25
    assert quote_date == date(2026, 1, 14)
    assert source == "live"


def test_fetch_eod_rejects_future_market_timestamp(svc, monkeypatch):
    future_time = datetime.now(UTC) + timedelta(days=1)

    class FakeTicker:
        info = {
            "regularMarketPrice": 125.25,
            "regularMarketTime": future_time.timestamp(),
            "exchangeTimezoneName": "UTC",
        }
        fast_info = {}

        def history(self, **_kwargs):
            return pd.DataFrame({"Close": [100.0]}, index=pd.to_datetime(["2026-01-14"]))

    monkeypatch.setattr(
        "apps.finance.backend.services.market_data.yf.Ticker", lambda _symbol: FakeTicker()
    )

    price, quote_date, source = svc._fetch_eod("ACME")

    assert price == 125.25
    assert quote_date == date(2026, 1, 14)
    assert quote_date <= datetime.now(UTC).date()
    assert source == "live"


def test_fetch_eod_ignores_post_market_price_and_falls_back_to_history(svc, monkeypatch):
    class FakeTicker:
        info = {"currentPrice": 150.0}
        fast_info = {"last_price": float("nan")}

        def history(self, **_kwargs):
            return pd.DataFrame({"Close": [101.5]}, index=pd.to_datetime(["2026-01-15"]))

    monkeypatch.setattr(
        "apps.finance.backend.services.market_data.yf.Ticker", lambda _symbol: FakeTicker()
    )

    price, quote_date, source = svc._fetch_eod("ACME")

    assert price == 101.5
    assert quote_date == date(2026, 1, 15)
    assert source == "live_eod"


def test_fetch_eod_skips_nonfinite_and_nonpositive_prices(svc, monkeypatch):
    class FakeTicker:
        info = {"regularMarketPrice": float("inf")}
        fast_info = {"last_price": float("nan")}

        def history(self, **_kwargs):
            return pd.DataFrame(
                {"Close": [0.0, -2.0, float("inf")]},
                index=pd.to_datetime(["2026-01-13", "2026-01-14", "2026-01-15"]),
            )

    monkeypatch.setattr(
        "apps.finance.backend.services.market_data.yf.Ticker", lambda _symbol: FakeTicker()
    )

    assert svc._fetch_eod("ACME") == (None, None, "error")


def test_market_price_cache_preserves_quote_date_separately_from_fetch_time(svc, monkeypatch):
    monkeypatch.setattr(svc, "_looks_like_non_ticker", lambda _s: False)
    quote_day = date(2026, 1, 15)
    monkeypatch.setattr(svc, "_fetch_eod", lambda _s: (42.5, quote_day, "live"))

    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=eng)
    Session = sessionmaker(bind=eng)
    session = Session()
    try:
        price, source, fetched_at = svc.get_price("ACME", force_refresh=True, db=session)
        row = session.query(TickerQuote).filter(TickerQuote.symbol == "ACME").one()

        assert price == 42.5
        assert source == "live"
        assert fetched_at is not None
        assert row.quote_date == quote_day
        assert row.fetched_at != datetime.combine(quote_day, datetime.min.time())
        assert svc.get_price_quote_date("ACME") == quote_day

        cache_reader = MarketDataService(ttl_seconds=3600)
        monkeypatch.setattr(cache_reader, "_looks_like_non_ticker", lambda _s: False)
        cached_price, cached_source, cached_fetched_at = cache_reader.get_price("ACME", db=session)
        assert (cached_price, cached_source) == (42.5, "live")
        assert cached_fetched_at is not None
        assert abs((cached_fetched_at - fetched_at).total_seconds()) < 1
        assert cache_reader.get_price_quote_date("ACME") == quote_day
    finally:
        session.close()
        eng.dispose()


def test_market_price_route_includes_quote_date(monkeypatch):
    quote_day = date(2026, 1, 15)
    fetched_at = datetime(2026, 1, 16, 1, 2, tzinfo=UTC)

    class FakeMarketData:
        def get_price(self, *_args, **_kwargs):
            return 42.5, "live", fetched_at

        def get_price_quote_date(self, _symbol):
            return quote_day

    monkeypatch.setattr(market_router, "market_data", FakeMarketData())

    response = market_router.get_market_price("ACME", db=None, _current_user=object())

    assert isinstance(response, MarketPriceResponse)
    assert response.model_dump(mode="json")["quote_date"] == "2026-01-15"
    assert response.price_as_of == fetched_at


def test_market_price_route_does_not_return_nonfinite_price(monkeypatch):
    class FakeMarketData:
        def get_price(self, *_args, **_kwargs):
            return float("inf"), "live", datetime.now(UTC)

        def get_price_quote_date(self, _symbol):
            return date.today()

    monkeypatch.setattr(market_router, "market_data", FakeMarketData())

    response = market_router.get_market_price("ACME", db=None, _current_user=object())

    assert response.price == 0.0
    assert response.valid is False
    assert response.quote_date is None


def test_sqlite_naive_fetched_at_does_not_crash(svc):
    """Legacy ticker_quotes rows may store naive UTC fetched_at (pre-BE-015)."""
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=eng)
    Session = sessionmaker(bind=eng)
    session = Session()
    try:
        session.add(
            TickerQuote(
                symbol="AAPL",
                close_price=100.0,
                quote_date=date.today(),
                fetched_at=datetime.now(UTC).replace(tzinfo=None),
                source="sqlite_eod",
            )
        )
        session.commit()
        price, source, ts = svc.get_price("AAPL", force_refresh=False, db=session)
        assert price == 100.0
        assert source == "sqlite_eod"
        assert ts is not None
    finally:
        session.close()


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
