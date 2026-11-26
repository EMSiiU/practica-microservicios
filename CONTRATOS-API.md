# Contratos de API de la tienda

Este documento reúne los acuerdos del equipo para implementar e integrar los ocho microservicios y el frontend Angular. Las rutas nuevas completan el flujo de compra y se indican en sus respectivas tablas.

## Componentes

| Responsable | Componente | Tecnología | Puerto local sugerido |
| --- | --- | --- | --- |
| Integrante 1 | `api-usuarios` | PHP | 8001 |
| Integrante 1 | `api-productos` | PHP | 8002 |
| Integrante 1 | `api-envios` | Python (FastAPI o Flask) | 8003 |
| Integrante 2 | `api-inventario` | Go (Gin o Fiber) | 8004 |
| Integrante 2 | `api-carrito` | Node.js con Express | 8005 |
| Integrante 3 | `api-pedidos` | PHP con PostgreSQL | 8006 |
| Integrante 3 | `api-pagos` | Java con Spring Boot y PostgreSQL | 8007 |
| Integrante 4 | `api-resenas` | Python con MongoDB | 8008 |
| Integrante 4 | `frontend-tienda` | Angular | 4200 |

Cada componente tendrá su Dockerfile. El Compose de la raíz levantará las APIs, Angular y sus bases de datos en la red `red-tienda`. Angular configurará las URL accesibles desde el navegador. Dentro de Docker, cada API llamará a las demás por el nombre del servicio y su puerto interno configurado en Compose.

## Reglas comunes

- Los cuerpos se envían y reciben como JSON UTF-8 con `Content-Type: application/json`. Los campos usan `snake_case`, las listas sin resultados devuelven `[]` y los nombres de las rutas no llevan acentos.
- `usuario_id`, `producto_id` y `pedido_id` son enteros positivos. Los recursos con identificador propio lo devuelven como `id`. Para referirse a otro recurso se usa el nombre completo, como `producto_id`. La guía y el identificador de reseña son cadenas.
- Los montos son números JSON en MXN, con hasta dos decimales. Cada servicio calcula con enteros en centavos o decimales exactos. Angular muestra dos decimales y el símbolo de moneda. El código postal es una cadena de cinco dígitos para conservar ceros iniciales.
- **Público** significa sin token. **Titular** exige que coincida el usuario del JWT con el dueño del recurso. **Cliente autenticado** exige JWT con rol `cliente`. **Admin** exige JWT con rol `admin`. **Interno** exige `X-Service-Token`, configurado entre los servicios del flujo de compra. Ese token se queda en el backend.
- Angular envía el JWT como `Authorization: Bearer <token>`. Usuarios emite el token con `sub` como cadena del ID del usuario, `rol` como `cliente` o `admin`, y `exp` con una vigencia de una hora. Para la demo, las APIs verifican firma HS256 y expiración con un secreto compartido por configuración. Las APIs llamadas desde Angular permiten el origen del frontend.

| HTTP | Uso |
| --- | --- |
| 200 | Consulta, actualización o repetición de una operación que ya se completó. |
| 201 | Creación de un recurso nuevo. |
| 202 | El pago o sus acciones posteriores siguen pendientes. El cuerpo incluye el estado del pedido. |
| 400 | JSON inválido, campos obligatorios ausentes o valores fuera del rango permitido. |
| 401 | Credenciales de inicio de sesión incorrectas o token ausente, inválido o vencido. |
| 403 | El token es válido pero el usuario carece del rol o no es el titular. |
| 404 | El recurso solicitado no existe. |
| 409 | Conflicto con el estado existente, como correo duplicado, stock insuficiente o una transición inválida. |
| 500 | Error interno inesperado. |

Los errores comparten este formato. `codigo` se utiliza para tomar decisiones en el cliente y `mensaje` para mostrar texto.

```json
{
  "codigo": "STOCK_INSUFICIENTE",
  "mensaje": "No hay unidades suficientes para completar el pedido."
}
```

