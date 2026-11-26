import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';
import { AuthService } from './core/services/auth.service';
import { CarritoService } from './core/services/carrito.service';
import { SearchService } from './core/services/search.service';
import { ToastService } from './core/services/toast.service';
import { AuthModalComponent } from './shared/components/auth-modal/auth-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, AuthModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly carrito = inject(CarritoService);
  readonly search = inject(SearchService);
  readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly useMocks = environment.useMocks;

  readonly userInitials = computed(() => {
    const name = this.auth.user()?.nombre?.trim();
    if (!name) return 'TT';
    const parts = name.split(/\s+/);
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  });

  onSearchInput(value: string): void {
    this.search.setQuery(value);
    if (this.router.url !== '/' && !this.router.url.startsWith('/?')) {
      this.router.navigate(['/']);
    }
  }

  submitSearch(): void {
    if (this.router.url !== '/') {
      this.router.navigate(['/']);
    }
  }

  onSidebarAuthClick(): void {
    if (this.auth.isAuthenticated()) {
      this.auth.logout();
      this.toast.info('Sesión cerrada', 'Has salido de tu cuenta.');
    } else {
      this.auth.openModal('login');
    }
  }
}
