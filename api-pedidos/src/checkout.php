<?php
declare(strict_types=1);

function verificarIntento(array $pedido, string $resultado): void
{
    if ($pedido['resultado_simulado'] !== null && $pedido['resultado_simulado'] !== $resultado) {
        throw new ErrorApi(409, 'SOLICITUD_DISTINTA', 'El pedido ya tiene un intento con otro resultado simulado.');
    }
}

function pagarPedido(PDO $db, int $id, int $usuario, string $resultado): array
{
    $pedido = obtenerPedido($db, $id);
    exigirPermiso((int) $pedido['usuario_id'] === $usuario);
    if (!consultar($db, 'SELECT pg_try_advisory_lock(8006, ?)', [$id])->fetchColumn()) {
        $pedido = obtenerPedido($db, $id);
        verificarIntento($pedido, $resultado);
        return [202, $pedido];
    }
    try {
        $pedido = obtenerPedido($db, $id);
        verificarIntento($pedido, $resultado);
        return [200, continuarCompra($db, $id, $usuario, $pedido, $resultado)];
    } catch (ServicioNoDisponible) {
        return [202, obtenerPedido($db, $id)];
    } finally {
        consultar($db, 'SELECT pg_advisory_unlock(8006, ?)', [$id]);
    }
}

function continuarCompra(PDO $db, int $id, int $usuario, array $pedido, string $resultado): array
{
    // Cada paso se guarda de forma independiente mientras la conexión mantiene el bloqueo por pedido.
    if ($pedido['resultado_simulado'] === null) {
        consultar($db, 'UPDATE pedidos SET resultado_simulado = ? WHERE id = ?', [$resultado, $id]);
    }
    if ($pedido['estado_pago'] === 'sin_pago') {
        $items = json_decode($pedido['items'], true, 512, JSON_THROW_ON_ERROR);
        $reserva = respuestaServicio(llamarServicio('INVENTARIO', 'POST', '/api/inventario/reservar', [
            'pedido_id' => $id,
            'items' => array_map(static fn (array $item): array => [
                'producto_id' => $item['producto_id'],
                'cantidad' => $item['cantidad'],
            ], $items),
        ], interno: true), [200, 201]);
        verificarReserva($reserva, $id, 'reservada');
        consultar($db, "UPDATE pedidos SET estado_pago = 'en_proceso' WHERE id = ?", [$id]);
        $pedido['estado_pago'] = 'en_proceso';
    }
    if ($pedido['estado_pago'] === 'en_proceso') {
        registrarResultadoPago($db, $id, $usuario, $pedido, $resultado);
        $pedido['estado_pago'] = $resultado;
    }
    if ($pedido['estado'] === 'pendiente') {
        $aprobado = $pedido['estado_pago'] === 'aprobado';
        $accion = $aprobado ? 'confirmar' : 'liberar';
        $reserva = respuestaServicio(llamarServicio(
            'INVENTARIO', 'POST', "/api/inventario/reservas/$id/$accion", interno: true
        ), [200]);
        verificarReserva($reserva, $id, $aprobado ? 'confirmada' : 'liberada');
        $pedido['estado'] = $aprobado ? 'pagado' : 'cancelado';
        consultar($db, 'UPDATE pedidos SET estado = ? WHERE id = ?', [$pedido['estado'], $id]);
    }
    if ($pedido['estado'] === 'pagado') {
        completarEnvio($db, $id, $usuario, $pedido);
    }
    return obtenerPedido($db, $id);
}

function verificarReserva(array $reserva, int $id, string $estado): void
{
    if (($reserva['pedido_id'] ?? null) !== $id || ($reserva['estado'] ?? null) !== $estado) {
        throw new RuntimeException('Inventario devolvió una reserva inesperada.');
    }
}

function registrarResultadoPago(PDO $db, int $id, int $usuario, array $pedido, string $resultado): void
{
    $monto = $pedido['subtotal_centavos'] + $pedido['envio_centavos'];
    $respuesta = llamarServicio('PAGOS', 'GET', "/api/pagos/pedido/$id", interno: true);
    if ($respuesta[0] === 404) {
        $respuesta = llamarServicio('PAGOS', 'POST', '/api/pagos/procesar', [
            'pedido_id' => $id,
            'usuario_id' => $usuario,
            'monto' => $monto / 100,
            'metodo_pago' => 'simulado',
            'resultado_simulado' => $resultado,
        ], interno: true);
    }
    $pago = respuestaServicio($respuesta, [200, 201]);
    if (($pago['pedido_id'] ?? null) !== $id || ($pago['usuario_id'] ?? null) !== $usuario
        || ($pago['metodo_pago'] ?? null) !== 'simulado' || ($pago['estado'] ?? null) !== $resultado
        || centavos($pago['monto'] ?? null) !== $monto) {
        throw new ErrorApi(409, 'SOLICITUD_DISTINTA', 'El pago registrado no coincide con el intento del pedido.');
    }
    consultar($db, 'UPDATE pedidos SET estado_pago = ? WHERE id = ?', [$resultado, $id]);
}

function completarEnvio(PDO $db, int $id, int $usuario, array $pedido): void
{
    if (!$pedido['carrito_vaciado']) {
        respuestaServicio(llamarServicio(
            'CARRITO', 'DELETE', "/api/carrito/$usuario/vaciar", interno: true,
            headers: ["Idempotency-Key: pedido-$id"]
        ), [200]);
        consultar($db, 'UPDATE pedidos SET carrito_vaciado = true WHERE id = ?', [$id]);
    }
    if ($pedido['guia'] === null) {
        $envio = respuestaServicio(llamarServicio(
            'ENVIOS', 'POST', '/api/envios/generar', ['pedido_id' => $id], interno: true
        ), [200, 201]);
        if (($envio['pedido_id'] ?? null) !== $id || !is_string($envio['guia'] ?? null) || trim($envio['guia']) === '') {
            throw new RuntimeException('Envíos devolvió una guía inválida.');
        }
        consultar($db, 'UPDATE pedidos SET guia = ? WHERE id = ?', [$envio['guia'], $id]);
    }
}