Códigos acordados para los conflictos que debe reconocer Angular: `CORREO_DUPLICADO`, `STOCK_INSUFICIENTE`, `RESENA_DUPLICADA`, `CARRITO_VACIO`, `ESTADO_INVALIDO` y `SOLICITUD_DISTINTA`. Un pago rechazado es un resultado de negocio y se devuelve en el cuerpo de una respuesta exitosa.

## 1. Usuarios

| Método y ruta | Acceso | Solicitud y respuesta |
| --- | --- | --- |
| `POST /api/usuarios/registro` | Público | Recibe `nombre`, `correo` y `contrasena`. Devuelve el perfil con `201`. Un correo repetido devuelve `409`. |
| `POST /api/usuarios/login` | Público | Recibe `correo` y `contrasena`. Devuelve `200` con `token`, `tipo_token` y `usuario`. |
| `GET /api/usuarios/{id}` | Titular | Devuelve el perfil con `200`. |

El registro público asigna el rol `cliente`. La cuenta `admin` se prepara por separado para la demo. El perfil contiene `id`, `nombre`, `correo` y `rol`. Usuarios guarda la contraseña como hash y omite tanto la contraseña como el hash de sus respuestas.

Registro:

```json
{"nombre":"Ana López","correo":"ana@example.test","contrasena":"DemoTienda-2026"}
```

Respuesta de login:

```json
{
  "token": "<jwt>",
  "tipo_token": "Bearer",
  "usuario": {"id": 1, "nombre": "Ana López", "correo": "ana@example.test", "rol": "cliente"}
}
```

## 2. Productos

| Método y ruta | Acceso | Solicitud y respuesta |
| --- | --- | --- |
| `GET /api/productos` | Público | Devuelve un arreglo de productos con `200`. Angular puede filtrar por nombre y categoría. |
| `GET /api/productos/{id}` | Público | Devuelve un producto con `200` o `404`. |
| `POST /api/productos` | Admin | Recibe `nombre`, `descripcion`, `precio`, `categoria` e `imagen_url`. Devuelve el producto con su ID y `201`. |

Ejemplo de producto:

```json
{
  "id": 12,
  "nombre": "Taza de cerámica",
  "descripcion": "Taza de 350 ml",
  "precio": 199.90,
  "categoria": "Hogar",
  "imagen_url": "https://example.test/taza.jpg"
}
```

Angular consulta Inventario para la disponibilidad y Reseñas para la calificación. Productos administra el catálogo y sus precios.

## 3. Envíos

| Método y ruta | Acceso | Solicitud y respuesta |
| --- | --- | --- |
| `POST /api/envios/cotizar` | Público | Recibe `codigo_postal` y `cantidad`, el total de unidades del carrito. Devuelve `200` con `costo_envio` y `dias_estimados`. |
| `POST /api/envios/generar` | Interno | Recibe `pedido_id`. Devuelve `pedido_id`, `guia` y `estado`, con `201` al crear y `200` con la misma guía si se repite. |
| `GET /api/envios/rastreo/{guia}` | Público | Devuelve `guia` y `estado` con `200` o `404` si no existe. |

La tarifa de prueba es de $80 por la primera unidad más $15 por cada unidad adicional, con tres días estimados. La cantidad mínima es 1. La guía comienza en `preparando`. Los otros estados admitidos para el rastreo son `en_transito` y `entregado`. El rastreo público solo muestra la guía y su estado.

```json
{"codigo_postal":"06000","cantidad":2}
```

```json
{"costo_envio":95.00,"dias_estimados":3}
```

```json
{"pedido_id":25,"guia":"GT-7F3A91BC","estado":"preparando"}
```

## 4. Inventario

