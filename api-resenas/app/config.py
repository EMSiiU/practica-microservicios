import os
from dataclasses import dataclass, field


def _parse_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:4200")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@dataclass(frozen=True)
class Settings:
    """Configuración del microservicio cargada desde variables de entorno."""

    mongo_uri: str = os.getenv("MONGO_URI", "mongodb://localhost:27017/tienda_resenas")
    jwt_secret: str = os.getenv("JWT_SECRET", "secreto-demo-tienda-2026")
    port: int = int(os.getenv("PORT", "8008"))
    api_pedidos_url: str = os.getenv("API_PEDIDOS_URL", "").strip().rstrip("/")
    cors_origins: list[str] = field(default_factory=_parse_cors_origins)


settings = Settings()
