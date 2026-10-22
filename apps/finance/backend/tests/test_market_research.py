from datetime import UTC, datetime

import pytest
from sqlalchemy import delete

from conftest import authenticated_client
from apps.finance.backend.main import Base, app, engine, market_data
from apps.finance.backend.schemas_market import MarketResearchResponse


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    market_data.clear_memory_cache()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


@pytest.fixture
def client():
    return authenticated_client(app)


class FakeMarketData:
    def __init__(self):
        self.calls = []

    def get_research(self, symbol, period="10y", force_refresh=False, db=None):
        self.calls.append((symbol, period, force_refresh))
        if symbol == "BAD":
            raise RuntimeError("provider failed")
        return MarketResearchResponse(
            symbol=symbol,
            valid=True,
            source="test",
            fetched_at=datetime(2026, 1, 2, tzinfo=UTC),
            cache_status="miss",
            warnings=[],
            profile={"name": f"{symbol} Fund", "asset_type": "etf"},
            quote={"current_price": 100.0, "previous_close": 99.0},
            history=[
                {"date": "2025-01-02", "close": 80.0},
                {"date": "2026-01-02", "close": 100.0},
            ],
            dividends=[{"date": "2025-06-01", "amount": 1.0}],
            splits=[],
            fundamentals={"market_cap": 1000000},
            etf={"expense_ratio": 0.0003},
            analyst={"target_mean_price": 120.0},
        )


def test_market_research_single_endpoint(client, monkeypatch):
    from apps.finance.backend.routers import market as market_router

    fake = FakeMarketData()
    monkeypatch.setattr(market_router, "market_data", fake)

    response = client.get("/api/market/research/voo", params={"period": "10y"})

    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "VOO"
    assert body["quote"]["current_price"] == 100.0
    assert body["history"][0]["date"] == "2025-01-02"
    assert fake.calls == [("VOO", "10y", False)]


def test_market_research_rejects_invalid_symbol(client):
    response = client.get("/api/market/research/not_a_symbol")
    assert response.status_code == 400


def test_market_research_batch_caps_symbol_count(client):
    response = client.post(
        "/api/market/research/batch",
        json={"symbols": ["A", "B", "C", "D", "E", "F"]},
    )
    assert response.status_code == 422


def test_market_research_batch_partial_failure(client, monkeypatch):
    from apps.finance.backend.routers import market as market_router

    fake = FakeMarketData()
    monkeypatch.setattr(market_router, "market_data", fake)

    response = client.post(
        "/api/market/research/batch",
        json={"symbols": ["VOO", "BAD", "SCHD"], "period": "10y"},
    )

    assert response.status_code == 200
    body = response.json()
    assert [row["symbol"] for row in body["results"]] == ["VOO", "SCHD"]
    assert body["failed"] == [{"symbol": "BAD", "error": "provider failed"}]