| Método y ruta | Acceso | Solicitud y respuesta |
| --- | --- | --- |
| `GET /api/inventario/{producto_id}` | Público | Devuelve `producto_id` y `disponible` con `200`. Devuelve `404` si no existe un registro de inventario. |
| `POST /api/inventario/reabastecer` | Admin | Recibe `producto_id` y `cantidad` positiva. Devuelve `producto_id` y `disponible` con `201` si crea el registro inicial o `200` si lo actualiza. |
| `POST /api/inventario/reservar` | Interno | Recibe `pedido_id` e `items`. Responde con la reserva y `201`, o `200` al repetir la misma solicitud. |
| `POST /api/inventario/reservas/{pedido_id}/confirmar` | Interno | Devuelve la reserva en estado `confirmada` con `200`. Ruta añadida para el checkout. |
| `POST /api/inventario/reservas/{pedido_id}/liberar` | Interno | Devuelve la reserva en estado `liberada` con `200`. Ruta añadida para el checkout. |

```json
{"pedido_id":25,"items":[{"producto_id":12,"cantidad":2}]}
```

```json
{"pedido_id":25,"estado":"reservada","items":[{"producto_id":12,"cantidad":2}]}
```

Inventario calcula `disponible = stock_fisico - unidades_reservadas`. Si hay 10 unidades físicas y se reservan 2, quedan 8 disponibles. Al confirmar, quedan 8 físicas y 8 disponibles. Al liberar en lugar de confirmar, quedan 10 físicas y 10 disponibles.

La reserva cubre todos los productos del pedido o ninguno. Cada cantidad debe ser un entero positivo y cada producto debe aparecer una sola vez. Inventario comprueba y actualiza la disponibilidad dentro de una misma transacción, para que dos compras simultáneas no aparten las mismas unidades. Un producto sin registro cuenta como stock insuficiente al reservar. La clave única es `pedido_id` y la reserva se conserva durante los reintentos.

Se permite pasar de `reservada` a `confirmada` o `liberada`. Repetir una operación ya aplicada devuelve el estado guardado sin volver a modificar el stock. Cambiar de un estado final al otro devuelve `409 ESTADO_INVALIDO`. Usar el mismo pedido con otros productos o cantidades devuelve `409 SOLICITUD_DISTINTA`. Las reservas de la demo se crean al pulsar «Pagar» y se mantienen hasta confirmación o liberación.

## 5. Carrito

| Método y ruta | Acceso | Solicitud y respuesta |
| --- | --- | --- |
| `GET /api/carrito/{usuario_id}` | Titular o interno | Devuelve `usuario_id` e `items` con `200`. Un carrito nuevo o vacío devuelve `items: []`. |
| `POST /api/carrito/{usuario_id}/agregar` | Titular | Recibe `producto_id` y `cantidad` positiva. Devuelve el carrito con `200`. |
| `DELETE /api/carrito/{usuario_id}/vaciar` | Titular o interno | Devuelve el carrito vacío con `200`. Pedidos incluye `Idempotency-Key: pedido-{id}` para que un reintento del mismo pedido no vuelva a vaciar el carrito. |

Agregar otra vez el mismo producto suma la cantidad. Carrito guarda identificadores y cantidades. Angular obtiene del catálogo los nombres y precios e Inventario verifica el stock durante el pago.

```json
{"usuario_id":1,"items":[{"producto_id":12,"cantidad":2}]}
```

## 6. Pedidos

| Método y ruta | Acceso | Solicitud y respuesta |
| --- | --- | --- |
| `POST /api/pedidos` | Cliente autenticado | Recibe `direccion`. Lee el carrito del JWT, consulta precios y cotiza el envío. Guarda productos, cantidades, precios y costo de envío. Devuelve el pedido `pendiente` con `201`. Si el carrito está vacío, devuelve `409`. |
| `POST /api/pedidos/{id}/pagar` | Titular | Recibe `resultado_simulado` y coordina la compra. Devuelve el pedido con `200` al completar el flujo, `202` mientras esté en curso o `409` ante un conflicto de stock o de estado. Ruta añadida para el checkout. |
| `GET /api/pedidos/usuario/{usuario_id}` | Titular | Devuelve un arreglo de pedidos con `200`, incluyendo el estado de pago y la guía de cada pedido. |
| `PATCH /api/pedidos/{id}/estado` | Admin o interno | Recibe `estado` y devuelve el pedido actualizado con `200`. Para la demo, el admin puede marcar como `enviado` un pedido pagado que ya tiene guía. Pedidos controla los cambios derivados del pago. |

