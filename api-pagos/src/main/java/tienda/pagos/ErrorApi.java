package tienda.pagos;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

final class ErrorApi extends RuntimeException {
    final HttpStatus estado;
    final String codigo;

    ErrorApi(HttpStatus estado, String codigo, String mensaje) {
        super(mensaje);
        this.estado = estado;
        this.codigo = codigo;
    }

    static ErrorApi invalido(String mensaje) {
        return new ErrorApi(HttpStatus.BAD_REQUEST, "SOLICITUD_INVALIDA", mensaje);
    }

    static ErrorApi noAutenticado() {
        return new ErrorApi(HttpStatus.UNAUTHORIZED, "TOKEN_INVALIDO", "El token es obligatorio, inválido o venció.");
    }
}

@RestControllerAdvice
class ErroresHttp {
    private static final Logger LOG = LoggerFactory.getLogger(ErroresHttp.class);

    @ExceptionHandler(ErrorApi.class)
    ResponseEntity<Map<String, String>> errorApi(ErrorApi error) {
        return responder(error.estado, error.codigo, error.getMessage());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, HttpMediaTypeNotSupportedException.class})
    ResponseEntity<Map<String, String>> jsonInvalido() {
        return errorApi(ErrorApi.invalido("Se requiere un objeto JSON válido."));
    }

    @ExceptionHandler({NoResourceFoundException.class, HttpRequestMethodNotSupportedException.class})
    ResponseEntity<Map<String, String>> rutaInvalida() {
        return responder(HttpStatus.NOT_FOUND, "RUTA_NO_ENCONTRADA", "La ruta no existe.");
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> inesperado(Exception error) {
        LOG.error("No se pudo completar la operación de pagos.", error);
        return responder(HttpStatus.INTERNAL_SERVER_ERROR, "ERROR_INTERNO", "No fue posible completar la operación.");
    }

    private ResponseEntity<Map<String, String>> responder(HttpStatus estado, String codigo, String mensaje) {
        return ResponseEntity.status(estado).body(Map.of("codigo", codigo, "mensaje", mensaje));
    }
}
