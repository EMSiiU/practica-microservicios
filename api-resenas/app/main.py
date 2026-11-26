from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import close_db, init_db
from app.errors import register_exception_handlers
from app.routes import router as resenas_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_db()
    try:
        yield
    finally:
        close_db()


app = FastAPI(title="API Reseñas", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

register_exception_handlers(app)
app.include_router(resenas_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Endpoint ligero de verificación de estado del servicio."""
    return {"status": "ok"}
