package tienda.pagos;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.ParseException;
import java.time.Instant;
import java.util.Date;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class Autorizacion {
    private final byte[] tokenInterno;
    private final MACVerifier verificador;

    Autorizacion(@Value("${X_SERVICE_TOKEN}") String tokenInterno, @Value("${JWT_SECRET}") String secreto)
            throws JOSEException {
        if (tokenInterno.isBlank()) {
            throw new IllegalArgumentException("Configura X_SERVICE_TOKEN.");
        }
        this.tokenInterno = tokenInterno.getBytes(StandardCharsets.UTF_8);
        this.verificador = new MACVerifier(secreto.getBytes(StandardCharsets.UTF_8));
    }

    void exigirInterno(String token) {
        if (token == null || !MessageDigest.isEqual(tokenInterno, token.getBytes(StandardCharsets.UTF_8))) {
            throw ErrorApi.noAutenticado();
        }
    }

    long usuario(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw ErrorApi.noAutenticado();
        }
        try {
            SignedJWT jwt = SignedJWT.parse(authorization.substring(7).strip());
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm()) || !jwt.verify(verificador)) {
                throw ErrorApi.noAutenticado();
            }
            JWTClaimsSet datos = jwt.getJWTClaimsSet();
            Object sujeto = jwt.getPayload().toJSONObject().get("sub");
            Date expira = datos.getExpirationTime();
            Date validoDesde = datos.getNotBeforeTime();
            Instant ahora = Instant.now();
            if (expira == null || !expira.toInstant().isAfter(ahora)
                    || (validoDesde != null && validoDesde.toInstant().isAfter(ahora))
                    || !(sujeto instanceof String sub) || !sub.matches("[1-9][0-9]*")
                    || !("cliente".equals(datos.getClaim("rol")) || "admin".equals(datos.getClaim("rol")))) {
                throw ErrorApi.noAutenticado();
            }
            return Long.parseLong(sub);
        } catch (ParseException | JOSEException | IllegalArgumentException error) {
            throw ErrorApi.noAutenticado();
        }
    }
}
