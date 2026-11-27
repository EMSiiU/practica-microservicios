import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Pedido, Producto, ResultadoSimulado } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { CarritoService } from '../../core/services/carrito.service';
import { PedidosService } from '../../core/services/pedidos.service';
import { ProductosService } from '../../core/services/productos.service';
import { ToastService } from '../../core/services/toast.service';
import { MxnPipe } from '../../shared/pipes/mxn.pipe';

interface ResumenProductoVM {
  producto_id: number;
  nombre: string;
  categoria: string;
  imagen_url: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

@Component({
  selector: 'app-checkout-pago',
  standalone: true,
  imports: [RouterLink, FormsModule, MxnPipe],
  templateUrl: './checkout-pago.component.html',
  styleUrl: './checkout-pago.component.css',
})
export class CheckoutPagoComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pedidosService = inject(PedidosService);
  private readonly productosService = inject(ProductosService);
  private readonly carritoService = inject(CarritoService);
  private readonly toast = inject(ToastService);

  readonly useMocks = environment.useMocks;
  readonly loading = signal(true);
  readonly pedido = signal<Pedido | null>(null);
  readonly productosMap = signal<Map<number, Producto>>(new Map());

  resultadoSimulado: ResultadoSimulado = 'aprobado';
  simular202Mock = false;
  readonly paying = signal(false);
  readonly pending202 = signal(false);

  private requestedOrderId: number | null = null;

  readonly productosResumen = computed<ResumenProductoVM[]>(() => {
    const ord = this.pedido();
    if (!ord) return [];
    const prodMap = this.productosMap();

    return ord.items.map((item) => {
      const prod = prodMap.get(item.producto_id);
      return {
        producto_id: item.producto_id,
        nombre: prod?.nombre ?? `Producto #${item.producto_id}`,
        categoria: prod?.categoria ?? 'Catálogo',
        imagen_url: prod?.imagen_url ?? '',
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: Math.round(item.cantidad * item.precio_unitario * 100) / 100,
      };
    });
  });

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.cargarPedido(user.id);
      } else {
        this.pedido.set(null);
        this.loading.set(false);
      }
    });
  }

  ngOnInit(): void {
    this.productosService.getProductos().subscribe({
      next: (list) => {
        const map = new Map<number, Producto>();
        for (const prod of list) {
          map.set(prod.id, prod);
        }
        this.productosMap.set(map);
      },
      error: () => {},
    });

    this.route.paramMap.subscribe((params) => {
      const rawId = params.get('id');
      this.requestedOrderId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;
      const uid = this.auth.user()?.id;
      if (uid) {
        this.cargarPedido(uid);
      } else {
        this.loading.set(false);
      }
    });
  }

  private cargarPedido(usuarioId: number): void {
    const active = this.pedidosService.pedidoActivo();
    if (
      active &&
      active.usuario_id === usuarioId &&
      (this.requestedOrderId === null || active.id === this.requestedOrderId)
    ) {
      this.pedido.set(active);
      this.pending202.set(active.estado_pago === 'en_proceso');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.pedidosService.getPedidosUsuario(usuarioId).subscribe({
      next: (list) => {
        let found: Pedido | null = null;
        if (this.requestedOrderId !== null) {
          found = list.find((p) => p.id === this.requestedOrderId) ?? null;
        } else {
          found = list.find((p) => p.estado === 'pendiente') ?? list[0] ?? null;
        }
        this.pedido.set(found);
        if (found) {
          this.pedidosService.setPedidoActivo(found);
          this.pending202.set(found.estado_pago === 'en_proceso');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.showApiError(err, 'No se pudo cargar el detalle del pedido.');
      },
    });
  }

  pagarPedido(): void {
    const ord = this.pedido();
    if (!ord) return;

    this.paying.set(true);
    this.carritoService.setLocked(true);

    const force202 = this.useMocks && this.simular202Mock && !this.pending202();

    this.pedidosService.pagarPedido(ord.id, this.resultadoSimulado, force202).subscribe({
      next: ({ status, body }) => {
        this.paying.set(false);
        this.pedido.set(body);
        this.pedidosService.setPedidoActivo(body);

        if (status === 202) {
          this.pending202.set(true);
          this.simular202Mock = false;
          this.carritoService.setLocked(true);
          this.toast.warning(
            'Pago pendiente (HTTP 202)',
            'El checkout sigue en curso. Reintenta el mismo pedido para completar.'
          );
          return;
        }

        this.pending202.set(false);
        this.carritoService.setLocked(false);

        if (body.estado_pago === 'aprobado') {
          this.carritoService.loadCarrito().subscribe({ error: () => {} });
          this.toast.success(
            'Pago aprobado',
            `Orden #${body.id} pagada. Guía generada: ${body.guia ?? 'pendiente'}.`
          );
        } else {
          this.toast.warning(
            'Pago rechazado',
            `Orden #${body.id} cancelada. Tu carrito conserva sus productos.`
          );
        }
      },
      error: (err) => {
        this.paying.set(false);
        if (!this.pending202()) {
          this.carritoService.setLocked(false);
        }
        this.toast.showApiError(err);
      },
    });
  }

  irRastrear(guia: string): void {
    this.router.navigate(['/rastreo'], { queryParams: { guia } });
  }
}
