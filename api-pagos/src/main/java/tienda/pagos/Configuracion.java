package tienda.pagos;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
class Configuracion implements WebMvcConfigurer {
    private final String origen;

    Configuracion(@Value("${CORS_ORIGIN:http://localhost:4200}") String origen) {
        this.origen = origen;
    }

    @Bean(destroyMethod = "close")
    HikariDataSource dataSource(@Value("${DATABASE_URL:${DATABASE_URL_PAGOS:}}") String url) {
        URI uri = URI.create(url);
        String credenciales = uri.getRawUserInfo();
        if (!("postgresql".equals(uri.getScheme()) || "postgres".equals(uri.getScheme()))
                || uri.getHost() == null || uri.getRawPath() == null || uri.getRawPath().length() < 2
                || credenciales == null || credenciales.isBlank()) {
            throw new IllegalArgumentException("Configura DATABASE_URL como una URL de PostgreSQL.");
        }
        String[] acceso = credenciales.split(":", 2);
        int puerto = uri.getPort() < 0 ? 5432 : uri.getPort();
        String parametros = uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery();
        HikariDataSource datos = new HikariDataSource();
        datos.setJdbcUrl("jdbc:postgresql://" + uri.getHost() + ":" + puerto + uri.getRawPath() + parametros);
        datos.setUsername(decodificar(acceso[0]));
        datos.setPassword(acceso.length == 2 ? decodificar(acceso[1]) : "");
        datos.setConnectionTimeout(5000);
        return datos;
    }

    private static String decodificar(String valor) {
        return URLDecoder.decode(valor.replace("+", "%2B"), StandardCharsets.UTF_8);
    }

    @Override
    public void addCorsMappings(CorsRegistry registro) {
        registro.addMapping("/api/pagos/**")
                .allowedOrigins(origen)
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("Authorization", "Content-Type");
    }
}
