import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { EstadoRastreo, Pago, Pedido, Producto, RastreoEnvio } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { EnviosService } from '../../core/services/envios.service';
import { PagosService } from '../../core/services/pagos.service';
import { PedidosService } from '../../core/services/pedidos.service';
import { ProductosService } from '../../core/services/productos.service';
import { ToastService } from '../../core/services/toast.service';
import { TrackingRoadComponent } from '../../shared/components/tracking-road/tracking-road.component';
import { MxnPipe } from '../../shared/pipes/mxn.pipe';

@Component({
  selector: 'app-mis-pedidos',
  standalone: true,
  imports: [RouterLink, MxnPipe, TrackingRoadComponent],
  templateUrl: './mis-pedidos.component.html',
  styleUrl: './mis-pedidos.component.css',
})
export class MisPedidosComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly pedidosService = inject(PedidosService);
  private readonly productosService = inject(ProductosService);
  private readonly pagosService = inject(PagosService);
  private readonly enviosService = inject(EnviosService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly pedidos = signal<Pedido[]>([]);
  readonly productosMap = signal<Map<number, Producto>>(new Map());
  readonly enviosEstadoMap = signal<Map<string, EstadoRastreo>>(new Map());

  readonly comprobanteModal = signal<Pago | null>(null);
  readonly rastreoModal = signal<RastreoEnvio | null>(null);
  readonly copiedGuia = signal<string | null>(null);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.cargarPedidos(user.id);
      } else {
        this.pedidos.set([]);
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

    const uid = this.auth.user()?.id;
    if (uid) {
      this.cargarPedidos(uid);
    }
  }

  productoDeItem(productoId: number): Producto | undefined {
    return this.productosMap().get(productoId);
  }

  cargarPedidos(usuarioId?: number): void {
    const uid = usuarioId ?? this.auth.user()?.id;
    if (!uid) return;

    this.loading.set(true);
    this.pedidosService.getPedidosUsuario(uid).subscribe({
      next: (list) => {
        this.pedidos.set(list);
        this.loading.set(false);

        const guias = list.map((p) => p.guia).filter((g): g is string => Boolean(g));
        if (guias.length > 0) {
          forkJoin(
            guias.map((g) => this.enviosService.rastrear(g).pipe(catchError(() => of(null))))
          ).subscribe({
            next: (results) => {
              const map = new Map<string, EstadoRastreo>();
              for (const r of results) {
                if (r) map.set(r.guia, r.estado);
              }
              this.enviosEstadoMap.set(map);
            },
          });
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.showApiError(err, 'No se pudo obtener tu historial de pedidos.');
      },
    });
  }

  estadoEnvio(guia: string | null): EstadoRastreo | null {
    if (!guia) return null;
    return this.enviosEstadoMap().get(guia) ?? null;
  }

  verComprobante(pedido: Pedido): void {
    this.pagosService.getPagoPedido(pedido.id).subscribe({
      next: (pago) => this.comprobanteModal.set(pago),
      error: (err) => this.toast.showApiError(err, 'No hay comprobante de pago disponible aún.'),
    });
  }

  verRastreo(guia: string): void {
    this.enviosService.rastrear(guia).subscribe({
      next: (rastreo) => this.rastreoModal.set(rastreo),
      error: (err) => this.toast.showApiError(err, 'No se pudo consultar el rastreo del envío.'),
    });
  }

  continuarPago(pedido: Pedido): void {
    this.pedidosService.setPedidoActivo(pedido);
    this.router.navigate(['/checkout', pedido.id]);
  }

  totalArticulos(pedido: Pedido): number {
    return pedido.items.reduce((sum, i) => sum + i.cantidad, 0);
  }

  copiarGuia(guia: string): void {
    navigator.clipboard?.writeText(guia).then(() => {
      this.copiedGuia.set(guia);
      setTimeout(() => {
        if (this.copiedGuia() === guia) this.copiedGuia.set(null);
      }, 1800);
    });
  }
}
