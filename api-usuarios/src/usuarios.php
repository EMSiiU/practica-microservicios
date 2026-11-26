<?php

declare(strict_types=1);

function abrirBaseDeDatos(): PDO
{
    $directorio = dirname(__DIR__) . '/data';

    if (!is_dir($directorio) && !@mkdir($directorio, 0775, true) && !is_dir($directorio)) {
        throw new RuntimeException('No se pudo crear la carpeta de datos.');
    }

    $db = new PDO('sqlite:' . $directorio . '/usuarios.sqlite');

    $db->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY,
            nombre TEXT NOT NULL,
            correo TEXT NOT NULL UNIQUE,
            contrasena_hash TEXT NOT NULL,
            rol TEXT NOT NULL DEFAULT 'cliente'
                CHECK (rol IN ('cliente', 'admin'))
        )
        SQL
    );

    return $db;
}

function registrarUsuario(string $nombre, string $correo, string $contrasena): ?array
{
    $db = abrirBaseDeDatos();

    $consulta = $db->prepare(<<<'SQL'
        INSERT INTO usuarios (nombre, correo, contrasena_hash)
        VALUES (:nombre, :correo, :hash)
        ON CONFLICT (correo) DO NOTHING
        RETURNING id, nombre, correo, rol
        SQL
    );

    $consulta->execute([
        'nombre' => $nombre,
        'correo' => $correo,
        'hash' => password_hash($contrasena, PASSWORD_BCRYPT),
    ]);

    $perfil = $consulta->fetch(PDO::FETCH_ASSOC);

    return $perfil === false ? null : $perfil;
}