import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MockStoreService } from '../mocks/mock-store.service';
import { LoginRequest, LoginResponse, RegistroRequest, Usuario } from '../models/api.models';

const TOKEN_STORAGE_KEY = 'tutienda_jwt_token';
const USER_STORAGE_KEY = 'tutienda_usuario';

export type AuthTab = 'login' | 'registro';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly mockStore = inject(MockStoreService);

  private readonly _token = signal<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY));
  private readonly _user = signal<Usuario | null>(this.readStoredUser());

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this._token() && this._user()));

  readonly modalOpen = signal(false);
  readonly modalTab = signal<AuthTab>('login');

  private readStoredUser(): Usuario | null {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as Usuario;
    } catch {
      return null;
    }
  }

  openModal(tab: AuthTab = 'login'): void {
    this.modalTab.set(tab);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  login(payload: LoginRequest): Observable<LoginResponse> {
    const req$ = environment.useMocks
      ? this.mockStore.login(payload)
      : this.http.post<LoginResponse>(`${environment.apiUrls.usuarios}/api/usuarios/login`, payload);

    return req$.pipe(
      tap((res) => {
        localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.usuario));
        this._token.set(res.token);
        this._user.set(res.usuario);
        this.closeModal();
      })
    );
  }

  registro(payload: RegistroRequest): Observable<Usuario> {
    if (environment.useMocks) {
      return this.mockStore.registro(payload);
    }
    return this.http.post<Usuario>(`${environment.apiUrls.usuarios}/api/usuarios/registro`, payload);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    this._token.set(null);
    this._user.set(null);
  }
}
