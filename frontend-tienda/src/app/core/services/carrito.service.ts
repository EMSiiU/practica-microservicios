import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MockStoreService } from '../mocks/mock-store.service';
import { AgregarCarritoRequest, Carrito, CarritoItem } from '../models/api.models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CarritoService {
  private readonly http = inject(HttpClient);
  private readonly mockStore = inject(MockStoreService);
  private readonly auth = inject(AuthService);

  private readonly _items = signal<CarritoItem[]>([]);
  readonly items = this._items.asReadonly();
  readonly cartLocked = signal(false);

  readonly cartCount = computed(() =>
    this._items().reduce((total, item) => total + item.cantidad, 0)
  );

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.loadCarrito(user.id).subscribe({ error: () => {} });
      } else {
        this._items.set([]);
        this.cartLocked.set(false);
      }
    });
  }

  setLocked(locked: boolean): void {
    this.cartLocked.set(locked);
  }

  loadCarrito(usuarioId?: number): Observable<Carrito> {
    const uid = usuarioId ?? this.auth.user()?.id;
    if (!uid) {
      this._items.set([]);
      return new Observable((sub) => {
        sub.next({ usuario_id: 0, items: [] });
        sub.complete();
      });
    }

    const req$ = environment.useMocks
      ? this.mockStore.getCarrito(uid)
      : this.http.get<Carrito>(`${environment.apiUrls.carrito}/api/carrito/${uid}`);

    return req$.pipe(tap((carrito) => this._items.set(carrito.items)));
  }

  agregarProducto(productoId: number, cantidad = 1): Observable<Carrito> {
    if (this.cartLocked()) {
      return throwError(() => ({
        codigo: 'ESTADO_INVALIDO',
        mensaje: 'El carrito está bloqueado mientras se procesa el pago actual.',
      }));
    }

    const uid = this.auth.user()?.id;
    if (!uid) {
      this.auth.openModal('login');
      return throwError(() => ({
        codigo: 'NO_AUTENTICADO',
        mensaje: 'Inicia sesión para agregar productos a tu carrito.',
      }));
    }

    const body: AgregarCarritoRequest = { producto_id: productoId, cantidad };
    const req$ = environment.useMocks
      ? this.mockStore.agregarAlCarrito(uid, productoId, cantidad)
      : this.http.post<Carrito>(`${environment.apiUrls.carrito}/api/carrito/${uid}/agregar`, body);

    return req$.pipe(tap((carrito) => this._items.set(carrito.items)));
  }

  vaciarCarrito(): Observable<Carrito> {
    if (this.cartLocked()) {
      return throwError(() => ({
        codigo: 'ESTADO_INVALIDO',
        mensaje: 'No puedes vaciar el carrito mientras hay un pago en proceso.',
      }));
    }

    const uid = this.auth.user()?.id;
    if (!uid) {
      return throwError(() => ({
        codigo: 'NO_AUTENTICADO',
        mensaje: 'Inicia sesión para administrar tu carrito.',
      }));
    }

    const req$ = environment.useMocks
      ? this.mockStore.vaciarCarrito(uid)
      : this.http.delete<Carrito>(`${environment.apiUrls.carrito}/api/carrito/${uid}/vaciar`);

    return req$.pipe(tap((carrito) => this._items.set(carrito.items)));
  }

  clearLocalState(): void {
    this._items.set([]);
  }
}
