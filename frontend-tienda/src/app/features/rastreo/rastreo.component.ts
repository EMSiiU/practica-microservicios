import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Pedido, RastreoEnvio } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { EnviosService } from '../../core/services/envios.service';
import { PedidosService } from '../../core/services/pedidos.service';
import { ToastService } from '../../core/services/toast.service';
import { TrackingRoadComponent } from '../../shared/components/tracking-road/tracking-road.component';

@Component({
  selector: 'app-rastreo',
  standalone: true,
  imports: [FormsModule, TrackingRoadComponent],
  templateUrl: './rastreo.component.html',
  styleUrl: './rastreo.component.css',
})
export class RastreoComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly enviosService = inject(EnviosService);
  private readonly pedidosService = inject(PedidosService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  guiaInput = '';
  readonly loading = signal(false);
  readonly resultado = signal<RastreoEnvio | null>(null);
  readonly errorMsg = signal<string | null>(null);
  readonly misGuias = signal<Array<{ pedidoId: number; guia: string; estado: string }>>([]);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.cargarMisGuias(user.id);
      } else {
        this.misGuias.set([]);
      }
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const q = params.get('guia');
      if (q && q.trim()) {
        this.guiaInput = q.trim();
        this.buscarGuia();
      }
    });

    const uid = this.auth.user()?.id;
    if (uid) {
      this.cargarMisGuias(uid);
    }
  }

  private cargarMisGuias(usuarioId: number): void {
    this.pedidosService.getPedidosUsuario(usuarioId).subscribe({
      next: (pedidos: Pedido[]) => {
        const conGuia = pedidos
          .filter((p) => Boolean(p.guia))
          .map((p) => ({ pedidoId: p.id, guia: p.guia as string, estado: p.estado }));
        this.misGuias.set(conGuia);
      },
      error: () => {},
    });
  }

  buscarGuia(guiaDirecta?: string): void {
    const guia = (guiaDirecta ?? this.guiaInput).trim();
    if (!guia) {
      this.errorMsg.set('Ingresa un número de guía válido (por ejemplo GT-...).');
      return;
    }

    this.guiaInput = guia;
    this.loading.set(true);
    this.errorMsg.set(null);

    this.enviosService.rastrear(guia).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.resultado.set(res);
      },
      error: (err) => {
        this.loading.set(false);
        this.resultado.set(null);
        const apiErr = this.toast.extractApiError(err);
        this.errorMsg.set(apiErr?.mensaje ?? 'No se encontró ninguna guía con ese código.');
      },
    });
  }
}
