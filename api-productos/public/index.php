<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/vendor/autoload.php';
require_once dirname(__DIR__) . '/src/autenticacion.php';
require_once dirname(__DIR__) . '/src/productos.php';

function responderJson(int $estado, array $datos): void
{
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? '';
$ruta = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
$origenPermitido = getenv('CORS_ORIGIN');

header('Vary: Origin');
if ($origen !== '' && $origen === $origenPermitido) {
    header('Access-Control-Allow-Origin: ' . $origenPermitido);
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
}

if (
    $metodo === 'OPTIONS'
    && is_string($ruta)
    && ($ruta === '/api/productos' || str_starts_with($ruta, '/api/productos/'))
) {
    http_response_code(204);
    return;
}

if ($metodo === 'GET' && $ruta === '/health') {
    responderJson(200, ['servicio' => 'api-productos', 'estado' => 'ok']);
    return;
}

try {
    if ($metodo === 'GET' && $ruta === '/api/productos') {
        responderJson(200, listarProductos(abrirCatalogo()));
        return;
    }

    if ($metodo === 'GET' && is_string($ruta) && preg_match('#\A/api/productos/([1-9][0-9]*)\z#', $ruta, $partes)) {
        $id = filter_var($partes[1], FILTER_VALIDATE_INT);
        $producto = $id === false ? null : buscarProducto(abrirCatalogo(), $id);

        if ($producto === null) {
            responderJson(404, ['codigo' => 'PRODUCTO_NO_ENCONTRADO', 'mensaje' => 'El producto no existe.']);
            return;
        }

        responderJson(200, $producto);
        return;
    }

    if ($metodo === 'POST' && $ruta === '/api/productos') {
        $rol = rolDelToken();
        if ($rol === null) {
            responderJson(401, ['codigo' => 'TOKEN_INVALIDO', 'mensaje' => 'Envía un token Bearer válido y vigente.']);
            return;
        }

        if ($rol !== 'admin') {
            responderJson(403, ['codigo' => 'ROL_NO_AUTORIZADO', 'mensaje' => 'La creación de productos requiere el rol admin.']);
            return;
        }

        $datos = json_decode((string) file_get_contents('php://input'), flags: JSON_THROW_ON_ERROR);
        if (!$datos instanceof stdClass) {
            throw new InvalidArgumentException('El cuerpo debe ser un objeto JSON.');
        }

        $producto = validarProducto($datos);
        $nuevo = crearProducto(abrirCatalogo(), $producto);
        header('Location: /api/productos/' . $nuevo['id']);
        responderJson(201, $nuevo);
        return;
    }
} catch (JsonException) {
    responderJson(400, ['codigo' => 'JSON_INVALIDO', 'mensaje' => 'El cuerpo debe ser JSON válido.']);
    return;
} catch (InvalidArgumentException $error) {
    responderJson(400, ['codigo' => 'DATOS_INVALIDOS', 'mensaje' => $error->getMessage()]);
    return;
} catch (RuntimeException $error) {
    error_log($error->getMessage());
    responderJson(500, ['codigo' => 'ERROR_INTERNO', 'mensaje' => 'No se pudo completar la solicitud.']);
    return;
}

responderJson(404, ['codigo' => 'RUTA_NO_ENCONTRADA', 'mensaje' => 'La ruta solicitada no existe.']);
