import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MockStoreService } from '../mocks/mock-store.service';
import { Inventario, ReabastecerRequest } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private readonly http = inject(HttpClient);
  private readonly mockStore = inject(MockStoreService);

  getInventario(productoId: number): Observable<Inventario> {
    if (environment.useMocks) {
      return this.mockStore.getInventario(productoId);
    }
    return this.http.get<Inventario>(`${environment.apiUrls.inventario}/api/inventario/${productoId}`);
  }

  reabastecer(payload: ReabastecerRequest): Observable<Inventario> {
    return this.http.post<Inventario>(
      `${environment.apiUrls.inventario}/api/inventario/reabastecer`,
      payload
    );
  }
}
