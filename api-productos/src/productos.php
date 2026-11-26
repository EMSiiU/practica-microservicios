<?php

declare(strict_types=1);

function abrirCatalogo(): PDO
{
    $directorio = dirname(__DIR__) . '/data';

    if (!is_dir($directorio) && !@mkdir($directorio, 0775, true) && !is_dir($directorio)) {
        throw new RuntimeException('No se pudo crear la carpeta del catálogo.');
    }

    $db = new PDO('sqlite:' . $directorio . '/productos.sqlite', options: [
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS productos (
            id INTEGER PRIMARY KEY,
            nombre TEXT NOT NULL,
            descripcion TEXT NOT NULL,
            precio_centavos INTEGER NOT NULL CHECK (precio_centavos >= 0),
            categoria TEXT NOT NULL,
            imagen_url TEXT NOT NULL
        )
        SQL
    );

    return $db;
}

function validarProducto(stdClass $datos): array
{
    $producto = [];
    foreach (['nombre', 'descripcion', 'categoria', 'imagen_url'] as $campo) {
        $valor = $datos->$campo ?? null;
        if (!is_string($valor) || trim($valor) === '') {
            throw new InvalidArgumentException("El campo $campo debe ser un texto no vacío.");
        }

        $producto[$campo] = trim($valor);
    }

    $url = $producto['imagen_url'];
    if (
        !filter_var($url, FILTER_VALIDATE_URL)
        || !in_array(strtolower((string) parse_url($url, PHP_URL_SCHEME)), ['http', 'https'], true)
    ) {
        throw new InvalidArgumentException('imagen_url debe ser una URL HTTP o HTTPS válida.');
    }

    $precio = $datos->precio ?? null;
    if (!is_int($precio) && !is_float($precio)) {
        throw new InvalidArgumentException('precio debe ser un número JSON en MXN.');
    }

    $precio = (float) $precio;
    if (!is_finite($precio) || $precio < 0 || $precio > 99999999.99 || round($precio, 2) !== $precio) {
        throw new InvalidArgumentException('precio debe estar entre 0 y 99999999.99 MXN y tener hasta dos decimales.');
    }

    $producto['precio_centavos'] = (int) round($precio * 100);

    return $producto;
}

function presentarProducto(array $fila): array
{
    return [
        'id' => $fila['id'],
        'nombre' => $fila['nombre'],
        'descripcion' => $fila['descripcion'],
        'precio' => $fila['precio_centavos'] / 100,
        'categoria' => $fila['categoria'],
        'imagen_url' => $fila['imagen_url'],
    ];
}

function listarProductos(PDO $db): array
{
    $filas = $db->query('SELECT * FROM productos ORDER BY id')->fetchAll();

    return array_map('presentarProducto', $filas);
}

function buscarProducto(PDO $db, int $id): ?array
{
    $consulta = $db->prepare('SELECT * FROM productos WHERE id = :id');
    $consulta->execute(['id' => $id]);
    $fila = $consulta->fetch();

    return $fila === false ? null : presentarProducto($fila);
}

function crearProducto(PDO $db, array $producto): array
{
    $consulta = $db->prepare(<<<'SQL'
        INSERT INTO productos (nombre, descripcion, precio_centavos, categoria, imagen_url)
        VALUES (:nombre, :descripcion, :precio_centavos, :categoria, :imagen_url)
        RETURNING *
        SQL
    );
    $consulta->execute($producto);

    return presentarProducto($consulta->fetch());
}
