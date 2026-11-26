import logging
import os
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from secrets import compare_digest
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, StringConstraints
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.db import generar_guia, preparar_base, rastrear_guia

logger = logging.getLogger(__name__)
MAX_ENTERO_JSON = 2**53 - 1
CodigoPostal = Annotated[str, StringConstraints(strict=True, min_length=5, max_length=5, pattern=r"^[0-9]{5}$")]
EstadoEnvio = Literal["preparando", "en_transito", "entregado"]


class SolicitudCotizacion(BaseModel):
    codigo_postal: CodigoPostal
    cantidad: Annotated[int, Field(strict=True, gt=0, le=(MAX_ENTERO_JSON - 65) // 15)]


class Cotizacion(BaseModel):
    costo_envio: int
    dias_estimados: int


class SolicitudGuia(BaseModel):
    pedido_id: Annotated[int, Field(strict=True, gt=0, le=MAX_ENTERO_JSON)]


class Rastreo(BaseModel):
    guia: str
    estado: EstadoEnvio


class Envio(Rastreo):
    pedido_id: int


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    preparar_base()
    yield


app = FastAPI(title="API de Envíos", lifespan=lifespan)

origen = os.environ.get("CORS_ORIGIN", "").strip()
if origen:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origen],
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )


@app.exception_handler(RequestValidationError)
async def datos_invalidos(_request: Request, _error: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"codigo": "DATOS_INVALIDOS", "mensaje": "Revisa los campos de la solicitud."},
    )


@app.exception_handler(StarletteHTTPException)
async def error_http(_request: Request, error: StarletteHTTPException) -> JSONResponse:
    if isinstance(error.detail, dict):
        contenido = error.detail
    elif error.status_code == 404:
        contenido = {"codigo": "RUTA_NO_ENCONTRADA", "mensaje": "La ruta solicitada no existe."}
    elif error.status_code == 405:
        contenido = {"codigo": "METODO_NO_PERMITIDO", "mensaje": "El método no está permitido en esta ruta."}
    else:
        contenido = {"codigo": "SOLICITUD_INVALIDA", "mensaje": "No se pudo procesar la solicitud."}
    return JSONResponse(status_code=error.status_code, content=contenido, headers=error.headers)


@app.exception_handler(sqlite3.Error)
async def error_base(_request: Request, error: sqlite3.Error) -> JSONResponse:
    logger.error("Error de SQLite en Envíos.", exc_info=error)
    return JSONResponse(
        status_code=500,
        content={"codigo": "ERROR_INTERNO", "mensaje": "No se pudo acceder a los envíos."},
    )


def exigir_token_interno(
    token: Annotated[str | None, Header(alias="X-Service-Token")] = None,
) -> None:
    if not token:
        raise HTTPException(401, {"codigo": "TOKEN_INTERNO_INVALIDO", "mensaje": "Se requiere un token interno válido."})

    configurado = os.environ.get("X_SERVICE_TOKEN")
    if not configurado:
        logger.error("No se configuró X_SERVICE_TOKEN.")
        raise HTTPException(500, {"codigo": "ERROR_INTERNO", "mensaje": "No se pudo autorizar la operación."})

    if not compare_digest(token.encode(), configurado.encode()):
        raise HTTPException(401, {"codigo": "TOKEN_INTERNO_INVALIDO", "mensaje": "Se requiere un token interno válido."})


@app.get("/health")
def health() -> dict[str, str]:
    return {"servicio": "api-envios", "estado": "ok"}


@app.post("/api/envios/cotizar")
def cotizar(solicitud: SolicitudCotizacion) -> Cotizacion:
    return Cotizacion(costo_envio=80 + 15 * (solicitud.cantidad - 1), dias_estimados=3)


@app.post(
    "/api/envios/generar",
    status_code=201,
    dependencies=[Depends(exigir_token_interno)],
    responses={200: {"model": Envio, "description": "Guía previamente generada para el pedido."}},
)
def generar(solicitud: SolicitudGuia, respuesta: Response) -> Envio:
    envio, creado = generar_guia(solicitud.pedido_id)
    if not creado:
        respuesta.status_code = 200
    return Envio(**dict(envio))


@app.get("/api/envios/rastreo/{guia}")
def rastrear(guia: str) -> Rastreo:
    envio = rastrear_guia(guia)
    if envio is None:
        raise HTTPException(404, {"codigo": "GUIA_NO_ENCONTRADA", "mensaje": "La guía no existe."})
    return Rastreo(**dict(envio))
