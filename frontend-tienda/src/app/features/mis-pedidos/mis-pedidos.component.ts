import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Pago, Pedido, RastreoEnvio } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { EnviosService } from '../../core/services/envios.service';
import { PagosService } from '../../core/services/pagos.service';
import { PedidosService } from '../../core/services/pedidos.service';
import { ToastService } from '../../core/services/toast.service';
import { MxnPipe } from '../../shared/pipes/mxn.pipe';

@Component({
  selector: 'app-mis-pedidos',
  standalone: true,
  imports: [RouterLink, MxnPipe],
  templateUrl: './mis-pedidos.component.html',
  styleUrl: './mis-pedidos.component.css',
})
export class MisPedidosComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly pedidosService = inject(PedidosService);
  private readonly pagosService = inject(PagosService);
  private readonly enviosService = inject(EnviosService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly pedidos = signal<Pedido[]>([]);

  readonly comprobanteModal = signal<Pago | null>(null);
  readonly rastreoModal = signal<RastreoEnvio | null>(null);

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
    const uid = this.auth.user()?.id;
    if (uid) {
      this.cargarPedidos(uid);
    }
  }

  cargarPedidos(usuarioId?: number): void {
    const uid = usuarioId ?? this.auth.user()?.id;
    if (!uid) return;

    this.loading.set(true);
    this.pedidosService.getPedidosUsuario(uid).subscribe({
      next: (list) => {
        this.pedidos.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.showApiError(err, 'No se pudo obtener tu historial de pedidos.');
      },
    });
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

  totalArticulos(pedido: Pedido): number {
    return pedido.items.reduce((sum, i) => sum + i.cantidad, 0);
  }

  pasoRastreo(estado: RastreoEnvio['estado']): number {
    if (estado === 'preparando') return 1;
    if (estado === 'en_transito') return 2;
    return 3;
  }
}
