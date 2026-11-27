<?php
declare(strict_types=1);

function direccion(mixed $entrada): array
{
    $direccion = [];
    foreach (['calle', 'numero', 'colonia', 'ciudad', 'estado', 'codigo_postal'] as $campo) {
        $valor = $entrada instanceof stdClass ? ($entrada->$campo ?? null) : null;
        if (!is_string($valor) || trim($valor) === '') {
            throw new ErrorApi(400, 'SOLICITUD_INVALIDA', "La dirección requiere el campo $campo.");
        }
        $direccion[$campo] = trim($valor);
    }
    if (!preg_match('/\A[0-9]{5}\z/', $direccion['codigo_postal'])) {
        throw new ErrorApi(400, 'SOLICITUD_INVALIDA', 'El código postal debe tener cinco dígitos.');
    }
    if ($entrada instanceof stdClass && property_exists($entrada, 'pais')
        && !in_array($entrada->pais, ['México', 'Mexico', 'MX'], true)) {
        throw new ErrorApi(400, 'SOLICITUD_INVALIDA', 'El envío se limita a México.');
    }
    return $direccion;
}

function centavos(mixed $monto): int
{
    if (!is_int($monto) && !is_float($monto)) {
        throw new RuntimeException('El servicio debe devolver un monto numérico.');
    }
    $decimal = json_encode($monto, JSON_THROW_ON_ERROR);
    if (!preg_match('/\A([0-9]{1,12})(?:\.([0-9]{1,2}))?\z/', $decimal, $partes)) {
        throw new RuntimeException('El servicio devolvió un monto fuera de rango o con más de dos decimales.');
    }
    return (int) $partes[1] * 100 + (int) str_pad($partes[2] ?? '', 2, '0');
}

function presentar(array $pedido): array
{
    $items = json_decode($pedido['items'], true, 512, JSON_THROW_ON_ERROR);
    foreach ($items as &$item) {
        $item['precio_unitario'] = $item['precio_centavos'] / 100;
        unset($item['precio_centavos']);
    }
    unset($item);
    return [
        'id' => (int) $pedido['id'],
        'usuario_id' => (int) $pedido['usuario_id'],
        'estado' => $pedido['estado'],
        'estado_pago' => $pedido['estado_pago'],
        'items' => $items,
        'direccion' => json_decode($pedido['direccion'], true, 512, JSON_THROW_ON_ERROR),
        'subtotal' => $pedido['subtotal_centavos'] / 100,
        'costo_envio' => $pedido['envio_centavos'] / 100,
        'total' => ($pedido['subtotal_centavos'] + $pedido['envio_centavos']) / 100,
        'guia' => $pedido['guia'],
    ];
}

function obtenerPedido(PDO $db, int $id): array
{
    $pedido = consultar($db, 'SELECT * FROM pedidos WHERE id = ?', [$id])->fetch(PDO::FETCH_ASSOC);
    if ($pedido === false) {
        throw new ErrorApi(404, 'PEDIDO_NO_ENCONTRADO', 'El pedido no existe.');
    }
    return $pedido;
}

function crearPedido(PDO $db, int $usuario, array $direccion): array
{
    $carrito = respuestaServicio(llamarServicio('CARRITO', 'GET', "/api/carrito/$usuario", interno: true), [200]);
    $productos = $carrito['items'] ?? null;
    if (!is_array($productos) || !array_is_list($productos)) {
        throw new RuntimeException('El carrito devolvió una lista inválida.');
    }
    if ($productos === []) {
        throw new ErrorApi(409, 'CARRITO_VACIO', 'El carrito está vacío.');
    }
    $items = [];
    $subtotal = 0;
    $cantidad = 0;
    foreach ($productos as $producto) {
        $id = $producto['producto_id'] ?? null;
        $unidades = $producto['cantidad'] ?? null;
        if (!is_int($id) || $id < 1 || !is_int($unidades) || $unidades < 1 || isset($items[$id])) {
            throw new RuntimeException('El carrito devolvió un producto inválido o repetido.');
        }
        $respuesta = llamarServicio('PRODUCTOS', 'GET', "/api/productos/$id");
        if ($respuesta[0] === 404) {
            throw new ErrorApi(404, 'PRODUCTO_NO_ENCONTRADO', 'Un producto del carrito ya no existe.');
        }
        $precio = centavos(respuestaServicio($respuesta, [200])['precio'] ?? null);
        if ($unidades > PHP_INT_MAX - $cantidad
            || ($precio > 0 && $unidades > intdiv(PHP_INT_MAX - $subtotal, $precio))) {
            throw new RuntimeException('El importe o la cantidad del carrito exceden el rango admitido.');
        }
        $items[$id] = ['producto_id' => $id, 'cantidad' => $unidades, 'precio_centavos' => $precio];
        $cantidad += $unidades;
        $subtotal += $precio * $unidades;
    }
    $cotizacion = respuestaServicio(llamarServicio('ENVIOS', 'POST', '/api/envios/cotizar', [
        'codigo_postal' => $direccion['codigo_postal'],
        'cantidad' => $cantidad,
    ]), [200]);
    $envio = centavos($cotizacion['costo_envio'] ?? null);
    if ($subtotal > 99999999999999 - $envio) {
        throw new RuntimeException('El total del pedido excede el rango admitido.');
    }
    return consultar(
        $db,
        'INSERT INTO pedidos (usuario_id, direccion, items, subtotal_centavos, envio_centavos)
         VALUES (?, ?, ?, ?, ?) RETURNING *',
        [
            $usuario,
            json_encode($direccion, JSON_THROW_ON_ERROR),
            json_encode(array_values($items), JSON_THROW_ON_ERROR),
            $subtotal,
            $envio,
        ]
    )->fetch(PDO::FETCH_ASSOC);
}

function enviarPedido(PDO $db, int $id): array
{
    $pedido = consultar(
        $db,
        "UPDATE pedidos SET estado = 'enviado' WHERE id = ?
         AND estado IN ('pagado', 'enviado') AND guia IS NOT NULL RETURNING *",
        [$id]
    )->fetch(PDO::FETCH_ASSOC);
    if ($pedido !== false) {
        if (is_string($pedido['guia'] ?? null) && $pedido['guia'] !== '') {
            try {
                llamarServicio(
                    'ENVIOS',
                    'PATCH',
                    '/api/envios/' . rawurlencode($pedido['guia']) . '/estado',
                    ['estado' => 'en_transito'],
                    interno: true
                );
            } catch (Throwable $error) {
                error_log('No se pudo sincronizar la guía en Envíos: ' . $error->getMessage());
            }
        }
        return $pedido;
    }
    obtenerPedido($db, $id);
    throw new ErrorApi(409, 'ESTADO_INVALIDO', 'Solo puedes enviar un pedido pagado con guía.');
}
