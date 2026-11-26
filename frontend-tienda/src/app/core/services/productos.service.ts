import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MockStoreService } from '../mocks/mock-store.service';
import { Producto } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ProductosService {
  private readonly http = inject(HttpClient);
  private readonly mockStore = inject(MockStoreService);

  getProductos(): Observable<Producto[]> {
    if (environment.useMocks) {
      return this.mockStore.getProductos();
    }
    return this.http.get<Producto[]>(`${environment.apiUrls.productos}/api/productos`);
  }

  getProducto(id: number): Observable<Producto> {
    if (environment.useMocks) {
      return this.mockStore.getProducto(id);
    }
    return this.http.get<Producto>(`${environment.apiUrls.productos}/api/productos/${id}`);
  }
}
