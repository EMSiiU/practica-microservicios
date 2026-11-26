package tienda.pagos;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;

record SolicitudPago(long pedidoId, long usuarioId, BigDecimal monto, String metodoPago, String resultado) {
    private static final BigDecimal MONTO_MAXIMO = new BigDecimal("999999999999.99");

    static SolicitudPago desde(JsonNode cuerpo) {
        if (cuerpo == null || !cuerpo.isObject()) {
            throw ErrorApi.invalido("Se requiere un objeto JSON válido.");
        }
        long pedido = id(cuerpo.path("pedido_id"), "pedido_id");
        long usuario = id(cuerpo.path("usuario_id"), "usuario_id");
        JsonNode importe = cuerpo.path("monto");
        if (!importe.isNumber()) {
            throw ErrorApi.invalido("El monto debe ser un número.");
        }
        BigDecimal monto = importe.decimalValue();
        if (monto.signum() < 0 || monto.compareTo(MONTO_MAXIMO) > 0 || monto.stripTrailingZeros().scale() > 2) {
            throw ErrorApi.invalido("El monto debe estar en el rango admitido y tener hasta dos decimales.");
        }
        String metodo = cuerpo.path("metodo_pago").stringValue();
        String resultado = cuerpo.path("resultado_simulado").stringValue();
        if (!"simulado".equals(metodo) || !("aprobado".equals(resultado) || "rechazado".equals(resultado))) {
            throw ErrorApi.invalido("El método debe ser simulado y el resultado debe ser aprobado o rechazado.");
        }
        return new SolicitudPago(pedido, usuario, monto.setScale(2, RoundingMode.UNNECESSARY), metodo, resultado);
    }

    private static long id(JsonNode valor, String campo) {
        if (!valor.isIntegralNumber() || !valor.canConvertToLong() || valor.longValue() <= 0) {
            throw ErrorApi.invalido(campo + " debe ser un entero positivo.");
        }
        return valor.longValue();
    }
}

record Pago(long id, @JsonProperty("pedido_id") long pedidoId, @JsonProperty("usuario_id") long usuarioId,
            BigDecimal monto, @JsonProperty("metodo_pago") String metodoPago, String estado) {
    boolean coincideCon(SolicitudPago solicitud) {
        return usuarioId == solicitud.usuarioId() && monto.compareTo(solicitud.monto()) == 0
                && metodoPago.equals(solicitud.metodoPago()) && estado.equals(solicitud.resultado());
    }
}

record PagoProcesado(Pago pago, boolean creado) {}

@Repository
class Pagos {
    private final JdbcClient db;

    Pagos(JdbcClient db) {
        this.db = db;
    }

    PagoProcesado procesar(SolicitudPago solicitud) {
        List<Pago> creados = db.sql("""
                INSERT INTO pagos (pedido_id, usuario_id, monto, metodo_pago, estado)
                VALUES (:pedido, :usuario, :monto, :metodo, :estado)
                ON CONFLICT (pedido_id) DO NOTHING
                RETURNING id, pedido_id, usuario_id, monto, metodo_pago, estado
                """)
                .param("pedido", solicitud.pedidoId())
                .param("usuario", solicitud.usuarioId())
                .param("monto", solicitud.monto())
                .param("metodo", solicitud.metodoPago())
                .param("estado", solicitud.resultado())
                .query(Pago.class).list();
        if (!creados.isEmpty()) {
            return new PagoProcesado(creados.getFirst(), true);
        }
        // La consulta separada ve el pago confirmado por una solicitud concurrente.
        Pago guardado = buscar(solicitud.pedidoId());
        if (!guardado.coincideCon(solicitud)) {
            throw new ErrorApi(HttpStatus.CONFLICT, "SOLICITUD_DISTINTA",
                    "El pedido ya tiene un pago registrado con otros datos.");
        }
        return new PagoProcesado(guardado, false);
    }

    Pago buscar(long pedidoId) {
        return db.sql("""
                SELECT id, pedido_id, usuario_id, monto, metodo_pago, estado
                FROM pagos WHERE pedido_id = :pedido
                """)
                .param("pedido", pedidoId)
                .query(Pago.class).optional()
                .orElseThrow(() -> new ErrorApi(HttpStatus.NOT_FOUND, "PAGO_NO_ENCONTRADO",
                        "El pedido aún no tiene un pago registrado."));
    }
}
