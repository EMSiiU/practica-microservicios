import { Component, OnInit, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

interface ServicioHealth {
  nombre: string;
  puerto: number;
  url: string;
  estado: 'checking' | 'ok' | 'error';
  latenciaMs: number | null;
}

@Component({
  selector: 'app-salud-sistema',
  standalone: true,
  templateUrl: './salud-sistema.component.html',
  styleUrl: './salud-sistema.component.css',
})
export class SaludSistemaComponent implements OnInit {
  readonly servicios = signal<ServicioHealth[]>([
    { nombre: 'api-usuarios', puerto: 8001, url: environment.apiUrls.usuarios, estado: 'checking', latenciaMs: null },
    { nombre: 'api-productos', puerto: 8002, url: environment.apiUrls.productos, estado: 'checking', latenciaMs: null },
    { nombre: 'api-envios', puerto: 8003, url: environment.apiUrls.envios, estado: 'checking', latenciaMs: null },
    { nombre: 'api-inventario', puerto: 8004, url: environment.apiUrls.inventario, estado: 'checking', latenciaMs: null },
    { nombre: 'api-carrito', puerto: 8005, url: environment.apiUrls.carrito, estado: 'checking', latenciaMs: null },
    { nombre: 'api-pedidos', puerto: 8006, url: environment.apiUrls.pedidos, estado: 'checking', latenciaMs: null },
    { nombre: 'api-pagos', puerto: 8007, url: environment.apiUrls.pagos, estado: 'checking', latenciaMs: null },
    { nombre: 'api-resenas', puerto: 8008, url: environment.apiUrls.resenas, estado: 'checking', latenciaMs: null },
  ]);

  readonly onlineCount = computed(
    () => this.servicios().filter((s) => s.estado === 'ok').length
  );

  readonly avgLatency = computed(() => {
    const times = this.servicios()
      .map((s) => s.latenciaMs)
      .filter((ms): ms is number => ms !== null);
    if (times.length === 0) return null;
    return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  });

  ngOnInit(): void {
    this.comprobarSalud();
  }

  comprobarSalud(): void {
    const current = this.servicios().map((s) => ({
      ...s,
      estado: 'checking' as const,
      latenciaMs: null,
    }));
    this.servicios.set(current);

    current.forEach((srv, idx) => {
      void this.pingServicio(srv.url, idx);
    });
  }

  private async pingServicio(baseUrl: string, idx: number): Promise<void> {
    const url = `${baseUrl}/health`;
    const start = performance.now();

    const tryFetch = async (mode: RequestMode): Promise<boolean> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const resp = await fetch(url, {
          method: 'GET',
          mode,
          cache: 'no-store',
          signal: controller.signal,
        });
        return mode === 'no-cors' || resp.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    };

    const okCors = await tryFetch('cors');
    const isUp = okCors || (await tryFetch('no-cors'));
    const elapsed = Math.round(performance.now() - start);

    this.servicios.update((list) =>
      list.map((item, i) =>
        i === idx
          ? { ...item, estado: isUp ? 'ok' : 'error', latenciaMs: isUp ? elapsed : null }
          : item
      )
    );
  }
}
