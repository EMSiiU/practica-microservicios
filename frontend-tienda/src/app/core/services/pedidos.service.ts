import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MockStoreService } from '../mocks/mock-store.service';
import {
  CrearPedidoRequest,
  PagarPedidoRequest,
  Pedido,
  ResultadoSimulado,
} from '../models/api.models';
import { AuthService } from './auth.service';

export interface PagarPedidoResponse {
  status: 200 | 202;
  body: Pedido;
}

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private readonly http = inject(HttpClient);
  private readonly mockStore = inject(MockStoreService);
  private readonly auth = inject(AuthService);

  crearPedido(payload: CrearPedidoRequest): Observable<Pedido> {
    const uid = this.auth.user()?.id;
    if (!uid) {
      return throwError(() => ({
        codigo: 'NO_AUTENTICADO',
        mensaje: 'Debes iniciar sesión para crear un pedido.',
      }));
    }

    if (environment.useMocks) {
      return this.mockStore.crearPedido(uid, payload);
    }
    return this.http.post<Pedido>(`${environment.apiUrls.pedidos}/api/pedidos`, payload);
  }

  pagarPedido(
    pedidoId: number,
    resultadoSimulado: ResultadoSimulado,
    simularRespuesta202 = false
  ): Observable<PagarPedidoResponse> {
    if (environment.useMocks) {
      return this.mockStore.pagarPedido(pedidoId, resultadoSimulado, simularRespuesta202);
    }

    const body: PagarPedidoRequest = { resultado_simulado: resultadoSimulado };
    return this.http
      .post<Pedido>(`${environment.apiUrls.pedidos}/api/pedidos/${pedidoId}/pagar`, body, {
        observe: 'response',
      })
      .pipe(
        map((resp) => ({
          status: resp.status === 202 ? (202 as const) : (200 as const),
          body: resp.body as Pedido,
        }))
      );
  }

  getPedidosUsuario(usuarioId: number): Observable<Pedido[]> {
    if (environment.useMocks) {
      return this.mockStore.getPedidosUsuario(usuarioId);
    }
    return this.http.get<Pedido[]>(
      `${environment.apiUrls.pedidos}/api/pedidos/usuario/${usuarioId}`
    );
  }
}
