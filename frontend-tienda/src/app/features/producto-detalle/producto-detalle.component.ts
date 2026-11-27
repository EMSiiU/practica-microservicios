import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Producto, Resena } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { CarritoService } from '../../core/services/carrito.service';
import { InventarioService } from '../../core/services/inventario.service';
import { PedidosService } from '../../core/services/pedidos.service';
import { ProductosService } from '../../core/services/productos.service';
import { ResenasService } from '../../core/services/resenas.service';
import { ToastService } from '../../core/services/toast.service';
import { MxnPipe } from '../../shared/pipes/mxn.pipe';

@Component({
  selector: 'app-producto-detalle',
  standalone: true,
  imports: [RouterLink, FormsModule, MxnPipe],
  templateUrl: './producto-detalle.component.html',
  styleUrl: './producto-detalle.component.css',
})
export class ProductoDetalleComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly productosService = inject(ProductosService);
  private readonly inventarioService = inject(InventarioService);
  private readonly resenasService = inject(ResenasService);
  private readonly pedidosService = inject(PedidosService);
  private readonly carritoService = inject(CarritoService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly producto = signal<Producto | null>(null);
  readonly disponible = signal<number | null>(null);
  readonly promedio = signal<number | null>(null);
  readonly resenas = signal<Resena[]>([]);

  readonly cantidad = signal(1);
  readonly addingToCart = signal(false);

  readonly calificacionForm = signal(5);
  comentarioForm = '';
  readonly submittingReview = signal(false);
  readonly reviewError = signal<string | null>(null);
  readonly checkingPurchase = signal(false);
  readonly haCompradoProducto = signal(false);

  readonly yaReseno = computed(() => {
    const uid = this.auth.user()?.id;
    if (!uid) return false;
    return this.resenas().some((r) => r.usuario_id === uid);
  });

  constructor() {
    effect(() => {
      const user = this.auth.user();
      const prod = this.producto();
      if (user && prod && user.rol === 'cliente') {
        this.verificarCompraUsuario(user.id, prod.id);
      } else {
        this.haCompradoProducto.set(false);
      }
    });
  }

  readonly stockPercent = computed(() => {
    const stock = this.disponible();
    if (stock === null || stock <= 0) return 0;
    return Math.min(100, Math.round((stock / 15) * 100));
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (!Number.isInteger(id) || id <= 0) {
        this.loading.set(false);
        this.producto.set(null);
        return;
      }
      this.cargarDetalle(id);
    });
  }

  cargarDetalle(productoId: number): void {
    this.loading.set(true);
    this.reviewError.set(null);
    this.cantidad.set(1);

    forkJoin({
      producto: this.productosService.getProducto(productoId).pipe(catchError(() => of(null))),
      inventario: this.inventarioService.getInventario(productoId).pipe(catchError(() => of(null))),
      resenas: this.resenasService
        .getResenasProducto(productoId)
        .pipe(catchError(() => of({ producto_id: productoId, promedio: null, resenas: [] }))),
    }).subscribe({
      next: ({ producto, inventario, resenas }) => {
        this.producto.set(producto);
        this.disponible.set(inventario?.disponible ?? null);
        this.promedio.set(resenas.promedio);
        this.resenas.set(resenas.resenas);
        this.loading.set(false);

        const user = this.auth.user();
        if (producto && user && user.rol === 'cliente') {
          this.verificarCompraUsuario(user.id, producto.id);
        }
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private verificarCompraUsuario(usuarioId: number, productoId: number): void {
    this.checkingPurchase.set(true);
    this.pedidosService.getPedidosUsuario(usuarioId).subscribe({
      next: (pedidos) => {
        const compro = pedidos.some(
          (p) =>
            (p.estado_pago === 'aprobado' || p.estado === 'pagado' || p.estado === 'enviado') &&
            p.items.some((it) => it.producto_id === productoId)
        );
        this.haCompradoProducto.set(compro);
        this.checkingPurchase.set(false);
      },
      error: () => {
        this.haCompradoProducto.set(false);
        this.checkingPurchase.set(false);
      },
    });
  }

  cambiarCantidad(delta: number): void {
    const maxStock = this.disponible();
    const next = this.cantidad() + delta;
    if (next < 1) return;
    if (maxStock !== null && maxStock > 0 && next > maxStock) return;
    this.cantidad.set(next);
  }

  agregarAlCarrito(): void {
    const prod = this.producto();
    if (!prod) return;

    this.addingToCart.set(true);
    this.carritoService.agregarProducto(prod.id, this.cantidad()).subscribe({
      next: () => {
        this.addingToCart.set(false);
        this.toast.success(
          'Producto agregado',
          `${this.cantidad()} × ${prod.nombre} agregado a tu carrito.`
        );
      },
      error: (err) => {
        this.addingToCart.set(false);
        if (err?.codigo === 'NO_AUTENTICADO') {
          this.toast.info('Inicia sesión', err.mensaje);
        } else {
          this.toast.showApiError(err);
        }
      },
    });
  }

  publicarResena(): void {
    const prod = this.producto();
    const user = this.auth.user();
    if (!prod || !user) {
      this.auth.openModal('login');
      return;
    }

    const comentario = this.comentarioForm.trim();
    if (!comentario) {
      this.reviewError.set('Escribe un comentario antes de enviar tu reseña.');
      return;
    }

    this.submittingReview.set(true);
    this.reviewError.set(null);

    this.resenasService
      .crearResena({
        producto_id: prod.id,
        usuario_id: user.id,
        calificacion: this.calificacionForm(),
        comentario,
      })
      .subscribe({
        next: () => {
          this.submittingReview.set(false);
          this.comentarioForm = '';
          this.toast.success('Reseña publicada', 'Gracias por compartir tu opinión.');
          this.resenasService.getResenasProducto(prod.id).subscribe({
            next: (res) => {
              this.promedio.set(res.promedio);
              this.resenas.set(res.resenas);
            },
          });
        },
        error: (err) => {
          this.submittingReview.set(false);
          const apiErr = this.toast.extractApiError(err);
          this.reviewError.set(apiErr?.mensaje ?? 'No se pudo publicar la reseña.');
          this.toast.showApiError(err);
        },
      });
  }

  starsArray(rating: number): number[] {
    return Array.from({ length: 5 }, (_, idx) => (idx < rating ? 1 : 0));
  }
}
