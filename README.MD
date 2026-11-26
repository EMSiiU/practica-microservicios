# Práctica Microservicios — Tienda en Línea

Monorepo con los 8 microservicios del flujo de compra, bases de datos y aplicación web Angular según los acuerdos definidos en [CONTRATOS-API.md](./CONTRATOS-API.md).

## Componentes

| Servicio | Tecnología | Puerto |
| --- | --- | --- |
| `api-usuarios` | PHP | 8001 |
| `api-productos` | PHP | 8002 |
| `api-envios` | Python | 8003 |
| `api-inventario` | Go | 8004 |
| `api-carrito` | Node.js | 8005 |
| `api-pedidos` | PHP + PostgreSQL | 8006 |
| `api-pagos` | Java (Spring Boot) + PostgreSQL | 8007 |
| `api-resenas` | Python (FastAPI) + MongoDB | 8008 |
| `frontend-tienda` | Angular + Nginx | 4200 |

## Despliegue en Kubernetes (Docker Desktop)

Los manifiestos se encuentran en la carpeta `k8s/` dentro del namespace `tienda-microservicios`.

### 1. Construir las imágenes locales

Asegúrate de tener Kubernetes habilitado en Docker Desktop y construye las imágenes de los servicios disponibles desde la raíz del repositorio:

```powershell
docker build -t api-resenas:latest ./api-resenas
docker build -t frontend-tienda:latest ./frontend-tienda
# Construye de forma equivalente el resto de servicios cuando estén integrados:
# docker build -t api-usuarios:latest ./api-usuarios
# docker build -t api-productos:latest ./api-productos
# docker build -t api-envios:latest ./api-envios
# docker build -t api-inventario:latest ./api-inventario
# docker build -t api-carrito:latest ./api-carrito
# docker build -t api-pedidos:latest ./api-pedidos
# docker build -t api-pagos:latest ./api-pagos
```

### 2. Aplicar los manifiestos en el clúster

```powershell
kubectl apply -f k8s/
```

### 3. Verificar Pods y Services

```powershell
kubectl get pods -n tienda-microservicios
kubectl get svc -n tienda-microservicios
```

### 4. Consultar logs de los servicios

```powershell
kubectl logs -n tienda-microservicios deployment/api-resenas
kubectl logs -n tienda-microservicios deployment/frontend-tienda
kubectl logs -f -n tienda-microservicios deployment/api-pedidos
```

### 5. Abrir el frontend y limpiar el entorno

- Una vez que `frontend-tienda` esté en estado `Running`, abre `http://localhost:4200` en tu navegador.
- Para eliminar todos los recursos creados en el clúster:

```powershell
kubectl delete -f k8s/
```
