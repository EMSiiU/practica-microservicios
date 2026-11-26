<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/usuarios.php';

function responderJson(int $estadoHttp, array $datos): void
{
    http_response_code($estadoHttp);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if ($method === 'GET' && $path === '/health') {
    responderJson(200, ['servicio' => 'api-usuarios', 'estado' => 'ok']);
    return;
}

if ($method === 'POST' && $path === '/api/usuarios/registro') {
    try {
        $datos = json_decode(
            (string) file_get_contents('php://input'),
            flags: JSON_THROW_ON_ERROR
        );
    } catch (JsonException) {
        responderJson(400, [
            'codigo' => 'JSON_INVALIDO',
            'mensaje' => 'El cuerpo debe ser JSON válido.',
        ]);
        return;
    }

    $nombre = is_string($datos->nombre ?? null) ? trim($datos->nombre) : '';
    $correo = is_string($datos->correo ?? null) ? strtolower(trim($datos->correo)) : '';
    $contrasena = $datos->contrasena ?? null;

    if (
        $nombre === ''
        || !filter_var($correo, FILTER_VALIDATE_EMAIL)
        || !is_string($contrasena)
        || strlen($contrasena) < 8
        || strlen($contrasena) > 72
        || str_contains($contrasena, "\0")
    ) {
        responderJson(400, [
            'codigo' => 'DATOS_INVALIDOS',
            'mensaje' => 'Envía un nombre, un correo válido y una contraseña de 8 a 72 bytes.',
        ]);
        return;
    }

    try {
        $perfil = registrarUsuario($nombre, $correo, $contrasena);
    } catch (RuntimeException $error) {
        error_log($error->getMessage());
        responderJson(500, [
            'codigo' => 'ERROR_INTERNO',
            'mensaje' => 'No se pudo completar el registro.',
        ]);
        return;
    }

    if ($perfil === null) {
        responderJson(409, [
            'codigo' => 'CORREO_DUPLICADO',
            'mensaje' => 'Ya existe un usuario con ese correo.',
        ]);
        return;
    }

    responderJson(201, $perfil);
    return;
}

responderJson(404, [
    'codigo' => 'RUTA_NO_ENCONTRADA',
    'mensaje' => 'La ruta solicitada no existe.',
]);