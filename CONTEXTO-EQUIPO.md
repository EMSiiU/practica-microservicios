# Contexto para el Equipo — Avance e Integración en Docker y Kubernetes

Este documento resume lo implementado hasta ahora en el monorepo `practica-microservicios` y las consideraciones técnicas que deben seguir los integrantes para integrar sus microservicios en **Docker Compose** y **Kubernetes (Docker Desktop)**.

---

## 1. Avance actual en el repositorio

### Microservicio `api-resenas/` (Integrante 4 — Puerto `8008`)
- Implementado en Python con **FastAPI**, **PyMongo** y **PyJWT** siguiendo [CONTRATOS-API.md](./CONTRATOS-API.md).
- Endpoints implementados:
  - `GET /api/resenas/producto/{producto_id}` (Público): devuelve `{"producto_id", "promedio", "resenas"}` (`promedio: null` y `resenas: []` si no hay reseñas).
  - `POST /api/resenas` (Cliente autenticado): valida JWT HS256 (`exp`, `rol == "cliente"`, `str(usuario_id) == sub`), crea índice único compuesto `(producto_id, usuario_id)` en MongoDB y responde `409 RESENA_DUPLICADA` ante duplicados o `201` al crear.
  - `GET /health`: responde `200 {"status": "ok"}` (usado por los probes de Kubernetes).
- Todos los errores (`400`, `401`, `403`, `404`, `409`, `500`) se devuelven en formato `{"codigo": "...", "mensaje": "..."}`.
- Incluye `api-resenas/Dockerfile`, `api-resenas/docker-compose.dev.yml` (aislado con MongoDB en `red-tienda`) y pruebas en `api-resenas/tests/test_resenas.py`.

### Frontend Web `frontend-tienda/` (Integrante 4 — Puerto `4200`)
- Aplicación **Angular 19** con estética Dashboard Bento y servidor **Nginx** multi-stage en puerto `4200` (`try_files` para rutas SPA).
- Implementa las 4 vistas obligatorias:
  1. **Inicio / Catálogo** (`/`)
  2. **Detalle de Producto** (`/producto/:id`)
  3. **Carrito y Checkout** (`/carrito`)
  4. **Mis Pedidos** (`/pedidos`)
- Incluye interceptor JWT (`Authorization: Bearer <token>`), pipe `mxn` (`$199.90`), modal de login/registro y alertas para los códigos de error del contrato (`CORREO_DUPLICADO`, `STOCK_INSUFICIENTE`, `RESENA_DUPLICADA`, `CARRITO_VACIO`, `ESTADO_INVALIDO`, `SOLICITUD_DISTINTA`).
- **`useMocks: true` por defecto** en `frontend-tienda/src/environments/environment.ts`: permite probar todo el flujo hoy con datos simulados en `snake_case`, intentando conectar en vivo con `api-resenas` (`http://localhost:8008`) y cayendo a mock solo si no hay conexión. Cuando los demás microservicios estén levantados, basta cambiar `useMocks` a `false`.

### Infraestructura compartida y orquestación
- `.env.example`: plantilla centralizada con `JWT_SECRET`, `X_SERVICE_TOKEN`, `CORS_ORIGIN`, URLs internas (`http://api-*:800X`), puertos y credenciales de PostgreSQL/MongoDB.
- `docker-compose.yml`: definición raíz con PostgreSQL, MongoDB, los 8 microservicios y `frontend-tienda` en la red `red-tienda`.
- `k8s/`: manifiestos de Kubernetes listos para Docker Desktop dentro del namespace `tienda-microservicios`:
  - `00-namespace.yaml`, `01-configmap.yaml`, `02-secret.yaml`
  - `10-mongo.yaml`, `11-postgres.yaml` (con PVCs `1Gi`)
  - `20-api-usuarios.yaml` a `27-api-resenas.yaml` (`ClusterIP`)
  - `30-frontend-tienda.yaml` (`LoadBalancer` en puerto `4200`)
- `README.MD`: guía rápida con los comandos `docker build` y `kubectl`.

---

## 2. Consideraciones clave para el resto del equipo (Kubernetes y Docker)

### A. Nombres de carpeta, Dockerfile e imagen local
- Cada servicio debe vivir en su carpeta exacta en la raíz (`api-usuarios/`, `api-productos/`, `api-envios/`, `api-inventario/`, `api-carrito/`, `api-pedidos/`, `api-pagos/`) con su `Dockerfile`.
- En `k8s/`, todos los Deployments usan `imagePullPolicy: IfNotPresent` y esperan exactamente la etiqueta `<nombre-servicio>:latest`. Antes de ejecutar `kubectl apply -f k8s/`, cada integrante debe compilar su imagen en el Docker daemon local de Docker Desktop:
  ```powershell
  docker build -t api-usuarios:latest ./api-usuarios
  ```

### B. Host `0.0.0.0` y puerto configurable (`PORT`)
- Dentro de Kubernetes y Docker, cada contenedor debe escuchar en **`0.0.0.0`** (nunca solo `127.0.0.1`) en el puerto asignado por contrato (`8001` a `8008`), respetando la variable de entorno `PORT`:
  - `api-usuarios`: `8001`
  - `api-productos`: `8002`
  - `api-envios`: `8003`
  - `api-inventario`: `8004`
  - `api-carrito`: `8005`
  - `api-pedidos`: `8006`
  - `api-pagos`: `8007`
  - `api-resenas`: `8008`

