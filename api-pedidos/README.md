# API de Pedidos

Servicio PHP con PostgreSQL para crear pedidos, consultar el historial y coordinar el checkout. Escucha en `0.0.0.0` con `PORT=8006` por defecto.

## Configuración

Docker Compose y Kubernetes inyectan la configuración existente del repositorio. Para desarrollo, toma como referencia el `.env.example` de la raíz. El contenedor usa `DATABASE_URL` y acepta `DATABASE_URL_PEDIDOS` como alternativa. La base debe existir. El contenedor crea las tablas al arrancar.

También se requieren `JWT_SECRET`, `X_SERVICE_TOKEN`, `API_CARRITO_URL`, `API_PRODUCTOS_URL`, `API_ENVIOS_URL`, `API_INVENTARIO_URL` y `API_PAGOS_URL`. Configura `CORS_ORIGIN` con el origen del frontend.

## Rutas

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | `/health` | Público |
| POST | `/api/pedidos` | Cliente |
| GET | `/api/pedidos/usuario/{usuario_id}` | Titular |
| POST | `/api/pedidos/{id}/pagar` | Titular |
| PATCH | `/api/pedidos/{id}/estado` | Admin o interno |

Cuando el checkout devuelve `202`, repite la solicitud al mismo pedido con el mismo `resultado_simulado`. El servicio reanuda desde el avance guardado en PostgreSQL. Los cuerpos y ejemplos están en [CONTRATOS-API.md](../CONTRATOS-API.md).
