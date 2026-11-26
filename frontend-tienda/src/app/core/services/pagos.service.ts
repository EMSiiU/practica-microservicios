import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MockStoreService } from '../mocks/mock-store.service';
import { Pago } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class PagosService {
  private readonly http = inject(HttpClient);
  private readonly mockStore = inject(MockStoreService);

  getPagoPedido(pedidoId: number): Observable<Pago> {
    if (environment.useMocks) {
      return this.mockStore.getPagoPedido(pedidoId);
    }
    return this.http.get<Pago>(`${environment.apiUrls.pagos}/api/pagos/pedido/${pedidoId}`);
  }
}
