<?php

declare(strict_types=1);

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

function rolDelToken(): ?string
{
    $autorizacion = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/\ABearer[ \t]+(\S+)\z/i', $autorizacion, $partes) !== 1) {
        return null;
    }

    $secreto = getenv('JWT_SECRET');
    if (!is_string($secreto) || strlen($secreto) < 32) {
        throw new RuntimeException('Configura JWT_SECRET con al menos 32 bytes.');
    }

    try {
        $datos = JWT::decode($partes[1], new Key($secreto, 'HS256'));
    } catch (UnexpectedValueException | DomainException | TypeError) {
        return null;
    }

    if (
        !is_string($datos->sub ?? null)
        || preg_match('/\A[1-9][0-9]*\z/', $datos->sub) !== 1
        || !is_int($datos->exp ?? null)
        || !in_array($datos->rol ?? null, ['cliente', 'admin'], true)
    ) {
        return null;
    }

    return $datos->rol;
}
