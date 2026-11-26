from typing import Optional

from pydantic import BaseModel, Field, StrictInt, field_validator


class ResenaCreate(BaseModel):
    """Carga útil para crear una reseña."""

    producto_id: StrictInt = Field(..., gt=0)
    usuario_id: StrictInt = Field(..., gt=0)
    calificacion: StrictInt = Field(..., ge=1, le=5)
    comentario: str = Field(..., min_length=1)

    @field_validator("comentario")
    @classmethod
    def validar_comentario_no_vacio(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El comentario no puede estar vacío.")
        return cleaned


class ResenaOut(BaseModel):
    """Representación pública de una reseña."""

    id: str
    producto_id: int
    usuario_id: int
    calificacion: int
    comentario: str


class ProductoResenasOut(BaseModel):
    """Resumen y listado de reseñas para un producto."""

    producto_id: int
    promedio: Optional[float]
    resenas: list[ResenaOut]
