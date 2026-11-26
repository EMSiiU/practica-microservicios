import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import {
  ApiError,
  Carrito,
  CarritoItem,
  CotizarEnvioRequest,
  CotizarEnvioResponse,
  CrearPedidoRequest,
  CrearResenaRequest,
  EstadoRastreo,
  Inventario,
  LoginRequest,
  LoginResponse,
  Pago,
  Pedido,
  Producto,
  ProductoResenas,
  RastreoEnvio,
  RegistroRequest,
  Resena,
  ResultadoSimulado,
  Usuario,
} from '../models/api.models';

interface MockUserRecord extends Usuario {
  contrasena: string;
}

function buildSvgThumb(label: string, bg: string, accent: string): string {
  const safe = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220">` +
      `<rect width="320" height="220" rx="24" fill="${bg}"/>` +
      `<circle cx="265" cy="52" r="36" fill="${accent}" opacity="0.35"/>` +
      `<circle cx="60" cy="180" r="46" fill="${accent}" opacity="0.22"/>` +
      `<rect x="44" y="54" width="232" height="112" rx="18" fill="#FFFFFF" fill-opacity="0.82" stroke="#232323" stroke-width="2.5"/>` +
      `<text x="160" y="116" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="700" fill="#232323">${label}</text>` +
      `</svg>`
  );
  return `data:image/svg+xml;utf8,${safe}`;
}

@Injectable({ providedIn: 'root' })
export class MockStoreService {
  private nextUserId = 2;
  private nextPedidoId = 25;
  private nextPagoId = 10;
  private nextResenaId = 7;

  private readonly users: MockUserRecord[] = [
    {
      id: 1,
      nombre: 'Ana López',
      correo: 'ana@example.test',
      contrasena: 'DemoTienda-2026',
      rol: 'cliente',
    },
  ];

  private readonly productos: Producto[] = [
    {
      id: 12,
      nombre: 'Taza de cerámica',
      descripcion: 'Taza artesanal de 350 ml con acabado mate y asa ergonómica para bebidas calientes.',
      precio: 199.9,
      categoria: 'Hogar',
      imagen_url: buildSvgThumb('Taza 350 ml', '#FAD45B', '#EE6344'),
    },
    {
      id: 1,
      nombre: 'Audífonos Inalámbricos Studio',
      descripcion: 'Cancelación activa de ruido, 30 horas de batería y carga rápida USB-C.',
      precio: 1899.0,
      categoria: 'Tecnología',
      imagen_url: buildSvgThumb('Audífonos Studio', '#D7BAFF', '#232323'),
    },
    {
      id: 2,
      nombre: 'Teclado Mecánico Compacto',
      descripcion: 'Distribución 75% con switches silenciosos y retroiluminación cálida.',
      precio: 1450.5,
      categoria: 'Tecnología',
      imagen_url: buildSvgThumb('Teclado 75%', '#CBE5FE', '#EE6344'),
    },
    {
      id: 3,
      nombre: 'Mochila Urbana Impermeable',
      descripcion: 'Compartimento acolchado para laptop de 16" y bolsillos ocultos de viaje.',
      precio: 980.0,
      categoria: 'Accesorios',
      imagen_url: buildSvgThumb('Mochila Urbana', '#FAD45B', '#232323'),
    },
    {
      id: 4,
      nombre: 'Lámpara de Escritorio LED',
      descripcion: 'Brazo articulado de aluminio con 3 temperaturas de color y regulador táctil.',
      precio: 649.0,
      categoria: 'Oficina',
      imagen_url: buildSvgThumb('Lámpara LED', '#CBE5FE', '#232323'),
    },
    {
      id: 5,
      nombre: 'Termo Térmico Acero 600 ml',
      descripcion: 'Mantiene bebidas frías por 24 horas o calientes por 12 horas sin condensación.',
      precio: 349.0,
      categoria: 'Hogar',
      imagen_url: buildSvgThumb('Termo 600 ml', '#D7BAFF', '#EE6344'),
    },
    {
      id: 6,
      nombre: 'Organizador Modular de Bambú',
      descripcion: 'Bandeja multifunción para escritorio con soporte para teléfono y notas.',
      precio: 420.0,
      categoria: 'Oficina',
      imagen_url: buildSvgThumb('Organizador Bambú', '#FAD45B', '#EE6344'),
    },
    {
      id: 7,
      nombre: 'Funda Sleeve Minimalista 14"',
      descripcion: 'Interior de microfibra suave y cierre magnético para portátil o tablet.',
      precio: 515.0,
      categoria: 'Accesorios',
      imagen_url: buildSvgThumb('Sleeve 14"', '#CBE5FE', '#232323'),
    },
  ];

