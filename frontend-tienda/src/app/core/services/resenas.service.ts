import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MockStoreService } from '../mocks/mock-store.service';
import { CrearResenaRequest, ProductoResenas, Resena } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ResenasService {
  private readonly http = inject(HttpClient);
  private readonly mockStore = inject(MockStoreService);

  getResenasProducto(productoId: number): Observable<ProductoResenas> {
    return this.http
      .get<ProductoResenas>(`${environment.apiUrls.resenas}/api/resenas/producto/${productoId}`)
      .pipe(
        timeout(2000),
        catchError((err: unknown) => {
          if (environment.useMocks && this.isNetworkOrTimeoutError(err)) {
            return this.mockStore.getResenasProducto(productoId);
          }
          return throwError(() => err);
        })
      );
  }

  crearResena(payload: CrearResenaRequest): Observable<Resena> {
    return this.http.post<Resena>(`${environment.apiUrls.resenas}/api/resenas`, payload).pipe(
      timeout(2500),
      catchError((err: unknown) => {
        if (environment.useMocks && this.isNetworkOrTimeoutError(err)) {
          return this.mockStore.crearResena(payload);
        }
        return throwError(() => err);
      })
    );
  }

  private isNetworkOrTimeoutError(err: unknown): boolean {
    if (err instanceof HttpErrorResponse) {
      return err.status === 0;
    }
    return err instanceof Error && err.name === 'TimeoutError';
  }
}
