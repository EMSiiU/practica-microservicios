<?php
declare(strict_types=1);

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

final class ErrorApi extends RuntimeException
{
    public function __construct(public readonly int $estado, public readonly string $codigo, string $mensaje)
    {
        parent::__construct($mensaje);
    }
}

final class ServicioNoDisponible extends RuntimeException {}

function cuerpo(): array
{
    try {
        $datos = json_decode(file_get_contents('php://input'), false, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        $datos = null;
    }
    if (!$datos instanceof stdClass) {
        throw new ErrorApi(400, 'SOLICITUD_INVALIDA', 'Se requiere un objeto JSON válido.');
    }
    return (array) $datos;
}

function responder(int $estado, array $datos): void
{
    http_response_code($estado);
    echo json_encode($datos, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
}

function identificador(string $valor): ?int
{
    if (!preg_match('/\A[1-9][0-9]*\z/', $valor)) {
        return null;
    }
    $id = filter_var($valor, FILTER_VALIDATE_INT);
    return $id === false ? null : $id;
}

function usuario(): array
{
    $secreto = variable('JWT_SECRET');
    if (preg_match('/\ABearer +([^\s]+)\z/i', $_SERVER['HTTP_AUTHORIZATION'] ?? '', $partes)) {
        try {
            $jwt = JWT::decode($partes[1], new Key($secreto, 'HS256'));
            $id = is_string($jwt->sub ?? null) ? identificador($jwt->sub) : null;
            if ($id !== null && is_int($jwt->exp ?? null) && $jwt->exp > time()
                && in_array($jwt->rol ?? null, ['cliente', 'admin'], true)) {
                return ['id' => $id, 'rol' => $jwt->rol];
            }
        } catch (UnexpectedValueException | DomainException) {
            // Una firma o un token inválido se responde con 401.
        }
    }
    throw new ErrorApi(401, 'TOKEN_INVALIDO', 'El token es obligatorio, inválido o venció.');
}

function exigirPermiso(bool $permitido): void
{
    if (!$permitido) {
        throw new ErrorApi(403, 'ACCESO_DENEGADO', 'No tienes permiso para realizar esta operación.');
    }
}

function autorizarCambioEstado(): void
{
    $token = $_SERVER['HTTP_X_SERVICE_TOKEN'] ?? '';
    if ($token !== '') {
        if (!hash_equals(variable('X_SERVICE_TOKEN'), $token)) {
            throw new ErrorApi(401, 'TOKEN_INVALIDO', 'El token interno es inválido.');
        }
        return;
    }
    exigirPermiso(usuario()['rol'] === 'admin');
}

function llamarServicio(
    string $servicio,
    string $metodo,
    string $ruta,
    ?array $datos = null,
    bool $interno = false,
    array $headers = []
): array {
    $url = rtrim(variable("API_{$servicio}_URL"), '/') . $ruta;
    $headers[] = 'Accept: application/json';
    if ($interno) {
        $headers[] = 'X-Service-Token: ' . variable('X_SERVICE_TOKEN');
    }
    $opciones = [
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 4,
    ];
    if ($datos !== null) {
        $headers[] = 'Content-Type: application/json';
        $opciones[CURLOPT_POSTFIELDS] = json_encode($datos, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
    }
    $opciones[CURLOPT_HTTPHEADER] = $headers;
    $curl = curl_init($url);
    curl_setopt_array($curl, $opciones);
    $respuesta = curl_exec($curl);
    $estado = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    if ($respuesta === false || $estado >= 500 || $estado === 429) {
        throw new ServicioNoDisponible("El servicio $servicio no está disponible.");
    }
    $json = json_decode($respuesta, true);
    return [$estado, is_array($json) ? $json : []];
}

function respuestaServicio(array $respuesta, array $estados): array
{
    [$estado, $datos] = $respuesta;
    if (in_array($estado, $estados, true)) {
        return $datos;
    }
    if ($estado === 409 && in_array($datos['codigo'] ?? null, [
        'STOCK_INSUFICIENTE', 'ESTADO_INVALIDO', 'SOLICITUD_DISTINTA',
    ], true) && is_string($datos['mensaje'] ?? null)) {
        throw new ErrorApi(409, $datos['codigo'], $datos['mensaje']);
    }
    throw new RuntimeException("Respuesta inesperada de un servicio ($estado).");
}
