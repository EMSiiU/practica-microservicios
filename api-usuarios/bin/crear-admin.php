<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}

require_once dirname(__DIR__) . '/src/usuarios.php';

$correo = strtolower(trim(getenv('ADMIN_CORREO') ?: ''));
$contrasena = getenv('ADMIN_CONTRASENA');

if (
    !filter_var($correo, FILTER_VALIDATE_EMAIL)
    || !is_string($contrasena)
    || strlen($contrasena) < 8
    || strlen($contrasena) > 72
    || str_contains($contrasena, "\0")
) {
    fwrite(STDERR, "Configura ADMIN_CORREO y una ADMIN_CONTRASENA de 8 a 72 bytes.\n");
    exit(1);
}

try {
    $admin = registrarUsuario('Administrador', $correo, $contrasena, 'admin');
} catch (RuntimeException $error) {
    fwrite(STDERR, 'No se pudo crear el administrador: ' . $error->getMessage() . "\n");
    exit(1);
}

if ($admin === null) {
    fwrite(STDERR, "El correo ya está registrado. Usa otro para la cuenta administrativa.\n");
    exit(1);
}

echo "Administrador creado con ID {$admin['id']}.\n";