La dirección requiere `calle`, `numero`, `colonia`, `ciudad`, `estado` y `codigo_postal`. Todos son cadenas. El envío se limita a México. El importe que se cobra es el total del pedido creado por el servidor. Angular muestra ese total antes de solicitar el pago.

```json
{
  "direccion": {
    "calle":"República de Brasil",
    "numero":"12",
    "colonia":"Centro",
    "ciudad":"Ciudad de México",
    "estado":"Ciudad de México",
    "codigo_postal":"06000"
  }
}
```

Ejemplo de respuesta de un pedido pendiente:

```json
{
  "id":25,
  "usuario_id":1,
  "estado":"pendiente",
  "estado_pago":"sin_pago",
  "items":[{"producto_id":12,"cantidad":2,"precio_unitario":199.90}],
  "direccion":{
    "calle":"República de Brasil",
    "numero":"12",
    "colonia":"Centro",
    "ciudad":"Ciudad de México",
    "estado":"Ciudad de México",
    "codigo_postal":"06000"
  },
  "subtotal":399.80,
  "costo_envio":95.00,
  "total":494.80,
  "guia":null
}
```

`estado` admite `pendiente`, `pagado`, `enviado` y `cancelado`. `estado_pago` admite `sin_pago`, `en_proceso`, `aprobado` y `rechazado`. `guia` es `null` hasta que Envíos la genera. Un `202` puede incluir un pago ya aprobado con acciones pendientes, como obtener la guía.

El flujo interno cambia de `pendiente` a `pagado` con el pago aprobado y la reserva confirmada, o a `cancelado` con el pago rechazado y la reserva liberada. El cambio de `pagado` a `enviado` requiere una guía. Los cambios fuera de estas transiciones devuelven `409 ESTADO_INVALIDO`.

## 7. Pagos

| Método y ruta | Acceso | Solicitud y respuesta |
| --- | --- | --- |
| `POST /api/pagos/procesar` | Interno | Recibe `pedido_id`, `usuario_id`, `monto`, `metodo_pago` y `resultado_simulado`. Guarda el resultado en PostgreSQL y devuelve el registro con `201`, o `200` si repite una solicitud idéntica. |
| `GET /api/pagos/pedido/{pedido_id}` | Titular o interno | Devuelve el registro del pago con `200` o `404` si aún no existe. |

`metodo_pago` es `simulado` y `resultado_simulado` es `aprobado` o `rechazado`. Angular envía únicamente `resultado_simulado` a Pedidos. Pedidos toma el monto y el usuario del pedido guardado. El simulador funciona sin datos de tarjeta.

```json
{"pedido_id":25,"usuario_id":1,"monto":494.80,"metodo_pago":"simulado","resultado_simulado":"aprobado"}
```

```json
{"id":9,"pedido_id":25,"usuario_id":1,"monto":494.80,"metodo_pago":"simulado","estado":"aprobado"}
```

Pagos impone una clave única por `pedido_id`. Los reintentos del mismo pedido devuelven el registro anterior. Cambiar los datos de un pago registrado devuelve `409 SOLICITUD_DISTINTA`. Para repetir una compra tras un rechazo definitivo, el cliente crea un pedido nuevo.

## 8. Reseñas

