import os
import json
import math
import time
from datetime import UTC, date, datetime, timedelta
from typing import Any, Dict, Optional, Tuple
from zoneinfo import ZoneInfo

import yfinance as yf
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from apps.finance.backend.logging_config import get_logger
from apps.finance.backend.models import MarketResearchCache, TickerQuote
from apps.finance.backend.schemas_market import (
    MarketDividendEvent,
    MarketInstrumentProfile,
    MarketPricePoint,
    MarketQuoteSummary,
    MarketResearchResponse,
    MarketSplitEvent,
)
from apps.server.database import release_for_provider_io

logger = get_logger()


def _ensure_utc(dt: datetime) -> datetime:
    """Normalize DB/memory datetimes for comparison (legacy rows may be naive UTC)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _finite_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _compact_dict(data: dict[str, Any], keys: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in keys:
        value = data.get(key)
        if value is not None and value == value:
            out[key] = value
    return out


class MarketDataService:
    """In-memory hot cache + SQLite EOD close + yfinance on miss.

    Skips yfinance entirely for obvious non-tickers (CUSIPs, long codes, cash sweeps)
    to avoid log spam and useless API calls. Falls back to purchase_price.
    """

    def __init__(self, ttl_seconds: int = 120):
        self._memory: Dict[str, Tuple[float, datetime, str, date]] = {}
        self._ttl = timedelta(seconds=ttl_seconds)
        self._eod_ttl = timedelta(hours=int(os.getenv("EOD_CACHE_HOURS", "24")))
        # Remember symbols that failed to fetch so we don't hammer yfinance on every load
        self._failed: Dict[str, datetime] = {}

    def invalidate(self, symbol: str) -> None:
        sym = symbol.upper().strip()
        self._memory.pop(sym, None)
        self._failed.pop(sym, None)

    def clear_memory_cache(self) -> None:
        self._memory.clear()
        self._failed.clear()

    def _looks_like_non_ticker(self, symbol: str) -> bool:
        """Heuristic for symbols that are unlikely to be Yahoo Finance tickers."""
        if not symbol:
            return True
        if symbol[0].isdigit():
            return True
        if len(symbol) > 8:
            return True
        if symbol.startswith("SPAXX"):
            return True
        return False

    def _sqlite_get(self, db: Session, symbol: str) -> Optional[Tuple[float, datetime, str, date]]:
        row = db.query(TickerQuote).filter(TickerQuote.symbol == symbol).first()
        if not row:
            return None
        price = _finite_float(row.close_price)
        if price is None or price <= 0 or row.quote_date is None:
            return None
        fetched_at = _ensure_utc(row.fetched_at)
        if datetime.now(UTC) - fetched_at > self._eod_ttl:
            return None
        return price, fetched_at, row.source or "sqlite_eod", row.quote_date

    def _sqlite_set(
        self, db: Session, symbol: str, close_price: float, quote_date: date, source: str
    ) -> None:
        now = datetime.now(UTC)
        row = db.query(TickerQuote).filter(TickerQuote.symbol == symbol).first()
        if row:
            row.close_price = close_price
            row.quote_date = quote_date
            row.fetched_at = now
            row.source = source
        else:
            db.add(
                TickerQuote(
                    symbol=symbol,
                    close_price=close_price,
                    quote_date=quote_date,
                    fetched_at=now,
                    source=source,
                )
            )
        db.flush()

    def _research_cache_get(
        self, db: Session, symbol: str, period: str
    ) -> Optional[MarketResearchResponse]:
        row = (
            db.query(MarketResearchCache)
            .filter(MarketResearchCache.symbol == symbol, MarketResearchCache.period == period)
            .first()
        )
        if not row or _ensure_utc(row.expires_at) <= datetime.now(UTC):
            return None
        payload = json.loads(row.payload_json)
        payload["cache_status"] = "hit"
        return MarketResearchResponse.model_validate(payload)

    def _research_cache_set(
        self, db: Session, symbol: str, period: str, response: MarketResearchResponse
    ) -> None:
        now = datetime.now(UTC)
        expires = now + self._eod_ttl
        payload = response.model_dump(mode="json")
        payload["cache_status"] = "hit"
        row = (
            db.query(MarketResearchCache)
            .filter(MarketResearchCache.symbol == symbol, MarketResearchCache.period == period)
            .first()
        )
        if row:
            row.payload_json = json.dumps(payload, separators=(",", ":"))
            row.source = response.source
            row.fetched_at = now
            row.expires_at = expires
        else:
            savepoint = db.begin_nested()
            try:
                db.add(
                    MarketResearchCache(
                        symbol=symbol,
                        period=period,
                        payload_json=json.dumps(payload, separators=(",", ":")),
                        source=response.source,
                        fetched_at=now,
                        expires_at=expires,
                    )
                )
                db.flush()
            except IntegrityError:
                savepoint.rollback()
                # Another request won the cold-cache insert. Keep its fresh row and
                # leave the caller's outer transaction usable.
                db.query(MarketResearchCache).filter(
                    MarketResearchCache.symbol == symbol, MarketResearchCache.period == period
                ).first()
            else:
                savepoint.commit()
            return
        db.flush()

    @staticmethod
    def _quote_date_from_info(info: dict[str, Any]) -> Optional[date]:
        timestamp = _finite_float(info.get("regularMarketTime"))
        if timestamp is None or timestamp <= 0:
            return None
        try:
            quoted_at = datetime.fromtimestamp(timestamp, tz=UTC)
            if quoted_at > datetime.now(UTC) + timedelta(minutes=5):
                return None
            exchange_timezone = info.get("exchangeTimezoneName")
            if exchange_timezone:
                quoted_at = quoted_at.astimezone(ZoneInfo(str(exchange_timezone)))
            return quoted_at.date()
        except (KeyError, OverflowError, OSError, ValueError):
            return None

    @staticmethod
    def _history_close(hist: Any) -> Optional[Tuple[float, date]]:
        if hist is None:
            return None
        try:
            if getattr(hist, "empty", True):
                return None
            rows = hist.iterrows()
            for idx, row in reversed(list(rows)):
                close = _finite_float(row.get("Close"))
                if close is None or close <= 0:
                    continue
                if hasattr(idx, "date"):
                    quote_date = idx.date()
                else:
                    quote_date = date.fromisoformat(str(idx)[:10])
                return close, quote_date
        except Exception:
            return None
        return None

    def _fetch_eod(self, symbol: str) -> Tuple[Optional[float], Optional[date], str]:
        started = time.perf_counter()
        try:
            ticker = yf.Ticker(symbol)
        except Exception as e:
            logger.info(
                "yfinance ticker unavailable symbol=%s duration_ms=%.0f err=%s",
                symbol,
                (time.perf_counter() - started) * 1000,
                str(e)[:200],
            )
            return None, None, "error"

        info: dict[str, Any] = {}
        try:
            info = dict(ticker.info or {})
        except Exception as exc:
            logger.info("yfinance quote info unavailable symbol=%s err=%s", symbol, str(exc)[:160])

        # Yahoo's regularMarketPrice excludes extended-hours trade prices.
        # currentPrice can reflect post-market data, so it is intentionally not
        # used for portfolio valuation.
        live_price = None
        candidate = _finite_float(info.get("regularMarketPrice"))
        if candidate is not None and candidate > 0:
            live_price = candidate

        fast_info = None
        if live_price is None:
            try:
                fast_info = ticker.fast_info
                for key in (
                    "regularMarketPrice",
                    "regular_market_price",
                    "lastPrice",
                    "last_price",
                ):
                    try:
                        candidate = _finite_float(fast_info.get(key))
                    except Exception:
                        candidate = None
                    if candidate is not None and candidate > 0:
                        live_price = candidate
                        break
            except Exception as exc:
                logger.info(
                    "yfinance fast quote unavailable symbol=%s err=%s", symbol, str(exc)[:160]
                )

        historical = None
        try:
            historical = self._history_close(ticker.history(period="5d"))
        except Exception as exc:
            logger.info("yfinance history unavailable symbol=%s err=%s", symbol, str(exc)[:160])

        if live_price is not None:
            quote_date = self._quote_date_from_info(info)
            if quote_date is None and historical is not None:
                quote_date = historical[1]
            if quote_date is None:
                quote_date = datetime.now(UTC).date()
            logger.info(
                "yfinance live symbol=%s price=%.4f quote_date=%s duration_ms=%.0f",
                symbol,
                live_price,
                quote_date,
                (time.perf_counter() - started) * 1000,
            )
            return live_price, quote_date, "live"

        if historical is not None:
            close, quote_date = historical
            logger.info(
                "yfinance eod symbol=%s close=%.4f quote_date=%s duration_ms=%.0f",
                symbol,
                close,
                quote_date,
                (time.perf_counter() - started) * 1000,
            )
            return close, quote_date, "live_eod"

        logger.info(
            "yfinance no price symbol=%s duration_ms=%.0f",
            symbol,
            (time.perf_counter() - started) * 1000,
        )
        return None, None, "error"

    def get_price_quote_date(self, symbol: str) -> Optional[date]:
        """Return the market date belonging to the latest price returned by get_price."""
        cached = self._memory.get(symbol.upper().strip())
        return cached[3] if cached else None

    def _fetch_research(self, symbol: str, period: str) -> MarketResearchResponse:
        now = datetime.now(UTC)
        warnings: list[str] = []
        ticker = yf.Ticker(symbol)
        info: dict[str, Any] = {}
        try:
            info = dict(ticker.info or {})
        except Exception as exc:
            warnings.append(f"metadata unavailable: {str(exc)[:120]}")

        history_points: list[MarketPricePoint] = []
        try:
            hist = ticker.history(period=period, auto_adjust=False)
            if hist is not None and not hist.empty:
                for idx, row in hist.iterrows():
                    close = _finite_float(row.get("Close"))
                    if close is None or close <= 0:
                        continue
                    history_points.append(
                        MarketPricePoint(
                            date=idx.date().isoformat() if hasattr(idx, "date") else str(idx)[:10],
                            open=_finite_float(row.get("Open")),
                            high=_finite_float(row.get("High")),
                            low=_finite_float(row.get("Low")),
                            close=close,
                            adjusted_close=_finite_float(row.get("Adj Close")),
                            volume=_finite_float(row.get("Volume")),
                        )
                    )
            else:
                warnings.append("price history unavailable")
        except Exception as exc:
            warnings.append(f"price history unavailable: {str(exc)[:120]}")

        dividends: list[MarketDividendEvent] = []
        try:
            div_series = ticker.dividends
            if div_series is not None:
                for idx, amount in div_series.items():
                    value = _finite_float(amount)
                    if value is not None and value > 0:
                        dividends.append(
                            MarketDividendEvent(
                                date=idx.date().isoformat()
                                if hasattr(idx, "date")
                                else str(idx)[:10],
                                amount=value,
                            )
                        )
        except Exception as exc:
            warnings.append(f"dividends unavailable: {str(exc)[:120]}")

        splits: list[MarketSplitEvent] = []
        try:
            split_series = ticker.splits
            if split_series is not None:
                for idx, ratio in split_series.items():
                    value = _finite_float(ratio)
                    if value is not None and value > 0:
                        splits.append(
                            MarketSplitEvent(
                                date=idx.date().isoformat()
                                if hasattr(idx, "date")
                                else str(idx)[:10],
                                ratio=value,
                            )
                        )
        except Exception as exc:
            warnings.append(f"splits unavailable: {str(exc)[:120]}")

        price = _finite_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        if price is None and history_points:
            price = history_points[-1].close
        profile = MarketInstrumentProfile(
            name=info.get("shortName") or info.get("longName") or info.get("displayName"),
            asset_type=(info.get("quoteType") or "unknown").lower(),
            exchange=info.get("exchange"),
            currency=info.get("currency"),
            sector=info.get("sector"),
            industry=info.get("industry"),
            website=info.get("website"),
            quote_type=info.get("quoteType"),
        )
        quote = MarketQuoteSummary(
            current_price=price,
            previous_close=_finite_float(info.get("previousClose")),
            open=_finite_float(info.get("open")),
            day_high=_finite_float(info.get("dayHigh")),
            day_low=_finite_float(info.get("dayLow")),
            fifty_two_week_high=_finite_float(info.get("fiftyTwoWeekHigh")),
            fifty_two_week_low=_finite_float(info.get("fiftyTwoWeekLow")),
            market_cap=_finite_float(info.get("marketCap")),
            beta=_finite_float(info.get("beta")),
            trailing_pe=_finite_float(info.get("trailingPE")),
            forward_pe=_finite_float(info.get("forwardPE")),
            dividend_rate=_finite_float(info.get("dividendRate")),
            dividend_yield=_finite_float(info.get("dividendYield")),
        )
        fundamentals = (
            _compact_dict(
                info,
                [
                    "marketCap",
                    "trailingPE",
                    "forwardPE",
                    "trailingEps",
                    "revenueGrowth",
                    "profitMargins",
                    "beta",
                ],
            )
            or None
        )
        etf = (
            _compact_dict(info, ["category", "expenseRatio", "navPrice", "yield", "totalAssets"])
            or None
        )
        analyst = (
            _compact_dict(
                info,
                [
                    "targetHighPrice",
                    "targetLowPrice",
                    "targetMeanPrice",
                    "recommendationKey",
                    "numberOfAnalystOpinions",
                ],
            )
            or None
        )
        return MarketResearchResponse(
            symbol=symbol,
            valid=bool(price or history_points),
            source="yfinance",
            fetched_at=now,
            cache_status="miss",
            warnings=warnings,
            profile=profile,
            quote=quote,
            history=history_points,
            dividends=dividends,
            splits=splits,
            fundamentals=fundamentals,
            etf=etf,
            analyst=analyst,
        )

    def get_price(
        self, symbol: str, force_refresh: bool = False, db: Optional[Session] = None
    ) -> Tuple[float, str, Optional[datetime]]:
        symbol = symbol.upper().strip()
        now = datetime.now(UTC)

        if not force_refresh and self._looks_like_non_ticker(symbol):
            return 0.0, "non_ticker", None

        # Short-circuit recently failed symbols
        if not force_refresh and symbol in self._failed:
            if now - _ensure_utc(self._failed[symbol]) < timedelta(minutes=5):
                return 0.0, "error", None
            else:
                self._failed.pop(symbol, None)

        if force_refresh:
            self.invalidate(symbol)

        if symbol in self._memory:
            price, ts, source, _quote_date = self._memory[symbol]
            if now - _ensure_utc(ts) < self._ttl:
                return price, source, _ensure_utc(ts)

        if not force_refresh:
            if db is not None:
                sqlite_hit = self._sqlite_get(db, symbol)
                if sqlite_hit:
                    price, fetched, source, quote_date = sqlite_hit
                    self._memory[symbol] = (price, fetched, source, quote_date)
                    return price, source, fetched

        if db is not None:
            release_for_provider_io(db)
        try:
            price, quote_date, source = self._fetch_eod(symbol)
        except Exception as exc:
            logger.info("yfinance quote parse failed symbol=%s err=%s", symbol, str(exc)[:160])
            price, quote_date, source = None, None, "error"
        normalized_price = _finite_float(price)
        if normalized_price is None or normalized_price <= 0 or quote_date is None:
            self._failed[symbol] = now
            return 0.0, "error", None

        fetched = now
        self._memory[symbol] = (normalized_price, fetched, source, quote_date)
        self._failed.pop(symbol, None)
        if db is not None:
            self._sqlite_set(db, symbol, normalized_price, quote_date, source)
        return normalized_price, source, fetched

    def get_research(
        self,
        symbol: str,
        period: str = "10y",
        force_refresh: bool = False,
        db: Optional[Session] = None,
    ) -> MarketResearchResponse:
        symbol = symbol.upper().strip()
        period = period.lower().strip() or "10y"
        if period not in {"1y", "2y", "5y", "10y", "max"}:
            period = "10y"
        if not force_refresh and db is not None:
            cached = self._research_cache_get(db, symbol, period)
            if cached:
                return cached
        if db is not None:
            release_for_provider_io(db)
        response = self._fetch_research(symbol, period)
        response.cache_status = "refresh" if force_refresh else "miss"
        if db is not None and response.valid:
            self._research_cache_set(db, symbol, period, response)
        return response


market_data = MarketDataService(ttl_seconds=int(os.getenv("PRICE_CACHE_TTL", "120")))
