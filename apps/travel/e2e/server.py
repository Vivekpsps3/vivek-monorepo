"""Local Travel server for the UX screenshot matrix.

Temporary sqlite database and a synthetic user. It does not talk to production.
"""

import os
from pathlib import Path

from fastapi import FastAPI


def main() -> None:
    root = Path(os.environ.get("TRAVEL_E2E_ROOT", "/tmp/travel-ux-e2e"))
    root.mkdir(parents=True, exist_ok=True)
    database = root / "travel.db"
    if database.exists():
        database.unlink()
    os.environ["TRAVEL_DATABASE_URL"] = f"sqlite:///{database}"
    os.environ.pop("FLIGHTAWARE_API_KEY", None)

    from apps.travel.backend import database
    from apps.travel.backend.app import create_app
    from apps.travel.backend.database import init_db
    from apps.travel.backend.deps import AuthResult, Principal, get_geocoder
    from apps.travel.backend.models import Base

    init_db()
    travel = create_app()
    travel.state.principal_checker = lambda _request: AuthResult(
        Principal(1, "synthetic", "Synthetic Traveler"),
        [],
    )

    def geocode(_query: str):
        return [{"label": "Kyoto", "lat": 35.0116, "lng": 135.7681}]

    travel.dependency_overrides[get_geocoder] = lambda: geocode

    parent = FastAPI()

    @parent.post("/e2e/reset")
    def reset():
        Base.metadata.drop_all(bind=database.engine)
        init_db()
        return {"ok": True}

    parent.mount("/", travel)

    import uvicorn

    uvicorn.run(
        parent,
        host="127.0.0.1",
        port=int(os.environ.get("TRAVEL_E2E_PORT", "8098")),
        log_level="warning",
    )


if __name__ == "__main__":
    main()
