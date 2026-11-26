import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService, AuthTab } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './auth-modal.component.html',
  styleUrl: './auth-modal.component.css',
})
export class AuthModalComponent {
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly useMocks = environment.useMocks;
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly errorCode = signal<string | null>(null);

  loginCorreo = '';
  loginContrasena = '';

  regNombre = '';
  regCorreo = '';
  regContrasena = '';

  setTab(tab: AuthTab): void {
    this.errorMessage.set(null);
    this.errorCode.set(null);
    this.auth.modalTab.set(tab);
  }

  usarCuentaDemo(): void {
    this.loginCorreo = 'ana@example.test';
    this.loginContrasena = 'DemoTienda-2026';
  }

  submitLogin(): void {
    if (!this.loginCorreo.trim() || !this.loginContrasena) {
      this.errorMessage.set('Ingresa tu correo y contraseña.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.errorCode.set(null);

    this.auth.login({ correo: this.loginCorreo.trim(), contrasena: this.loginContrasena }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.toast.success('¡Bienvenido!', `Sesión iniciada como ${res.usuario.nombre}.`);
      },
      error: (err) => {
        this.loading.set(false);
        const apiErr = this.toast.extractApiError(err);
        this.errorCode.set(apiErr?.codigo ?? null);
        this.errorMessage.set(apiErr?.mensaje ?? 'No fue posible iniciar sesión.');
        this.toast.showApiError(err);
      },
    });
  }

  submitRegistro(): void {
    if (!this.regNombre.trim() || !this.regCorreo.trim() || this.regContrasena.length < 6) {
      this.errorMessage.set('Completa nombre, correo válido y contraseña (mínimo 6 caracteres).');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.errorCode.set(null);

    const correo = this.regCorreo.trim();
    const contrasena = this.regContrasena;

    this.auth
      .registro({ nombre: this.regNombre.trim(), correo, contrasena })
      .pipe(switchMap(() => this.auth.login({ correo, contrasena })))
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.toast.success('Cuenta creada', `Bienvenido a TuTienda, ${res.usuario.nombre}.`);
        },
        error: (err) => {
          this.loading.set(false);
          const apiErr = this.toast.extractApiError(err);
          this.errorCode.set(apiErr?.codigo ?? null);
          this.errorMessage.set(apiErr?.mensaje ?? 'No fue posible completar el registro.');
          this.toast.showApiError(err);
        },
      });
  }
}
