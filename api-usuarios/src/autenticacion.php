<?php

declare(strict_types=1);

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

function claveJwt(): string
{
    $clave = getenv('JWT_SECRET');

    if (!is_string($clave) || strlen($clave) < 32) {
        throw new RuntimeException('Configura JWT_SECRET con al menos 32 bytes.');
    }

    return $clave;
}

function iniciarSesion(): void
{
    $datos = json_decode((string) file_get_contents('php://input'));
    $correo = is_string($datos->correo ?? null) ? strtolower(trim($datos->correo)) : '';
    $contrasena = $datos->contrasena ?? null;

    if (
        !filter_var($correo, FILTER_VALIDATE_EMAIL)
        || !is_string($contrasena)
        || $contrasena === ''
        || strlen($contrasena) > 72
        || str_contains($contrasena, "\0")
    ) {
        responderJson(400, [
            'codigo' => 'DATOS_INVALIDOS',
            'mensaje' => 'Envía un correo y una contraseña válidos.',
        ]);
        return;
    }

    $usuario = buscarUsuarioPorCorreo($correo);

    if ($usuario === null || !password_verify($contrasena, $usuario['contrasena_hash'])) {
        responderJson(401, [
            'codigo' => 'CREDENCIALES_INVALIDAS',
            'mensaje' => 'Correo o contraseña incorrectos.',
        ]);
        return;
    }

    unset($usuario['contrasena_hash']);
    $ahora = time();

    $token = JWT::encode([
        'sub' => (string) $usuario['id'],
        'rol' => $usuario['rol'],
        'iat' => $ahora,
        'exp' => $ahora + 3600,
    ], claveJwt(), 'HS256');

    responderJson(200, [
        'token' => $token,
        'tipo_token' => 'Bearer',
        'usuario' => $usuario,
    ]);
}

function leerToken(): ?stdClass
{
    $autorizacion = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (!preg_match('/\ABearer[ \t]+(\S+)\z/i', $autorizacion, $partes)) {
        return null;
    }

    $clave = new Key(claveJwt(), 'HS256');

    try {
        $datos = JWT::decode($partes[1], $clave);
    } catch (UnexpectedValueException | DomainException | TypeError) {
        return null;
    }

    if (
        !is_string($datos->sub ?? null)
        || !preg_match('/\A[1-9][0-9]*\z/', $datos->sub)
        || !in_array($datos->rol ?? null, ['cliente', 'admin'], true)
        || !is_int($datos->exp ?? null)
    ) {
        return null;
    }

    return $datos;
}

function consultarPerfil(string $idSolicitado): void
{
    $token = leerToken();

    if ($token === null) {
        responderJson(401, [
            'codigo' => 'TOKEN_INVALIDO',
            'mensaje' => 'Envía un token Bearer válido y vigente.',
        ]);
        return;
    }

    if ($token->sub !== $idSolicitado) {
        responderJson(403, [
            'codigo' => 'PERFIL_NO_AUTORIZADO',
            'mensaje' => 'Solo puedes consultar tu propio perfil.',
        ]);
        return;
    }

    $perfil = buscarPerfilPorId($idSolicitado);

    if ($perfil === null) {
        responderJson(404, [
            'codigo' => 'USUARIO_NO_ENCONTRADO',
            'mensaje' => 'El perfil solicitado no existe.',
        ]);
        return;
    }

    responderJson(200, $perfil);
}