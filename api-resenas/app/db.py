from typing import Any, Optional

from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection

from app.config import settings

_client: Optional[MongoClient[dict[str, Any]]] = None
_collection: Optional[Collection[dict[str, Any]]] = None


def init_db() -> Collection[dict[str, Any]]:
    """Inicializa el cliente MongoDB y garantiza el índice único compuesto."""
    global _client, _collection
    if _client is None:
        _client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000)
    db = _client.get_default_database(default="tienda_resenas")
    _collection = db["resenas"]
    _collection.create_index(
        [("producto_id", ASCENDING), ("usuario_id", ASCENDING)],
        unique=True,
        name="idx_producto_usuario_unico",
    )
    return _collection


def close_db() -> None:
    """Cierra el cliente de MongoDB al detener el servicio."""
    global _client, _collection
    if _client is not None:
        _client.close()
        _client = None
        _collection = None


def get_resenas_collection() -> Collection[dict[str, Any]]:
    """Obtiene la colección de reseñas inicializada."""
    if _collection is None:
        return init_db()
    return _collection