  private readonly inventario = new Map<number, number>([
    [12, 10],
    [1, 14],
    [2, 8],
    [3, 6],
    [4, 15],
    [5, 3],
    [6, 12],
    [7, 9],
  ]);

  private readonly resenas: Resena[] = [
    {
      id: 'r1',
      producto_id: 12,
      usuario_id: 2,
      calificacion: 5,
      comentario: 'Buena taza, conserva muy bien el calor del café.',
    },
    {
      id: 'r2',
      producto_id: 1,
      usuario_id: 2,
      calificacion: 5,
      comentario: 'Excelente aislamiento de sonido para trabajar desde casa.',
    },
    {
      id: 'r3',
      producto_id: 1,
      usuario_id: 3,
      calificacion: 4,
      comentario: 'Muy cómodos después de varias horas de uso.',
    },
    {
      id: 'r4',
      producto_id: 2,
      usuario_id: 2,
      calificacion: 5,
      comentario: 'El tacto de las teclas es preciso y silencioso.',
    },
    {
      id: 'r5',
      producto_id: 3,
      usuario_id: 3,
      calificacion: 4,
      comentario: 'Resistió sin problemas la lluvia de la ciudad.',
    },
    {
      id: 'r6',
      producto_id: 4,
      usuario_id: 2,
      calificacion: 5,
      comentario: 'Iluminación uniforme sin reflejos en el monitor.',
    },
  ];

  private readonly carritos = new Map<number, CarritoItem[]>();

  private readonly pedidos: Pedido[] = [
    {
      id: 24,
      usuario_id: 1,
      estado: 'enviado',
      estado_pago: 'aprobado',
      items: [{ producto_id: 12, cantidad: 2, precio_unitario: 199.9 }],
      direccion: {
        calle: 'República de Brasil',
        numero: '12',
        colonia: 'Centro',
        ciudad: 'Ciudad de México',
        estado: 'Ciudad de México',
        codigo_postal: '06000',
      },
      subtotal: 399.8,
      costo_envio: 95.0,
      total: 494.8,
      guia: 'GT-4A91BC20',
    },
  ];

  private readonly pagos = new Map<number, Pago>([
    [
      24,
      {
        id: 8,
        pedido_id: 24,
        usuario_id: 1,
        monto: 494.8,
        metodo_pago: 'simulado',
        estado: 'aprobado',
      },
    ],
  ]);

  private readonly envios = new Map<string, EstadoRastreo>([['GT-4A91BC20', 'en_transito']]);
  private readonly pagoIntentos = new Map<number, ResultadoSimulado>();

