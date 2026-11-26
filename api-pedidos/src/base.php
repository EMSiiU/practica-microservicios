<?php
declare(strict_types=1);

function variable(string $nombre): string
{
    $valor = getenv($nombre);
    if ($valor === false || $valor === '') {
        throw new RuntimeException("Falta configurar $nombre.");
    }
    return $valor;
}

function conectar(): PDO
{
    $url = getenv('DATABASE_URL') ?: variable('DATABASE_URL_PEDIDOS');
    $partes = parse_url($url);
    if ($partes === false || !in_array($partes['scheme'] ?? '', ['postgresql', 'postgres'], true)
        || !isset($partes['host'], $partes['path'], $partes['user'])) {
        throw new RuntimeException('DATABASE_URL inválida.');
    }
    $host = $partes['host'];
    $puerto = $partes['port'] ?? 5432;
    $base = rawurldecode(substr($partes['path'], 1));
    return new PDO(
        "pgsql:host=$host;port=$puerto;dbname=$base;connect_timeout=5",
        rawurldecode($partes['user']),
        rawurldecode($partes['pass'] ?? ''),
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]
    );
}

function consultar(PDO $db, string $sql, array $parametros): PDOStatement
{
    $consulta = $db->prepare($sql);
    $consulta->execute($parametros);
    return $consulta;
}
