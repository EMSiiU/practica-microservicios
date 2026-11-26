import os
import time

import httpx
import jwt
import pytest

BASE_URL = os.getenv("BASE_URL", "http://localhost:8008").rstrip("/")
JWT_SECRET = os.getenv("JWT_SECRET", "secreto-demo-tienda-2026")


def generar_jwt(
    sub: str,
    rol: str = "cliente",
    exp_delta_seconds: int = 3600,
    secret: str = JWT_SECRET,
) -> str:
    """Genera un token JWT HS256 de prueba siguiendo el contrato del sistema."""
    payload = {
        "sub": sub,
        "rol": rol,
        "exp": int(time.time()) + exp_delta_seconds,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def _assert_error_format(response: httpx.Response, expected_status: int) -> dict:
    assert response.status_code == expected_status, response.text
    data = response.json()
    assert isinstance(data, dict)
    assert "codigo" in data and isinstance(data["codigo"], str) and data["codigo"]
    assert "mensaje" in data and isinstance(data["mensaje"], str) and data["mensaje"]
    return data


@pytest.fixture(scope="module")
def producto_id() -> int:
    """Genera un producto_id único por corrida para aislar los datos en MongoDB."""
    return int(time.time() * 1000)


@pytest.fixture(scope="module")
def client() -> httpx.Client:
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as http_client:
        yield http_client


def test_health(client: httpx.Client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_resenas_vacio_y_cors(client: httpx.Client, producto_id: int) -> None:
    response = client.get(
        f"/api/resenas/producto/{producto_id}",
        headers={"Origin": "http://localhost:4200"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:4200"
    assert response.json() == {
        "producto_id": producto_id,
        "promedio": None,
        "resenas": [],
    }


def test_flujo_crear_consultar_y_duplicado_409(
    client: httpx.Client, producto_id: int
) -> None:
    token_u1 = generar_jwt(sub="101", rol="cliente")
    payload_u1 = {
        "producto_id": producto_id,
        "usuario_id": 101,
        "calificacion": 5,
        "comentario": "Excelente taza de cerámica",
    }

    # 1. Crear primera reseña (HTTP 201)
    res_create = client.post(
        "/api/resenas",
        json=payload_u1,
        headers={"Authorization": f"Bearer {token_u1}"},
    )
    assert res_create.status_code == 201, res_create.text
    creada = res_create.json()
    assert isinstance(creada["id"], str) and len(creada["id"]) > 0
    assert creada["producto_id"] == producto_id
    assert creada["usuario_id"] == 101
    assert creada["calificacion"] == 5
    assert creada["comentario"] == "Excelente taza de cerámica"

    # 2. Consultar reseñas tras 1 registro
    res_get_1 = client.get(f"/api/resenas/producto/{producto_id}")
    assert res_get_1.status_code == 200
    data_1 = res_get_1.json()
    assert data_1["producto_id"] == producto_id
    assert data_1["promedio"] == 5.0
    assert len(data_1["resenas"]) == 1
    assert data_1["resenas"][0] == creada

    # 3. Segundo usuario registra reseña para verificar cálculo de promedio
    token_u2 = generar_jwt(sub="102", rol="cliente")
    payload_u2 = {
        "producto_id": producto_id,
        "usuario_id": 102,
        "calificacion": 4,
        "comentario": "Muy buena calidad",
    }
    res_create_2 = client.post(
        "/api/resenas",
        json=payload_u2,
        headers={"Authorization": f"Bearer {token_u2}"},
    )
    assert res_create_2.status_code == 201, res_create_2.text

    res_get_2 = client.get(f"/api/resenas/producto/{producto_id}")
    assert res_get_2.status_code == 200
    data_2 = res_get_2.json()
    assert data_2["promedio"] == 4.5
    assert len(data_2["resenas"]) == 2

    # 4. Reintento del mismo usuario sobre el mismo producto -> 409 RESENA_DUPLICADA
    res_dup = client.post(
        "/api/resenas",
        json=payload_u1,
        headers={"Authorization": f"Bearer {token_u1}"},
    )
    err_dup = _assert_error_format(res_dup, 409)
    assert err_dup == {
        "codigo": "RESENA_DUPLICADA",
        "mensaje": "Ya registraste una reseña para este producto.",
    }


def test_errores_autenticacion_y_autorizacion(
    client: httpx.Client, producto_id: int
) -> None:
    payload = {
        "producto_id": producto_id,
        "usuario_id": 200,
        "calificacion": 5,
        "comentario": "Buen producto",
    }

    # Sin token -> 401
    res_no_token = client.post("/api/resenas", json=payload)
    _assert_error_format(res_no_token, 401)

    # Token expirado -> 401
    token_expirado = generar_jwt(sub="200", rol="cliente", exp_delta_seconds=-60)
    res_expirado = client.post(
        "/api/resenas",
        json=payload,
        headers={"Authorization": f"Bearer {token_expirado}"},
    )
    _assert_error_format(res_expirado, 401)

    # Token con firma inválida -> 401
    token_firma_mala = generar_jwt(sub="200", rol="cliente", secret="otro-secreto")
    res_firma = client.post(
        "/api/resenas",
        json=payload,
        headers={"Authorization": f"Bearer {token_firma_mala}"},
    )
    _assert_error_format(res_firma, 401)

    # Rol distinto de 'cliente' -> 403
    token_admin = generar_jwt(sub="200", rol="admin")
    res_admin = client.post(
        "/api/resenas",
        json=payload,
        headers={"Authorization": f"Bearer {token_admin}"},
    )
    _assert_error_format(res_admin, 403)

    # usuario_id distinto de sub -> 403
    token_otro_usuario = generar_jwt(sub="999", rol="cliente")
    res_sub = client.post(
        "/api/resenas",
        json=payload,
        headers={"Authorization": f"Bearer {token_otro_usuario}"},
    )
    _assert_error_format(res_sub, 403)


def test_errores_validacion_y_404(client: httpx.Client, producto_id: int) -> None:
    token = generar_jwt(sub="300", rol="cliente")

    # Calificación fuera de rango -> 400
    res_calif = client.post(
        "/api/resenas",
        json={
            "producto_id": producto_id,
            "usuario_id": 300,
            "calificacion": 6,
            "comentario": "Fuera de rango",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    _assert_error_format(res_calif, 400)

    # Comentario vacío (solo espacios) -> 400
    res_coment = client.post(
        "/api/resenas",
        json={
            "producto_id": producto_id,
            "usuario_id": 300,
            "calificacion": 5,
            "comentario": "   ",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    _assert_error_format(res_coment, 400)

    # producto_id inválido en GET -> 400
    res_get_invalido = client.get("/api/resenas/producto/0")
    _assert_error_format(res_get_invalido, 400)

    # Ruta inexistente -> 404
    res_404 = client.get("/api/resenas/ruta-inexistente")
    _assert_error_format(res_404, 404)
