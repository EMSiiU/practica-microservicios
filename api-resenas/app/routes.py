import json
import urllib.error
import urllib.request
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, Path, status
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

from app.auth import verificar_token_cliente
from app.config import settings
from app.db import get_resenas_collection
from app.errors import AppError
from app.schemas import ProductoResenasOut, ResenaCreate, ResenaOut

router = APIRouter(prefix="/api/resenas", tags=["resenas"])


def _doc_to_resena(doc: dict[str, Any]) -> ResenaOut:
    return ResenaOut(
        id=str(doc["_id"]),
        producto_id=doc["producto_id"],
        usuario_id=doc["usuario_id"],
        calificacion=doc["calificacion"],
        comentario=doc["comentario"],
    )


@router.get("/producto/{producto_id}", response_model=ProductoResenasOut)
def obtener_resenas_producto(
    producto_id: int = Path(..., gt=0),
) -> ProductoResenasOut:
    """Devuelve el promedio y el listado de reseñas de un producto."""
    collection = get_resenas_collection()
    docs = list(collection.find({"producto_id": producto_id}).sort("_id", ASCENDING))

    if not docs:
        return ProductoResenasOut(producto_id=producto_id, promedio=None, resenas=[])

    resenas = [_doc_to_resena(doc) for doc in docs]
    promedio = round(sum(r.calificacion for r in resenas) / len(resenas), 2)
    return ProductoResenasOut(
        producto_id=producto_id,
        promedio=promedio,
        resenas=resenas,
    )


def _verificar_compra_producto(
    usuario_id: int, producto_id: int, authorization: Optional[str]
) -> None:
    if not settings.api_pedidos_url:
        return

    url = f"{settings.api_pedidos_url}/api/pedidos/usuario/{usuario_id}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": authorization or "",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            pedidos = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise AppError(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "ERROR_VERIFICACION_COMPRA",
            "No se pudo verificar si compraste este producto.",
        ) from exc

    compro = any(
        (pedido.get("estado_pago") == "aprobado" or pedido.get("estado") in ("pagado", "enviado"))
        and any(item.get("producto_id") == producto_id for item in pedido.get("items", []))
        for pedido in pedidos
        if isinstance(pedido, dict)
    )
    if not compro:
        raise AppError(
            status.HTTP_403_FORBIDDEN,
            "COMPRA_REQUERIDA",
            "Solo puedes reseñar productos que hayas comprado y pagado.",
        )


@router.post("", response_model=ResenaOut, status_code=status.HTTP_201_CREATED)
def crear_resena(
    body: ResenaCreate,
    claims: dict[str, Any] = Depends(verificar_token_cliente),
    authorization: Optional[str] = Header(default=None),
) -> ResenaOut:
    """Registra una nueva reseña para un producto por parte del cliente titular del JWT."""
    if str(claims.get("sub")) != str(body.usuario_id):
        raise AppError(
            status.HTTP_403_FORBIDDEN,
            "USUARIO_NO_COINCIDE",
            "El usuario_id no coincide con el titular del token.",
        )

    _verificar_compra_producto(body.usuario_id, body.producto_id, authorization)

    collection = get_resenas_collection()
    documento = {
        "producto_id": body.producto_id,
        "usuario_id": body.usuario_id,
        "calificacion": body.calificacion,
        "comentario": body.comentario,
    }

    try:
        result = collection.insert_one(documento)
    except DuplicateKeyError as exc:
        raise AppError(
            status.HTTP_409_CONFLICT,
            "RESENA_DUPLICADA",
            "Ya registraste una reseña para este producto.",
        ) from exc

    return ResenaOut(
        id=str(result.inserted_id),
        producto_id=body.producto_id,
        usuario_id=body.usuario_id,
        calificacion=body.calificacion,
        comentario=body.comentario,
    )
