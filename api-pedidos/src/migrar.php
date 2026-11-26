<?php
declare(strict_types=1);

require __DIR__ . '/base.php';

$db = conectar();
$db->beginTransaction();
$db->exec('SELECT pg_advisory_xact_lock(8006, 0)');
$db->exec(file_get_contents(__DIR__ . '/schema.sql'));
$db->commit();
