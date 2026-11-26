from typing import Any

from fastapi import APIRouter, Depends, Path, status
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

from app.auth import verificar_token_cliente
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


@router.post("", response_model=ResenaOut, status_code=status.HTTP_201_CREATED)
def crear_resena(
    body: ResenaCreate,
    claims: dict[str, Any] = Depends(verificar_token_cliente),
) -> ResenaOut:
    """Registra una nueva reseña para un producto por parte del cliente titular del JWT."""
    if str(claims.get("sub")) != str(body.usuario_id):
        raise AppError(
            status.HTTP_403_FORBIDDEN,
            "USUARIO_NO_COINCIDE",
            "El usuario_id no coincide con el titular del token.",
        )

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
