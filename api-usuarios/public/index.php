<?php

declare(strict_types=1);

$method = $_SERVER['REQUEST_METHOD'] ?? '';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

header('Content-Type: application/json; charset=utf-8');

if ($method === 'GET' && $path === '/health') {
    echo json_encode([
        'servicio' => 'api-usuarios',
        'estado' => 'ok',
    ]);
    return;
}

http_response_code(404);
echo json_encode([
    'codigo' => 'RUTA_NO_ENCONTRADA',
    'mensaje' => 'La ruta solicitada no existe.',
]);