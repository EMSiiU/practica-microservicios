package tienda.pagos;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
class PagosController {
    private final Pagos pagos;
    private final Autorizacion autorizacion;

    PagosController(Pagos pagos, Autorizacion autorizacion) {
        this.pagos = pagos;
        this.autorizacion = autorizacion;
    }

    @GetMapping("/health")
    Map<String, String> health() {
        return Map.of("status", "ok");
    }

    @PostMapping("/api/pagos/procesar")
    ResponseEntity<Pago> procesar(@RequestHeader(value = "X-Service-Token", required = false) String token,
                                @RequestBody JsonNode cuerpo) {
        autorizacion.exigirInterno(token);
        PagoProcesado procesado = pagos.procesar(SolicitudPago.desde(cuerpo));
        return ResponseEntity.status(procesado.creado() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(procesado.pago());
    }

    @GetMapping("/api/pagos/pedido/{pedidoId}")
    Pago buscar(@PathVariable String pedidoId,
                @RequestHeader(value = "X-Service-Token", required = false) String token,
                @RequestHeader(value = "Authorization", required = false) String jwt) {
        long pedido = idRuta(pedidoId);
        if (token != null) {
            autorizacion.exigirInterno(token);
            return pagos.buscar(pedido);
        }
        long usuario = autorizacion.usuario(jwt);
        Pago pago = pagos.buscar(pedido);
        if (pago.usuarioId() != usuario) {
            throw new ErrorApi(HttpStatus.FORBIDDEN, "ACCESO_DENEGADO", "Solo el titular puede consultar este pago.");
        }
        return pago;
    }

    private long idRuta(String valor) {
        try {
            if (valor.matches("[1-9][0-9]*")) {
                return Long.parseLong(valor);
            }
        } catch (NumberFormatException error) {
            throw ErrorApi.invalido("El identificador del pedido excede el rango admitido.");
        }
        throw ErrorApi.invalido("El identificador del pedido debe ser un entero positivo.");
    }
}
