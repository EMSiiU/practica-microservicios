from typing import Any, Optional

import jwt
from fastapi import Header, status

from app.config import settings
from app.errors import AppError


def verificar_token_cliente(
    authorization: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    """Valida el JWT Bearer (HS256, exp) y exige el rol 'cliente'."""
    if not authorization:
        raise AppError(
            status.HTTP_401_UNAUTHORIZED,
            "TOKEN_REQUERIDO",
            "Se requiere un token de autenticación Bearer.",
        )

    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise AppError(
            status.HTTP_401_UNAUTHORIZED,
            "TOKEN_REQUERIDO",
            "Se requiere un token de autenticación Bearer.",
        )

    token = parts[1].strip()
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "rol"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AppError(
            status.HTTP_401_UNAUTHORIZED,
            "TOKEN_EXPIRADO",
            "El token de autenticación ha expirado.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise AppError(
            status.HTTP_401_UNAUTHORIZED,
            "TOKEN_INVALIDO",
            "El token de autenticación es inválido.",
        ) from exc

    if claims.get("rol") != "cliente":
        raise AppError(
            status.HTTP_403_FORBIDDEN,
            "ROL_NO_AUTORIZADO",
            "Solo los clientes autenticados pueden registrar reseñas.",
        )

    return claims