| Método y ruta | Acceso | Solicitud y respuesta |
| --- | --- | --- |
| `GET /api/resenas/producto/{producto_id}` | Público | Devuelve `producto_id`, `promedio` y `resenas` con `200`. Sin reseñas, devuelve `promedio: null` y `resenas: []`. |
| `POST /api/resenas` | Cliente autenticado | Recibe `producto_id`, `usuario_id`, `calificacion` y `comentario`. El `usuario_id` debe coincidir con el JWT. Devuelve la reseña con `201`. |

La calificación es un entero del 1 al 5 y el comentario es una cadena con texto. La combinación de `producto_id` y `usuario_id` es única. Una segunda reseña para la misma combinación devuelve `409 RESENA_DUPLICADA`.

```json
{
  "producto_id":12,
  "promedio":5.0,
  "resenas":[{"id":"r1","producto_id":12,"usuario_id":1,"calificacion":5,"comentario":"Buena taza"}]
}
```

## Flujo de compra y recuperación

1. Angular inicia sesión, consulta el catálogo, inventario y reseñas, y permite agregar productos al carrito. Para mostrar la cotización llama a Envíos con el código postal y la suma de las cantidades.
2. Angular crea el pedido con la dirección. Pedidos calcula los importes con Productos y Envíos y guarda el pedido `pendiente` antes de presentar el total.
3. Angular llama a `POST /api/pedidos/{id}/pagar` con `{"resultado_simulado":"aprobado"}` o `{"resultado_simulado":"rechazado"}`. Pedidos registra el intento y el resultado de simulación solicitado antes de llamar a otros servicios. En los reintentos se envía el mismo valor. Cambiarlo devuelve `409 SOLICITUD_DISTINTA`.
4. Pedidos reserva los productos del pedido. Si falta stock, devuelve `409 STOCK_INSUFICIENTE`, mantiene el carrito y permite reintentar el mismo pedido cuando haya existencias. Con la reserva creada, pasa el pago a `en_proceso` y llama a Pagos.
5. Si Pagos aprueba, Pedidos confirma la reserva, guarda el estado `pagado`, vacía el carrito y solicita la guía. Pedidos guarda la guía y devuelve el pedido. Angular usa el historial para mostrar el pago y la guía, y puede consultar el comprobante en Pagos y el rastreo en Envíos.
6. Si Pagos rechaza, Pedidos libera la reserva, marca el pedido `cancelado` y devuelve `estado_pago: "rechazado"`. El carrito queda disponible para un pedido nuevo.
7. Si Pagos no responde, Pedidos mantiene la reserva y devuelve `202`. Cuando Angular repite la llamada al mismo pedido, Pedidos consulta el registro en Pagos. Si todavía no existe, vuelve a solicitar **el mismo intento** con el mismo `pedido_id` y los mismos datos. Si el resultado ya existe, reanuda las acciones pendientes. Los reintentos conservan el resultado de pago, la reserva, el vaciado y la guía asociados al pedido.

Angular bloquea nuevas modificaciones del carrito desde la vista de checkout mientras se procesa el pago. Pedidos procesa a la vez un solo intento por pedido y registra qué pasos completó, de modo que una solicitud repetida o un reinicio permita continuar el flujo.

## Verificación de la demo

| Caso | Resultado esperado |
| --- | --- |
| Compra aprobada | Con 10 unidades iniciales y 2 compradas, quedan 8 disponibles y 8 físicas. El pedido figura como `pagado`, aparece una guía, se puede consultar el comprobante y el carrito queda vacío. |
| Compra rechazada | Con 10 unidades iniciales y 2 reservadas, vuelven a quedar 10 disponibles tras el rechazo. El pedido figura como `cancelado`, la guía queda vacía y el carrito conserva sus productos. |
| Stock insuficiente | El pago no se inicia. El carrito conserva sus productos y la API responde con `409 STOCK_INSUFICIENTE`. |
| Reintento al pagar el mismo pedido | Se conserva el mismo registro de pago y, si corresponde, la misma guía. La confirmación de inventario y el vaciado del carrito se aplican una sola vez. |
