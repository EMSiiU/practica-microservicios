import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Producto } from '../../core/models/api.models';
import { CarritoService } from '../../core/services/carrito.service';
import { InventarioService } from '../../core/services/inventario.service';
import { ProductosService } from '../../core/services/productos.service';
import { ResenasService } from '../../core/services/resenas.service';
import { SearchService } from '../../core/services/search.service';
import { ToastService } from '../../core/services/toast.service';
import { MxnPipe } from '../../shared/pipes/mxn.pipe';

export interface ProductoCardVM {
  producto: Producto;
  disponible: number | null;
  promedio: number | null;
  totalResenas: number;
}

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [RouterLink, MxnPipe],
  templateUrl: './catalogo.component.html',
  styleUrl: './catalogo.component.css',
})
export class CatalogoComponent implements OnInit {
  private readonly productosService = inject(ProductosService);
  private readonly inventarioService = inject(InventarioService);
  private readonly resenasService = inject(ResenasService);
  private readonly carritoService = inject(CarritoService);
  private readonly searchService = inject(SearchService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly items = signal<ProductoCardVM[]>([]);
  readonly selectedCategory = signal<string>('Todos');
  readonly addingId = signal<number | null>(null);

  readonly categories = computed(() => {
    const unique = new Set(this.items().map((item) => item.producto.categoria));
    return ['Todos', ...Array.from(unique)];
  });

  readonly filteredItems = computed(() => {
    const category = this.selectedCategory();
    const query = this.searchService.query().trim().toLowerCase();

    return this.items().filter(({ producto }) => {
      const matchesCat = category === 'Todos' || producto.categoria === category;
      const matchesQuery =
        !query ||
        producto.nombre.toLowerCase().includes(query) ||
        producto.categoria.toLowerCase().includes(query) ||
        producto.descripcion.toLowerCase().includes(query);
      return matchesCat && matchesQuery;
    });
  });

  readonly featuredCards = computed(() => this.filteredItems().slice(0, 3));

  readonly listItems = computed(() => {
    const all = this.filteredItems();
    return all.length > 3 ? all.slice(3) : all;
  });

  readonly spotlightProduct = computed(() => {
    const all = this.filteredItems();
    if (all.length === 0) return null;
    return all.find((item) => item.producto.id === 12) ?? all[0];
  });

  ngOnInit(): void {
    this.cargarCatalogo();
  }

  cargarCatalogo(): void {
    this.loading.set(true);
    this.productosService.getProductos().subscribe({
      next: (productos) => {
        if (productos.length === 0) {
          this.items.set([]);
          this.loading.set(false);
          return;
        }

        const requests = productos.map((producto) =>
          forkJoin({
            inventario: this.inventarioService
              .getInventario(producto.id)
              .pipe(catchError(() => of(null))),
            resenas: this.resenasService
              .getResenasProducto(producto.id)
              .pipe(catchError(() => of({ producto_id: producto.id, promedio: null, resenas: [] }))),
          })
        );

        forkJoin(requests).subscribe({
          next: (details) => {
            const vms: ProductoCardVM[] = productos.map((producto, idx) => ({
              producto,
              disponible: details[idx].inventario?.disponible ?? null,
              promedio: details[idx].resenas.promedio,
              totalResenas: details[idx].resenas.resenas.length,
            }));
            this.items.set(vms);
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
          },
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.showApiError(err, 'No se pudo cargar el catálogo de productos.');
      },
    });
  }

  selectCategory(cat: string): void {
    this.selectedCategory.set(cat);
  }

  pastelClass(index: number): string {
    const classes = ['bg-pastel-yellow', 'bg-pastel-lilac', 'bg-pastel-sky'];
    return classes[index % classes.length];
  }

  stockPercent(disponible: number | null): number {
    if (disponible === null || disponible <= 0) return 0;
    return Math.min(100, Math.round((disponible / 15) * 100));
  }

  agregarRapido(vm: ProductoCardVM): void {
    if (vm.disponible !== null && vm.disponible <= 0) {
      this.toast.warning('Sin existencias', 'Este producto está agotado temporalmente.', 'STOCK_INSUFICIENTE');
      return;
    }

    this.addingId.set(vm.producto.id);
    this.carritoService.agregarProducto(vm.producto.id, 1).subscribe({
      next: () => {
        this.addingId.set(null);
        this.toast.success('Agregado al carrito', `${vm.producto.nombre} se añadió a tu carrito.`);
      },
      error: (err) => {
        this.addingId.set(null);
        if (err?.codigo !== 'NO_AUTENTICADO') {
          this.toast.showApiError(err);
        } else {
          this.toast.info('Inicia sesión', err.mensaje);
        }
      },
    });
  }
}