### C. Variables de entorno inyectadas automáticamente en Kubernetes
Todos los Deployments en `k8s/` cargan `tienda-config` (`ConfigMap`) y `tienda-secrets` (`Secret`) mediante `envFrom`. Sus servicios recibirán automáticamente:
- **Seguridad y CORS**:
  - `JWT_SECRET=clave_secreta_super_segura_tienda_2026`
  - `X_SERVICE_TOKEN=token_interno_servicios_tienda_2026`
  - `CORS_ORIGIN=http://localhost:4200` (y `CORS_ORIGINS=http://localhost:4200`)
- **Comunicación interna por DNS de Kubernetes** (nunca hardcodear `localhost` para llamadas servidor-a-servidor):
  - `API_USUARIOS_URL=http://api-usuarios:8001`
  - `API_PRODUCTOS_URL=http://api-productos:8002`
  - `API_ENVIOS_URL=http://api-envios:8003`
  - `API_INVENTARIO_URL=http://api-inventario:8004`
  - `API_CARRITO_URL=http://api-carrito:8005`
  - `API_PEDIDOS_URL=http://api-pedidos:8006`
  - `API_PAGOS_URL=http://api-pagos:8007`
  - `API_RESENAS_URL=http://api-resenas:8008`

### D. Bases de datos en Kubernetes (`postgres` y `mongo`)
- **PostgreSQL (`postgres:5432`)**: el manifiesto `k8s/11-postgres.yaml` monta `postgres-init-scripts` para crear automáticamente tanto `db_pedidos` como `db_pagos` en el primer arranque.
  - `api-pedidos` recibe `DATABASE_URL` apuntando a `db_pedidos` (`postgresql://tienda_admin:tienda_pass_2026@postgres:5432/db_pedidos`) además de `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`.
  - `api-pagos` recibe `DATABASE_URL` apuntando a `db_pagos`.
  - **Importante**: asegúrense de crear sus tablas/migraciones al arrancar el servicio (o de forma idempotente `CREATE TABLE IF NOT EXISTS ...`) ya que el PVC parte vacío.
- **MongoDB (`mongo:27017`)**: `api-resenas` recibe `MONGO_URI=mongodb://mongo:27017/db_resenas`.

### E. Readiness y Liveness Probes
- En `k8s/20-*` a `k8s/26-*`, los manifiestos se dejaron con `tcpSocket` en el puerto de cada API para no fallar si aún no exponen un endpoint `/health`.
- Si agregan un endpoint `GET /health` que devuelva `200`, pueden actualizar sus respectivos YAML para usar `httpGet` (como ya hace `k8s/27-api-resenas.yaml`).

### F. Acceso desde el navegador (`frontend-tienda` vs servicios `ClusterIP`)
- `frontend-tienda` se expone como `LoadBalancer` en `http://localhost:4200`.
- Los 8 microservicios usan `Service` tipo **`ClusterIP`** (solo accesibles dentro del clúster por DNS, p. ej. `http://api-pedidos:8006`).
- Como el código Angular se ejecuta en el navegador del usuario (fuera del clúster) y llama a `http://localhost:8001`..`8008`, al probar con `useMocks: false` en Kubernetes tienen dos opciones:
  1. **Exponer los puertos al host con `kubectl port-forward`** en terminales separadas (o script):
     ```powershell
     kubectl port-forward -n tienda-microservicios svc/api-usuarios 8001:8001
     kubectl port-forward -n tienda-microservicios svc/api-productos 8002:8002
     kubectl port-forward -n tienda-microservicios svc/api-envios 8003:8003
     kubectl port-forward -n tienda-microservicios svc/api-inventario 8004:8004
     kubectl port-forward -n tienda-microservicios svc/api-carrito 8005:8005
     kubectl port-forward -n tienda-microservicios svc/api-pedidos 8006:8006
     kubectl port-forward -n tienda-microservicios svc/api-pagos 8007:8007
     kubectl port-forward -n tienda-microservicios svc/api-resenas 8008:8008
     ```
  2. O agregar un `Ingress` / `nginx` reverse proxy en el futuro que enrute `/api/*` hacia los servicios `ClusterIP`.
- Para pruebas rápidas integradas sin `port-forward`, pueden usar `docker compose up --build` con el `docker-compose.yml` raíz, que ya mapea los puertos `8001`–`8008` y `4200` al host.

### G. Contrato de datos y errores
- Mantener estrictamente JSON `snake_case`, rutas sin acentos, JWT con `sub` como **cadena** (`"1"`), `rol` (`"cliente"` o `"admin"`) y `exp` de 1 hora.
- Los errores deben responder siempre con `{"codigo": "...", "mensaje": "..."}` respetando los códigos esperados por Angular: `CORREO_DUPLICADO`, `STOCK_INSUFICIENTE`, `RESENA_DUPLICADA`, `CARRITO_VACIO`, `ESTADO_INVALIDO` y `SOLICITUD_DISTINTA`.

---

## 3. Checklist rápido por integrante antes de integrar

1. Crear su carpeta `api-<servicio>/` con `Dockerfile` funcional escuchando en `0.0.0.0:$PORT`.
2. Leer `JWT_SECRET`, `X_SERVICE_TOKEN`, `CORS_ORIGIN` y URLs internas desde variables de entorno.
3. Probar `docker build -t api-<servicio>:latest ./api-<servicio>`.
4. Verificar `kubectl apply -f k8s/`, `kubectl get pods -n tienda-microservicios` y `kubectl logs -n tienda-microservicios deployment/api-<servicio>`.
