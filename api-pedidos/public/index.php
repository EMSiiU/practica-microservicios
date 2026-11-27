<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../src/base.php';
require __DIR__ . '/../src/http.php';
require __DIR__ . '/../src/pedidos.php';
require __DIR__ . '/../src/checkout.php';

header('Content-Type: application/json; charset=utf-8');
header('Vary: Origin');
$origen = getenv('CORS_ORIGIN');
if ($origen && ($_SERVER['HTTP_ORIGIN'] ?? null) === $origen) {
    header("Access-Control-Allow-Origin: $origen");
    header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
}

$metodo = $_SERVER['REQUEST_METHOD'];
$ruta = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
try {
    if ($metodo === 'OPTIONS') {
        http_response_code(204);
    } elseif ($metodo === 'GET' && $ruta === '/health') {
        responder(200, ['status' => 'ok']);
    } elseif ($metodo === 'GET' && $ruta === '/api/pedidos') {
        exigirPermiso(usuario()['rol'] === 'admin');
        $historial = consultar(conectar(), 'SELECT * FROM pedidos ORDER BY id DESC', []);
        responder(200, array_map('presentar', $historial->fetchAll(PDO::FETCH_ASSOC)));
    } elseif ($metodo === 'POST' && $ruta === '/api/pedidos') {
        $usuario = usuario();
        exigirPermiso($usuario['rol'] === 'cliente');
        $direccion = direccion(cuerpo()['direccion'] ?? null);
        responder(201, presentar(crearPedido(conectar(), $usuario['id'], $direccion)));
    } elseif ($metodo === 'GET' && preg_match('~\A/api/pedidos/usuario/([^/]+)\z~', $ruta ?? '', $partes)) {
        $id = idRuta($partes[1]);
        exigirPermiso(usuario()['id'] === $id);
        $historial = consultar(conectar(), 'SELECT * FROM pedidos WHERE usuario_id = ? ORDER BY id DESC', [$id]);
        responder(200, array_map('presentar', $historial->fetchAll(PDO::FETCH_ASSOC)));
    } elseif ($metodo === 'POST' && preg_match('~\A/api/pedidos/([^/]+)/pagar\z~', $ruta ?? '', $partes)) {
        $id = idRuta($partes[1], 2147483647);
        $usuario = usuario();
        $resultado = cuerpo()['resultado_simulado'] ?? null;
        if (!in_array($resultado, ['aprobado', 'rechazado'], true)) {
            throw new ErrorApi(400, 'SOLICITUD_INVALIDA', 'El resultado simulado debe ser aprobado o rechazado.');
        }
        [$estado, $pedido] = pagarPedido(conectar(), $id, $usuario['id'], $resultado);
        responder($estado, presentar($pedido));
    } elseif ($metodo === 'PATCH' && preg_match('~\A/api/pedidos/([^/]+)/estado\z~', $ruta ?? '', $partes)) {
        $id = idRuta($partes[1], 2147483647);
        autorizarCambioEstado();
        $estado = cuerpo()['estado'] ?? null;
        if (!in_array($estado, ['pendiente', 'pagado', 'enviado', 'cancelado'], true)) {
            throw new ErrorApi(400, 'SOLICITUD_INVALIDA', 'El estado del pedido no es válido.');
        }
        if ($estado !== 'enviado') {
            throw new ErrorApi(409, 'ESTADO_INVALIDO', 'La operación solo permite marcar el pedido como enviado.');
        }
        responder(200, presentar(enviarPedido(conectar(), $id)));
    } else {
        throw new ErrorApi(404, 'RUTA_NO_ENCONTRADA', 'La ruta no existe.');
    }
} catch (ErrorApi $error) {
    responder($error->estado, ['codigo' => $error->codigo, 'mensaje' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log((string) $error);
    responder(500, ['codigo' => 'ERROR_INTERNO', 'mensaje' => 'No fue posible completar la operación.']);
}

function idRuta(string $valor, int $maximo = PHP_INT_MAX): int
{
    $id = identificador($valor);
    if ($id === null || $id > $maximo) {
        throw new ErrorApi(400, 'SOLICITUD_INVALIDA', 'El identificador debe ser un entero positivo válido.');
    }
    return $id;
}
