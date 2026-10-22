import os

import uvicorn

from apps.travel.backend.app import create_app

app = create_app()


if __name__ == "__main__":
    uvicorn.run(
        "apps.travel.backend.main:app",
        host=os.getenv("TRAVEL_HOST", "0.0.0.0"),
        port=int(os.getenv("TRAVEL_PORT", "8090")),
        reload=os.getenv("TRAVEL_RELOAD", "").lower() in ("1", "true", "yes"),
    )
