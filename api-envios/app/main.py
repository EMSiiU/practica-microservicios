import base64
import hashlib
import hmac
import json
import logging
import os
import sqlite3
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from secrets import compare_digest
from typing import Annotated, Literal
from urllib.parse import unquote

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, StringConstraints
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.db import (
    actualizar_estado_guia,
    generar_guia,
    listar_envios,
    preparar_base,
    rastrear_guia,
)

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


class SolicitudEstadoEnvio(BaseModel):
    estado: EstadoEnvio


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
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
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


def _b64url_decode(segmento: str) -> bytes:
    padding = "=" * (-len(segmento) % 4)
    return base64.urlsafe_b64decode(segmento + padding)


def exigir_admin(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, {"codigo": "TOKEN_INVALIDO", "mensaje": "Se requiere un token Bearer válido."})

    token = authorization[7:].strip()
    secreto = os.environ.get("JWT_SECRET", "")
    if not secreto:
        raise HTTPException(500, {"codigo": "ERROR_INTERNO", "mensaje": "JWT_SECRET no configurado."})

    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        header = json.loads(_b64url_decode(header_b64))
        if header.get("alg") != "HS256":
            raise ValueError("Algoritmo inválido")
        expected_sig = hmac.new(
            secreto.encode("utf-8"),
            f"{header_b64}.{payload_b64}".encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not compare_digest(_b64url_decode(sig_b64), expected_sig):
            raise ValueError("Firma inválida")
        claims = json.loads(_b64url_decode(payload_b64))
        exp = claims.get("exp")
        if not isinstance(exp, int) or exp <= int(time.time()):
            raise ValueError("Token expirado")
    except Exception:
        raise HTTPException(401, {"codigo": "TOKEN_INVALIDO", "mensaje": "El token es inválido o expiró."})

    if claims.get("rol") != "admin":
        raise HTTPException(403, {"codigo": "ROL_NO_AUTORIZADO", "mensaje": "Se requiere rol admin."})

    return claims


def exigir_admin_o_interno(
    x_service_token: Annotated[str | None, Header(alias="X-Service-Token")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> None:
    if x_service_token is not None:
        exigir_token_interno(x_service_token)
        return
    exigir_admin(authorization)


@app.get("/health")
def health() -> dict[str, str]:
    return {"servicio": "api-envios", "estado": "ok"}


@app.get("/api/envios", dependencies=[Depends(exigir_admin)])
def listar() -> list[Envio]:
    return [Envio(**dict(row)) for row in listar_envios()]


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


@app.patch("/api/envios/{guia}/estado", dependencies=[Depends(exigir_admin_o_interno)])
def actualizar_estado(guia: str, solicitud: SolicitudEstadoEnvio) -> Envio:
    envio = actualizar_estado_guia(unquote(guia), solicitud.estado)
    if envio is None:
        raise HTTPException(404, {"codigo": "GUIA_NO_ENCONTRADA", "mensaje": "La guía no existe."})
    return Envio(**dict(envio))


@app.get("/api/envios/rastreo/{guia}")
def rastrear(guia: str) -> Rastreo:
    envio = rastrear_guia(unquote(guia))
    if envio is None:
        raise HTTPException(404, {"codigo": "GUIA_NO_ENCONTRADA", "mensaje": "La guía no existe."})
    return Rastreo(**dict(envio))