  private httpError(status: number, codigo: string, mensaje: string): Observable<never> {
    const body: ApiError = { codigo, mensaje };
    return throwError(() => new HttpErrorResponse({ status, error: body }));
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private makeDemoJwt(user: Usuario): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(
      JSON.stringify({
        sub: String(user.id),
        rol: user.rol,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    return `${header}.${payload}.demo-signature`;
  }

  login(req: LoginRequest): Observable<LoginResponse> {
    const email = req.correo.trim().toLowerCase();
    const user = this.users.find((u) => u.correo.toLowerCase() === email && u.contrasena === req.contrasena);
    if (!user) {
      return this.httpError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.');
    }

    const perfil: Usuario = {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol,
    };

    return new Observable((sub) => {
      sub.next({
        token: this.makeDemoJwt(perfil),
        tipo_token: 'Bearer',
        usuario: perfil,
      });
      sub.complete();
    });
  }

  registro(req: RegistroRequest): Observable<Usuario> {
    const email = req.correo.trim().toLowerCase();
    if (this.users.some((u) => u.correo.toLowerCase() === email)) {
      return this.httpError(409, 'CORREO_DUPLICADO', 'Este correo ya está registrado.');
    }

    const created: MockUserRecord = {
      id: this.nextUserId++,
      nombre: req.nombre.trim(),
      correo: email,
      contrasena: req.contrasena,
      rol: 'cliente',
    };
    this.users.push(created);

    return new Observable((sub) => {
      sub.next({
        id: created.id,
        nombre: created.nombre,
        correo: created.correo,
        rol: created.rol,
      });
      sub.complete();
    });
  }

  getProductos(): Observable<Producto[]> {
    return new Observable((sub) => {
      sub.next([...this.productos]);
      sub.complete();
    });
  }

  getProducto(id: number): Observable<Producto> {
    const found = this.productos.find((p) => p.id === id);
    if (!found) {
      return this.httpError(404, 'NO_ENCONTRADO', 'El producto solicitado no existe.');
    }
    return new Observable((sub) => {
      sub.next({ ...found });
      sub.complete();
    });
  }

  getInventario(productoId: number): Observable<Inventario> {
    const disponible = this.inventario.get(productoId);
    if (disponible === undefined) {
      return this.httpError(404, 'NO_ENCONTRADO', 'No existe registro de inventario para el producto.');
    }
    return new Observable((sub) => {
      sub.next({ producto_id: productoId, disponible });
      sub.complete();
    });
  }

  getResenasProducto(productoId: number): Observable<ProductoResenas> {
    const list = this.resenas.filter((r) => r.producto_id === productoId);
    const promedio =
      list.length === 0
        ? null
        : this.round2(list.reduce((acc, item) => acc + item.calificacion, 0) / list.length);

    return new Observable((sub) => {
      sub.next({
        producto_id: productoId,
        promedio,
        resenas: list.map((r) => ({ ...r })),
      });
      sub.complete();
    });
  }

  crearResena(req: CrearResenaRequest): Observable<Resena> {
    const duplicate = this.resenas.some(
      (r) => r.producto_id === req.producto_id && r.usuario_id === req.usuario_id
    );
    if (duplicate) {
      return this.httpError(409, 'RESENA_DUPLICADA', 'Ya registraste una reseña para este producto.');
    }

    const creada: Resena = {
      id: `r${this.nextResenaId++}`,
      producto_id: req.producto_id,
      usuario_id: req.usuario_id,
      calificacion: req.calificacion,
      comentario: req.comentario.trim(),
    };
    this.resenas.push(creada);

    return new Observable((sub) => {
      sub.next({ ...creada });
      sub.complete();
    });
  }

  getCarrito(usuarioId: number): Observable<Carrito> {
    const items = (this.carritos.get(usuarioId) ?? []).map((i) => ({ ...i }));
    return new Observable((sub) => {
      sub.next({ usuario_id: usuarioId, items });
      sub.complete();
    });
  }

  agregarAlCarrito(usuarioId: number, productoId: number, cantidad: number): Observable<Carrito> {
    if (cantidad <= 0) {
      return this.httpError(400, 'DATOS_INVALIDOS', 'La cantidad debe ser un entero positivo.');
    }
    const items = (this.carritos.get(usuarioId) ?? []).map((i) => ({ ...i }));
    const existing = items.find((i) => i.producto_id === productoId);
    if (existing) {
      existing.cantidad += cantidad;
    } else {
      items.push({ producto_id: productoId, cantidad });
    }
    this.carritos.set(usuarioId, items);

    return new Observable((sub) => {
      sub.next({ usuario_id: usuarioId, items: items.map((i) => ({ ...i })) });
      sub.complete();
    });
  }

  vaciarCarrito(usuarioId: number): Observable<Carrito> {
    this.carritos.set(usuarioId, []);
    return new Observable((sub) => {
      sub.next({ usuario_id: usuarioId, items: [] });
      sub.complete();
    });
  }

  cotizarEnvio(req: CotizarEnvioRequest): Observable<CotizarEnvioResponse> {
    if (!/^\d{5}$/.test(req.codigo_postal)) {
      return this.httpError(400, 'DATOS_INVALIDOS', 'El código postal debe tener 5 dígitos.');
    }
    if (req.cantidad < 1) {
      return this.httpError(400, 'DATOS_INVALIDOS', 'La cantidad mínima para cotizar es 1.');
    }
    const costoEnvio = this.round2(80 + 15 * (req.cantidad - 1));
    return new Observable((sub) => {
      sub.next({ costo_envio: costoEnvio, dias_estimados: 3 });
      sub.complete();
    });
  }

  crearPedido(usuarioId: number, req: CrearPedidoRequest): Observable<Pedido> {
    const cartItems = this.carritos.get(usuarioId) ?? [];
    if (cartItems.length === 0) {
      return this.httpError(409, 'CARRITO_VACIO', 'Tu carrito está vacío. Agrega productos antes de crear un pedido.');
    }

    const pedidoItems = cartItems.map((item) => {
      const producto = this.productos.find((p) => p.id === item.producto_id);
      return {
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio_unitario: producto ? producto.precio : 0,
      };
    });

    const totalUnidades = pedidoItems.reduce((sum, item) => sum + item.cantidad, 0);
    const subtotal = this.round2(
      pedidoItems.reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0)
    );
    const costoEnvio = this.round2(80 + 15 * (totalUnidades - 1));
    const total = this.round2(subtotal + costoEnvio);

    const pedido: Pedido = {
      id: this.nextPedidoId++,
      usuario_id: usuarioId,
      estado: 'pendiente',
      estado_pago: 'sin_pago',
      items: pedidoItems,
      direccion: { ...req.direccion },
      subtotal,
      costo_envio: costoEnvio,
      total,
      guia: null,
    };
    this.pedidos.unshift(pedido);

    return new Observable((sub) => {
      sub.next({ ...pedido, items: pedido.items.map((i) => ({ ...i })), direccion: { ...pedido.direccion } });
      sub.complete();
    });
  }

  pagarPedido(
    pedidoId: number,
    resultadoSimulado: ResultadoSimulado,
    simularRespuesta202 = false
  ): Observable<{ status: 200 | 202; body: Pedido }> {
    const pedido = this.pedidos.find((p) => p.id === pedidoId);
    if (!pedido) {
      return this.httpError(404, 'NO_ENCONTRADO', 'El pedido solicitado no existe.');
    }

    const intentoPrevio = this.pagoIntentos.get(pedidoId);
    if (intentoPrevio && intentoPrevio !== resultadoSimulado) {
      return this.httpError(
        409,
        'SOLICITUD_DISTINTA',
        'No puedes cambiar el resultado simulado al reintentar el mismo pedido.'
      );
    }

    if (pedido.estado !== 'pendiente') {
      if (
        (pedido.estado === 'pagado' && resultadoSimulado === 'aprobado') ||
        (pedido.estado === 'cancelado' && resultadoSimulado === 'rechazado')
      ) {
        return new Observable((sub) => {
          sub.next({ status: 200, body: { ...pedido } });
          sub.complete();
        });
      }
      return this.httpError(409, 'ESTADO_INVALIDO', 'El pedido ya tiene un estado final y no admite otro pago.');
    }

    this.pagoIntentos.set(pedidoId, resultadoSimulado);

    if (simularRespuesta202) {
      pedido.estado_pago = 'en_proceso';
      return new Observable((sub) => {
        sub.next({ status: 202, body: { ...pedido } });
        sub.complete();
      });
    }

    for (const item of pedido.items) {
      const disponible = this.inventario.get(item.producto_id) ?? 0;
      if (disponible < item.cantidad) {
        return this.httpError(
          409,
          'STOCK_INSUFICIENTE',
          'No hay unidades suficientes para completar el pedido.'
        );
      }
    }

    if (resultadoSimulado === 'aprobado') {
      for (const item of pedido.items) {
        const current = this.inventario.get(item.producto_id) ?? 0;
        this.inventario.set(item.producto_id, current - item.cantidad);
      }
      this.carritos.set(pedido.usuario_id, []);

      const guia = `GT-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
      this.envios.set(guia, 'preparando');
      pedido.estado = 'pagado';
      pedido.estado_pago = 'aprobado';
      pedido.guia = guia;

      this.pagos.set(pedido.id, {
        id: this.nextPagoId++,
        pedido_id: pedido.id,
        usuario_id: pedido.usuario_id,
        monto: pedido.total,
        metodo_pago: 'simulado',
        estado: 'aprobado',
      });
    } else {
      pedido.estado = 'cancelado';
      pedido.estado_pago = 'rechazado';
      pedido.guia = null;

      this.pagos.set(pedido.id, {
        id: this.nextPagoId++,
        pedido_id: pedido.id,
        usuario_id: pedido.usuario_id,
        monto: pedido.total,
        metodo_pago: 'simulado',
        estado: 'rechazado',
      });
    }

    return new Observable((sub) => {
      sub.next({ status: 200, body: { ...pedido } });
      sub.complete();
    });
  }

  getPedidosUsuario(usuarioId: number): Observable<Pedido[]> {
    const list = this.pedidos
      .filter((p) => p.usuario_id === usuarioId)
      .map((p) => ({
        ...p,
        items: p.items.map((i) => ({ ...i })),
        direccion: { ...p.direccion },
      }));
    return new Observable((sub) => {
      sub.next(list);
      sub.complete();
    });
  }

  getPagoPedido(pedidoId: number): Observable<Pago> {
    const pago = this.pagos.get(pedidoId);
    if (!pago) {
      return this.httpError(404, 'NO_ENCONTRADO', 'Aún no existe un registro de pago para este pedido.');
    }
    return new Observable((sub) => {
      sub.next({ ...pago });
      sub.complete();
    });
  }

  getRastreo(guia: string): Observable<RastreoEnvio> {
    const estado = this.envios.get(guia);
    if (!estado) {
      return this.httpError(404, 'NO_ENCONTRADO', 'No se encontró la guía de rastreo.');
    }
    return new Observable((sub) => {
      sub.next({ guia, estado });
      sub.complete();
    });
  }
}
