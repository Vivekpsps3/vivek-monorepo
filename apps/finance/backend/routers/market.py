import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from apps.finance.backend.constants import SYMBOL_PATTERN
from apps.finance.backend.auth import get_current_user
from apps.finance.backend.database import get_db
from apps.finance.backend.models import User
from apps.finance.backend.schemas_market import (
    MarketPriceResponse,
    MarketResearchBatchRequest,
    MarketResearchBatchResponse,
    MarketResearchFailure,
    MarketResearchResponse,
)
from apps.finance.backend.services.market_data import market_data

router = APIRouter(tags=["market"])


@router.get("/market/price/{symbol}", response_model=MarketPriceResponse)
def get_market_price(
    symbol: str,
    refresh: bool = Query(False, description="Bypass cache and fetch live"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    upper = symbol.upper().strip()
    if not SYMBOL_PATTERN.match(upper):
        raise HTTPException(status_code=400, detail="Invalid symbol format")
    price, source, as_of = market_data.get_price(upper, force_refresh=refresh, db=db)
    valid = math.isfinite(price) and price > 0
    return MarketPriceResponse(
        symbol=upper,
        price=round(price, 2) if valid else 0.0,
        price_source=source,
        price_as_of=as_of,
        quote_date=market_data.get_price_quote_date(upper) if valid else None,
        valid=valid,
    )


@router.get("/market/research/{symbol}", response_model=MarketResearchResponse)
def get_market_research(
    symbol: str,
    refresh: bool = Query(False, description="Bypass market research cache"),
    period: str = Query("10y", description="History period: 1y, 2y, 5y, 10y, max"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    upper = symbol.upper().strip()
    if not SYMBOL_PATTERN.match(upper):
        raise HTTPException(status_code=400, detail="Invalid symbol format")
    clean_period = period.lower().strip()
    if clean_period not in {"1y", "2y", "5y", "10y", "max"}:
        raise HTTPException(status_code=400, detail="Invalid period")
    try:
        return market_data.get_research(upper, period=clean_period, force_refresh=refresh, db=db)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)[:200])


@router.post("/market/research/batch", response_model=MarketResearchBatchResponse)
def get_market_research_batch(
    body: MarketResearchBatchRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    results = []
    failed = []
    for symbol in body.symbols:
        try:
            results.append(
                market_data.get_research(symbol, period=body.period, force_refresh=body.refresh, db=db)
            )
        except Exception as exc:
            failed.append(MarketResearchFailure(symbol=symbol, error=str(exc)[:200]))
    return MarketResearchBatchResponse(results=results, failed=failed)
