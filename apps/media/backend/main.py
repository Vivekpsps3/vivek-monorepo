import os

import uvicorn

from apps.media.backend.app import create_app

app = create_app()


if __name__ == "__main__":
    uvicorn.run(
        "apps.media.backend.main:app",
        host=os.getenv("MEDIA_HOST", "0.0.0.0"),
        port=int(os.getenv("MEDIA_PORT", "8091")),
        reload=os.getenv("MEDIA_RELOAD", "").lower() in ("1", "true", "yes"),
    )
