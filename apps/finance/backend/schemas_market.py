from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from apps.finance.backend.constants import SYMBOL_PATTERN

MarketCacheStatus = Literal["hit", "miss", "refresh"]


class MarketInstrumentProfile(BaseModel):
    name: Optional[str] = None
    asset_type: str = "unknown"
    exchange: Optional[str] = None
    currency: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    quote_type: Optional[str] = None


class MarketQuoteSummary(BaseModel):
    current_price: Optional[float] = None
    previous_close: Optional[float] = None
    open: Optional[float] = None
    day_high: Optional[float] = None
    day_low: Optional[float] = None
    fifty_two_week_high: Optional[float] = None
    fifty_two_week_low: Optional[float] = None
    market_cap: Optional[float] = None
    beta: Optional[float] = None
    trailing_pe: Optional[float] = None
    forward_pe: Optional[float] = None
    dividend_rate: Optional[float] = None
    dividend_yield: Optional[float] = None


class MarketPriceResponse(BaseModel):
    symbol: str
    price: float
    price_source: str
    price_as_of: datetime | None = None
    quote_date: date | None = None
    valid: bool


class MarketPricePoint(BaseModel):
    date: str
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: float
    adjusted_close: Optional[float] = None
    volume: Optional[float] = None


class MarketDividendEvent(BaseModel):
    date: str
    amount: float


class MarketSplitEvent(BaseModel):
    date: str
    ratio: float


class MarketResearchResponse(BaseModel):
    symbol: str
    valid: bool
    source: str = "yfinance"
    fetched_at: datetime
    cache_status: MarketCacheStatus
    warnings: List[str] = Field(default_factory=list)
    profile: Optional[MarketInstrumentProfile] = None
    quote: Optional[MarketQuoteSummary] = None
    history: List[MarketPricePoint] = Field(default_factory=list)
    dividends: List[MarketDividendEvent] = Field(default_factory=list)
    splits: List[MarketSplitEvent] = Field(default_factory=list)
    fundamentals: Optional[Dict[str, Any]] = None
    etf: Optional[Dict[str, Any]] = None
    analyst: Optional[Dict[str, Any]] = None


class MarketResearchBatchRequest(BaseModel):
    symbols: List[str] = Field(..., min_length=1, max_length=5)
    refresh: bool = False
    period: str = "10y"

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, symbols: List[str]) -> List[str]:
        normalized: List[str] = []
        for raw in symbols:
            symbol = raw.upper().strip()
            if not SYMBOL_PATTERN.match(symbol):
                raise ValueError(f"Invalid symbol format: {raw}")
            if symbol not in normalized:
                normalized.append(symbol)
        return normalized

    @field_validator("period")
    @classmethod
    def period_allowed(cls, value: str) -> str:
        clean = value.strip().lower()
        if clean not in {"1y", "2y", "5y", "10y", "max"}:
            raise ValueError("period must be one of 1y, 2y, 5y, 10y, max")
        return clean


class MarketResearchFailure(BaseModel):
    symbol: str
    error: str


class MarketResearchBatchResponse(BaseModel):
    results: List[MarketResearchResponse]
    failed: List[MarketResearchFailure] = Field(default_factory=list)
