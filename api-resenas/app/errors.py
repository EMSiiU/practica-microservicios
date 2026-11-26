import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("api_resenas")

_HTTP_STATUS_CODES: dict[int, tuple[str, str]] = {
    400: ("SOLICITUD_INVALIDA", "La solicitud contiene datos inválidos."),
    401: ("NO_AUTENTICADO", "Se requiere autenticación válida."),
    403: ("NO_AUTORIZADO", "No tienes permiso para realizar esta operación."),
    404: ("NO_ENCONTRADO", "El recurso solicitado no existe."),
    405: ("METODO_NO_PERMITIDO", "El método HTTP no está permitido para esta ruta."),
    409: ("CONFLICTO", "Conflicto con el estado actual del recurso."),
}


class AppError(Exception):
    """Error de dominio o contrato serializable como {codigo, mensaje}."""

    def __init__(self, status_code: int, codigo: str, mensaje: str) -> None:
        self.status_code = status_code
        self.codigo = codigo
        self.mensaje = mensaje
        super().__init__(mensaje)


def _error_response(status_code: int, codigo: str, mensaje: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"codigo": codigo, "mensaje": mensaje},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Registra manejadores globales para asegurar respuestas de error uniformes."""

    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return _error_response(exc.status_code, exc.codigo, exc.mensaje)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        detalles = []
        for err in exc.errors():
            loc = ".".join(str(part) for part in err.get("loc", ()) if part != "body")
            msg = err.get("msg", "Valor inválido")
            detalles.append(f"{loc}: {msg}" if loc else msg)
        mensaje = "; ".join(detalles) if detalles else "Los datos enviados son inválidos."
        return _error_response(
            status.HTTP_400_BAD_REQUEST,
            "DATOS_INVALIDOS",
            mensaje,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        default_code, default_msg = _HTTP_STATUS_CODES.get(
            exc.status_code,
            ("ERROR_HTTP", "Ocurrió un error al procesar la solicitud."),
        )
        mensaje = exc.detail if isinstance(exc.detail, str) and exc.detail else default_msg
        if exc.status_code == 404 and exc.detail == "Not Found":
            mensaje = default_msg
        elif exc.status_code == 405 and exc.detail == "Method Not Allowed":
            mensaje = default_msg
        return _error_response(exc.status_code, default_code, mensaje)

    @app.exception_handler(PyMongoError)
    async def handle_pymongo_error(_request: Request, exc: PyMongoError) -> JSONResponse:
        logger.exception("Error de MongoDB al procesar solicitud: %s", exc)
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "ERROR_BASE_DATOS",
            "Ocurrió un error al comunicarse con la base de datos.",
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Error interno inesperado: %s", exc)
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "ERROR_INTERNO",
            "Ocurrió un error interno en el servicio de reseñas.",
        )
